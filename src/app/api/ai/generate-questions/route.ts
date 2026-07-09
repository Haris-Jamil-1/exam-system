import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateQuestions } from '@/lib/ai/question-generator';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';
import { getCallerAndBankPermission } from '@/lib/data/item-banks';
import { canEdit as bankCanEdit } from '@/lib/item-bank-permissions';
import { prisma } from '@/lib/prisma';
import type { QuestionType } from '@/types';

const schema = z.object({
  text: z.string().min(10),
  count: z.number().min(1).max(20).default(5),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  type: z.enum(['mcq', 'mrq', 'true_false', 'short_answer', 'essay', 'fill_blank', 'matching', 'ordering']).default('mcq'),
  itemBankId: z.string().min(1),
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { itemBankId, ...genInput } = parsed.data;

  const permission = await getCallerAndBankPermission(itemBankId);
  if (!permission) return notFound('Item bank not found');
  if (!bankCanEdit(permission.role)) return forbidden();

  // Phase 3: call Anthropic API here using @anthropic-ai/sdk
  // import Anthropic from '@anthropic-ai/sdk';
  // const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // const response = await client.messages.create({ model: 'claude-sonnet-4-6', ... });
  const generated = generateQuestions(genInput as { text: string; count: number; difficulty: 'easy' | 'medium' | 'hard'; type: QuestionType });

  // Direct save: generated questions are committed straight to the Item table under this
  // bank, as drafts (matching the manual "Add Question" default) — the teacher reviews,
  // edits, and submits them for approval from the bank view like any other item.
  const created = await prisma.$transaction(
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
