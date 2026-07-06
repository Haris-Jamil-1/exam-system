import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getQuestions, createQuestion, getExamById } from '@/lib/data';
import { getQuestionsForStudent } from '@/lib/data/questions';
import { getAuthUser, unauthorized, notFound, forbidden, withErrorHandling } from '@/lib/api-auth';

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

  // Teachers/admins may only read questions for exams in their own institution
  // (teachers additionally restricted to exams they own).
  if (user.role !== 'student') {
    const exam = await getExamById(examId);
    if (!exam || exam.institutionId !== user.institutionId) return notFound();
    if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();
  }

  // Students must not receive correct answers or explanations
  const questions = user.role === 'student'
    ? await getQuestionsForStudent(examId)
    : await getQuestions(examId);
  return NextResponse.json(questions);
}

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role === 'student') return forbidden();

  const body = await request.json();
  const parsed = createQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Only allow adding questions to exams within the caller's institution
  // (teachers additionally restricted to exams they own).
  const exam = await getExamById(parsed.data.examId);
  if (!exam || exam.institutionId !== user.institutionId) return notFound();
  if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();

  const question = await createQuestion(parsed.data);
  return NextResponse.json(question, { status: 201 });
});
