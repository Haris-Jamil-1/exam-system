import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateQuestions } from '@/lib/ai/question-generator';
import { MAX_BATCH_SIZE } from '@/lib/ai/constants';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';
import { getCallerAndBankPermission } from '@/lib/data/item-banks';
import { canEdit as bankCanEdit } from '@/lib/item-bank-permissions';
import { prisma } from '@/lib/prisma';
import type { QuestionType } from '@/types';

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

  // Phase 3: call Anthropic API here using @anthropic-ai/sdk
  // import Anthropic from '@anthropic-ai/sdk';
  // const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // const systemPrompt = cloText
  //   ? `${basePrompt}\n\nThe generated questions must strictly align with and accurately ` +
  //     `assess the following Course Learning Objective: ${cloText}. Ensure distractors ` +
  //     `reflect common student misconceptions related to this specific objective.`
  //   : basePrompt;
  // const response = await client.messages.create({ model: 'claude-sonnet-4-6', system: systemPrompt, ... });
  const generated = generateQuestions({ ...genInput, cloText } as {
    text: string; count: number; difficulty: 'easy' | 'medium' | 'hard'; type: QuestionType; cloText?: string;
  });

  // Direct save: generated questions are committed straight to the Item table under this
  // bank, as drafts (matching the manual "Add Question" default) — the teacher reviews,
  // edits, and submits them for approval from the bank view like any other item.
  //
  // Deliberately NOT wrapped in prisma.$transaction: each Item is independent (no
  // cross-row invariant needs atomicity — a partially-succeeded batch of drafts is
  // harmless, the teacher just reviews or deletes what landed), and a shared transaction's
  // default 5s interactive-transaction timeout is comfortably exceeded by a MAX_BATCH_SIZE
  // (15) batch of sequential creates once real network latency is in play — confirmed by
  // reproducing a hard 500 on a batch of 8 during QA. Plain concurrent creates have no such
  // ceiling.
  const created = await Promise.all(
    generated.map(q =>
      prisma.item.create({
        data: {
          type: q.type,
          stem: q.stem,
          marks: q.marks,
          difficulty: q.difficulty,
          order: 0,
          status: 'draft',
          tags: [],
          correctAnswer: q.correctAnswer as object,
          explanation: q.explanation ?? null,
          authorId: user.id,
          institutionId: permission.bank.institutionId,
          bankId: itemBankId,
          learningObjectiveId: learningObjectiveId ?? null,
          options: q.options?.length
            ? { create: q.options.map((text, i) => ({ text, isCorrect: text === q.correctAnswer || (Array.isArray(q.correctAnswer) && q.correctAnswer.includes(text)), order: i })) }
            : undefined,
        },
        include: { options: { orderBy: { order: 'asc' } } },
      })
    )
  );

  return NextResponse.json({ items: created });
});
