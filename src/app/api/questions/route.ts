import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getQuestions, createQuestion } from '@/lib/data';
import { getAuthUser, unauthorized, forbidden } from '@/lib/api-auth';

const createQuestionSchema = z.object({
  examId: z.string(),
  type: z.enum(['mcq', 'mrq', 'true_false', 'short_answer', 'essay', 'fill_blank', 'matching', 'ordering']),
  stem: z.string().min(1),
  marks: z.number().min(0),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  order: z.number(),
  options: z.array(z.object({ id: z.string(), text: z.string(), isCorrect: z.boolean() })).optional(),
  correctAnswer: z.union([z.string(), z.array(z.string())]).optional(),
  explanation: z.string().optional(),
});

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const examId = searchParams.get('examId');
  if (!examId) return NextResponse.json({ error: 'examId required' }, { status: 400 });
  const questions = await getQuestions(examId);
  return NextResponse.json(questions);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role === 'student') return forbidden();

  const body = await request.json();
  const parsed = createQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const question = await createQuestion(parsed.data);
  return NextResponse.json(question, { status: 201 });
}
