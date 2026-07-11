import { prisma } from '@/lib/prisma';
import { generateItems } from './claude-generator';
import { resolveBankPermission, canEdit, type CallerContext } from '@/lib/item-bank-permissions';
import type { QuestionType } from '@/types';

// Async generation job runner (Phase 3, doc 02 / decision 6). Runs as Vercel
// background work (`after()` in the route) — the GenerationJob row is the
// durability mechanism, this runtime is disposable: a crashed run leaves the
// row `running`, and the staleness sweep in the jobs GET marks it failed.

const DUPLICATE_SIMILARITY = 0.6;
const DUPLICATE_TAG = 'ai-possible-duplicate';
export const JOB_STALE_MS = 5 * 60 * 1000;

interface StoredPromptParams {
  text: string;
  count: number;
  difficulty: 'easy' | 'medium' | 'hard';
  type: QuestionType;
  cloText?: string;
}

export async function runGenerationJob(jobId: string): Promise<void> {
  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    include: { bank: { select: { id: true, bankLevel: true, ownerId: true, institutionId: true } } },
  });
  if (!job || job.status !== 'queued') return;

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    // Re-verify permission at execution time, not just enqueue time — the job
    // is async now, so access could have been revoked in between (doc 02).
    const requester = await prisma.user.findUnique({
      where: { id: job.requestedById },
      select: { id: true, institutionId: true, role: true },
    });
    const access = requester
      ? await prisma.itemBankAccess.findFirst({
          where: { bankId: job.itemBankId, userId: requester.id },
          select: { permissionRole: true },
        })
      : null;
    const role = requester
      ? resolveBankPermission(
          job.bank,
          requester as CallerContext,
          (access?.permissionRole as 'owner' | 'editor' | 'viewer' | undefined) ?? null,
        )
      : null;
    if (!canEdit(role)) {
      throw new Error('Requester no longer has editor access to the target bank');
    }

    const params = job.promptParams as unknown as StoredPromptParams;

    // Prompt-side dup avoidance: most recent approved stems in this bank
    // (same CLO when one is set), capped at 30 (doc 02).
    const existing = await prisma.item.findMany({
      where: {
        bankId: job.itemBankId,
        status: 'approved',
        ...(job.learningObjectiveId && { learningObjectiveId: job.learningObjectiveId }),
      },
      select: { stem: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    const result = await generateItems({
      ...params,
      existingStems: existing.map(e => e.stem),
    });

    // Independent creates, not a transaction — a partial batch of drafts is
    // harmless (same reasoning as the item-7 fix; teacher reviews what landed).
    const settled = await Promise.allSettled(
      result.items.map(async q => {
        // Post-generation dedup layer: trigram similarity against the bank's
        // existing stems. Flagged via tag, never silently dropped — the
        // teacher decides in review (doc 02).
        const similar = await prisma.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Item"
          WHERE "bankId" = ${job.itemBankId}
            AND similarity(stem, ${q.stem}) > ${DUPLICATE_SIMILARITY}
          LIMIT 1
        `;
        return prisma.item.create({
          data: {
            type: q.type,
            stem: q.stem,
            marks: q.marks,
            difficulty: q.difficulty,
            order: 0,
            status: 'draft',
            tags: similar.length > 0 ? [DUPLICATE_TAG] : [],
            correctAnswer: q.correctAnswer as object,
            explanation: q.explanation ?? null,
            authorId: job.requestedById,
            institutionId: job.institutionId,
            bankId: job.itemBankId,
            learningObjectiveId: job.learningObjectiveId,
            aiGenerated: true,
            generationJobId: job.id,
            options: q.options?.length
              ? {
                  create: q.options.map((text, i) => ({
                    text,
                    isCorrect:
                      text === q.correctAnswer ||
                      (Array.isArray(q.correctAnswer) && q.correctAnswer.includes(text)),
                    order: i,
                  })),
                }
              : undefined,
          },
        });
      }),
    );

    const produced = settled.filter(s => s.status === 'fulfilled').length;
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: produced === 0 ? 'failed' : produced < job.requestedCount ? 'partial' : 'succeeded',
        producedCount: produced,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        finishedAt: new Date(),
        ...(produced === 0 && { error: 'No items could be created' }),
      },
    });
  } catch (err) {
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown generation error',
        finishedAt: new Date(),
      },
    });
  }
}
