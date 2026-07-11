import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';
import { computeTrustScore, type TrustScoreInput } from '@/lib/trust-score';

// Server-side finalization of a dead attempt (Phase 3, doc 04). The normal
// force-submit path is a MonitorDirective that makes the live client submit
// its answers; when the client is gone (crashed tab, lost machine) this
// endpoint closes the attempt with whatever exists server-side — answers were
// never received, so the score is 0 and the status is auto_submitted. This is
// deliberately a second, explicit teacher action, never automatic.

const schema = z.object({ attemptId: z.string() });

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'teacher' && user.role !== 'admin') return forbidden();

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const attempt = await prisma.examAttempt.findUnique({
    where: { id: parsed.data.attemptId },
    select: {
      id: true,
      status: true,
      examId: true,
      exam: { select: { teacherId: true, institutionId: true } },
    },
  });
  if (!attempt) return notFound('Attempt not found');
  if (attempt.exam.institutionId !== user.institutionId) return forbidden();
  if (user.role === 'teacher' && attempt.exam.teacherId !== user.id) return forbidden();
  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Attempt is not in progress' }, { status: 409 });
  }

  const [violations, questions] = await Promise.all([
    prisma.violation.findMany({
      where: { attemptId: attempt.id },
      select: { type: true, severity: true, confidence: true, timestamp: true, endedAt: true },
    }),
    prisma.question.findMany({
      where: { examId: attempt.examId, OR: [{ attemptId: null }, { attemptId: attempt.id }] },
      select: { marks: true },
    }),
  ]);

  const updated = await prisma.examAttempt.update({
    where: { id: attempt.id },
    data: {
      status: 'auto_submitted',
      submittedAt: new Date(),
      score: 0,
      totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
      scorePercentage: 0,
      trustScore: computeTrustScore(violations as TrustScoreInput[]),
      violationCount: violations.length,
    },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
});
