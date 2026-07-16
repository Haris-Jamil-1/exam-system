import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, notFound, forbidden, withErrorHandling } from '@/lib/api-auth';
import type { ExamSettings } from '@/types';

const lockSchema = z.object({
  response: z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())]).optional(),
});

// Phase 7: the only server-side enforcement surface for Exam.settings.isItemSequential (see
// the ItemLock model comment in schema.prisma for why this exists at all). The client calls
// this exactly once per question, the moment the student advances past it. A second call for
// the same question is the direct test of "can't re-edit a past-answered item" — it's rejected
// outright, independent of whatever the eventual bulk submit payload claims.
export const POST = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ attemptId: string; questionId: string }> },
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'student') return forbidden();

  const { attemptId, questionId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = lockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return notFound('Attempt not found');
  if (attempt.studentId !== user.id) return forbidden();
  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 });
  }

  const exam = await prisma.exam.findUnique({ where: { id: attempt.examId }, select: { settings: true } });
  if (!exam) return notFound('Exam not found');
  const settings = exam.settings as unknown as ExamSettings;
  if (!settings?.isItemSequential) {
    return NextResponse.json({ error: 'not_applicable', message: 'This exam does not use sequential item locking.' }, { status: 400 });
  }

  // Question must actually belong to this attempt's visible set — the exam's shared questions,
  // or (for a pooled exam) this one attempt's own privately-materialized questions. Never
  // another student's pooled question, never another exam's question.
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: { examId: true, attemptId: true },
  });
  if (!question || question.examId !== attempt.examId || (question.attemptId !== null && question.attemptId !== attemptId)) {
    return notFound('Question not found');
  }

  const existing = await prisma.itemLock.findUnique({
    where: { attemptId_questionId: { attemptId, questionId } },
  });
  if (existing) {
    return NextResponse.json({ error: 'item_locked', message: 'This item is locked and cannot be re-edited.' }, { status: 403 });
  }

  const lock = await prisma.itemLock.create({
    data: { attemptId, questionId, response: parsed.data.response as object | undefined },
  });

  return NextResponse.json({ questionId, lockedAt: lock.lockedAt.toISOString() }, { status: 201 });
});
