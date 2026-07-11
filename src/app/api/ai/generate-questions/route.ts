import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import { MAX_BATCH_SIZE } from '@/lib/ai/constants';
import { consumeAiQuota, AiQuotaExceededError } from '@/lib/ai/quota';
import { runGenerationJob } from '@/lib/ai/generation-job';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';
import { getCallerAndBankPermission } from '@/lib/data/item-banks';
import { canEdit as bankCanEdit } from '@/lib/item-bank-permissions';
import { prisma } from '@/lib/prisma';

// Phase 3 (doc 02): generation is asynchronous. This route validates, checks
// the per-institution AI quota (decision 5, hard stop), creates a
// GenerationJob row, and schedules the actual generation as Vercel background
// work (decision 6) — responding 202 { jobId } immediately. The client polls
// GET /api/ai/jobs/[jobId]. Items land in the bank as drafts; nothing AI-made
// reaches a student without teacher approval (ItemStatus lifecycle).

const schema = z.object({
  text: z.string().min(10),
  count: z.number().min(1).max(MAX_BATCH_SIZE).default(5),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  type: z.enum(['mcq', 'mrq', 'true_false', 'short_answer', 'essay', 'fill_blank', 'matching', 'ordering']).default('mcq'),
  itemBankId: z.string().min(1),
  learningObjectiveId: z.string().min(1).optional(),
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // Covers the batch-size cap too: a `count` above MAX_BATCH_SIZE fails z.number().max()
    // and lands here as a structured 400, never reaching the generation/persistence logic.
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { itemBankId, learningObjectiveId, ...genInput } = parsed.data;

  const permission = await getCallerAndBankPermission(itemBankId);
  if (!permission) return notFound('Item bank not found');
  if (!bankCanEdit(permission.role)) return forbidden();

  // Resolve CLO_ID -> its actual text before prompting, and verify it belongs to the same
  // institution as the bank — LearningObjective lookups have no institution scoping of their
  // own (Course carries institutionId, CLO only cascades to it via topic->course), so this is
  // the one place that has to check it explicitly to avoid leaking another institution's CLO
  // text into a generation prompt.
  let cloText: string | undefined;
  if (learningObjectiveId) {
    const clo = await prisma.learningObjective.findUnique({
      where: { id: learningObjectiveId },
      include: { topic: { include: { course: true } } },
    });
    if (!clo || clo.topic.course.institutionId !== permission.bank.institutionId) {
      return NextResponse.json({ error: 'Invalid learningObjectiveId' }, { status: 400 });
    }
    cloText = clo.text;
  }

  // Hard stop at the monthly institution quota — checked before any job exists.
  try {
    await consumeAiQuota(permission.bank.institutionId, 1);
  } catch (err) {
    if (err instanceof AiQuotaExceededError) {
      return NextResponse.json(
        { error: `Monthly AI quota reached (${err.used}/${err.quota}). Contact your administrator.` },
        { status: 429 },
      );
    }
    throw err;
  }

  const job = await prisma.generationJob.create({
    data: {
      institutionId: permission.bank.institutionId,
      requestedById: user.id,
      itemBankId,
      learningObjectiveId: learningObjectiveId ?? null,
      requestedCount: genInput.count,
      promptParams: { ...genInput, cloText },
    },
  });

  // Vercel background work: runs after the response is sent, within this
  // function invocation's lifetime. The job row is the durability mechanism —
  // if this runtime dies, the staleness sweep marks the job failed.
  after(() => runGenerationJob(job.id));

  return NextResponse.json({ jobId: job.id, status: 'queued' }, { status: 202 });
});
