import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, notFound, forbidden } from '@/lib/api-auth';
import type { Question } from '@/types';

const submitSchema = z.object({
  examId: z.string(),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  trustScore: z.number().min(0).max(100).default(100),
});

function scoreAnswers(questions: Question[], answers: Record<string, string | string[]>) {
  let score = 0;
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const perQuestion: Array<{ questionId: string; response: string | string[]; isCorrect: boolean; marksAwarded: number }> = [];

  for (const q of questions) {
    const answer = answers[q.id];
    const response = answer ?? '';
    if (!answer || !q.correctAnswer) {
      perQuestion.push({ questionId: q.id, response, isCorrect: false, marksAwarded: 0 });
      continue;
    }

    let correct = false;
    switch (q.type) {
      case 'mcq':
      case 'true_false':
        correct = answer === q.correctAnswer;
        break;
      case 'fill_blank':
      case 'short_answer':
        correct =
          typeof answer === 'string' &&
          typeof q.correctAnswer === 'string' &&
          answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
        break;
      case 'mrq':
      case 'matching':
        if (Array.isArray(answer) && Array.isArray(q.correctAnswer)) {
          correct =
            answer.length === q.correctAnswer.length &&
            [...answer].sort().join(',') === [...q.correctAnswer].sort().join(',');
        }
        break;
      case 'ordering':
        if (Array.isArray(answer) && Array.isArray(q.correctAnswer)) {
          correct =
            answer.length === q.correctAnswer.length &&
            answer.join(',') === q.correctAnswer.join(',');
        }
        break;
      case 'essay':
      case 'coding':
      case 'file_upload':
        // Manual / async grading — mark pending
        correct = false;
        break;
    }

    const marksAwarded = correct ? q.marks : 0;
    score += marksAwarded;
    perQuestion.push({ questionId: q.id, response, isCorrect: correct, marksAwarded });
  }

  return { score, totalMarks, perQuestion };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { attemptId } = await params;
  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { examId, answers, trustScore } = parsed.data;

  // Verify attempt belongs to this student
  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return notFound('Attempt not found');
  if (attempt.studentId !== user.id) return forbidden();
  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 });
  }

  // Load questions with full answer keys server-side
  const questionRows = await prisma.question.findMany({
    where: { examId },
    orderBy: { order: 'asc' },
    include: { options: { orderBy: { order: 'asc' } } },
  });

  const questions: Question[] = questionRows.map(q => ({
    id: q.id,
    examId: q.examId,
    type: q.type as Question['type'],
    stem: q.stem,
    marks: q.marks,
    difficulty: q.difficulty as Question['difficulty'],
    order: q.order,
    required: q.required,
    explanation: q.explanation ?? undefined,
    correctAnswer: q.correctAnswer as string | string[] | undefined,
    options: q.options.map(o => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
  }));

  const { score, totalMarks, perQuestion } = scoreAnswers(questions, answers);

  // Get real violation count from DB
  const violationCount = await prisma.violation.count({ where: { attemptId } });
  const scorePercentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;

  // Persist answers + update attempt atomically
  await prisma.$transaction([
    // Upsert each answer
    ...perQuestion.map(a =>
      prisma.answer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
        create: {
          attemptId,
          questionId: a.questionId,
          response: Array.isArray(a.response) ? a.response : a.response,
          isCorrect: a.isCorrect,
          marksAwarded: a.marksAwarded,
          gradedAt: new Date(),
        },
        update: {
          response: Array.isArray(a.response) ? a.response : a.response,
          isCorrect: a.isCorrect,
          marksAwarded: a.marksAwarded,
          gradedAt: new Date(),
        },
      })
    ),
    // Mark attempt as submitted
    prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
        score,
        totalMarks,
        scorePercentage,
        trustScore,
        violationCount,
      },
    }),
  ]);

  return NextResponse.json({
    id: attemptId,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
    score,
    totalMarks,
    scorePercentage,
    trustScore,
    violationCount,
  });
}
