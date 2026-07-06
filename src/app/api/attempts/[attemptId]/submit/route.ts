import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, notFound, forbidden, withErrorHandling } from '@/lib/api-auth';
import { scoreAnswers } from '@/lib/scoring';
import type { Question } from '@/types';

const submitSchema = z.object({
  examId: z.string(),
  // Matching questions send { [leftOptionId]: selectedRightText }; all others send string | string[].
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())])),
  // trustScore is NOT accepted from client — calculated server-side from violation count
});

export const POST = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { attemptId } = await params;
  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { examId, answers } = parsed.data;

  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return notFound('Attempt not found');
  if (attempt.studentId !== user.id) return forbidden();
  if (attempt.examId !== examId) return forbidden();
  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 });
  }

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

  const violationCount = await prisma.violation.count({ where: { attemptId } });
  const trustScore = Math.max(0, 100 - violationCount * 15);
  const scorePercentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;

  await prisma.$transaction([
    ...perQuestion.map(a =>
      prisma.answer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
        create: {
          attemptId,
          questionId: a.questionId,
          response: a.response as object,
          isCorrect: a.isCorrect,
          marksAwarded: a.marksAwarded,
          gradedAt: new Date(),
        },
        update: {
          response: a.response as object,
          isCorrect: a.isCorrect,
          marksAwarded: a.marksAwarded,
          gradedAt: new Date(),
        },
      })
    ),
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
    // Safe to return: no correctAnswer or isCorrect leakage, only what student earned
    perQuestion: perQuestion.map(({ questionId, stem, type, marks, marksAwarded }) => ({
      questionId, stem, type, marks, marksAwarded,
    })),
  });
});
