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

  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { duration: true, endTime: true } });

  // OR [attemptId: null, attemptId: this attempt] — the exam's fixed/shared questions plus
  // this one attempt's own privately-drawn stratified-pooled questions (if any), never
  // another student's. Scoring against a bare `{ examId }` filter would either score a pooled
  // exam's student against the entire item-derived question superset, or (for a non-pooled
  // exam once any other student's pooled questions somehow existed) mix in unrelated rows.
  const questionRows = await prisma.question.findMany({
    where: { examId, OR: [{ attemptId: null }, { attemptId }] },
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

  // Availability window vs. duration: the deadline is whichever comes first — the student's
  // duration limit from their own startedAt, or the exam's global availableTo (endTime).
  // Independently recomputed here (not trusted from the client) so the recorded status
  // reflects reality even if the client's own timer never fired.
  let status: 'submitted' | 'auto_submitted' = 'submitted';
  if (exam) {
    const durationDeadlineMs = attempt.startedAt.getTime() + exam.duration * 60_000;
    const deadlineMs = Math.min(durationDeadlineMs, exam.endTime.getTime());
    const GRACE_MS = 5000; // network/client-timer latency allowance
    if (Date.now() > deadlineMs + GRACE_MS) status = 'auto_submitted';
  }

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
        status,
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
    status,
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
