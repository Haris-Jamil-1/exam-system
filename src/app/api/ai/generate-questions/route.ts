import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateQuestions } from '@/lib/ai/question-generator';
import { getAuthUser, unauthorized, withErrorHandling } from '@/lib/api-auth';
import type { QuestionType } from '@/types';

const schema = z.object({
  text: z.string().min(10),
  count: z.number().min(1).max(20).default(5),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  type: z.enum(['mcq', 'mrq', 'true_false', 'short_answer', 'essay', 'fill_blank', 'matching', 'ordering']).default('mcq'),
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // Phase 3: call Anthropic API here using @anthropic-ai/sdk
  // import Anthropic from '@anthropic-ai/sdk';
  // const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // const response = await client.messages.create({ model: 'claude-sonnet-4-6', ... });
  const questions = generateQuestions(parsed.data as { text: string; count: number; difficulty: 'easy' | 'medium' | 'hard'; type: QuestionType });
  return NextResponse.json({ questions });
});
