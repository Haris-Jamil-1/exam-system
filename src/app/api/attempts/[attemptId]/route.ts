import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, notFound, forbidden, withErrorHandling } from '@/lib/api-auth';

export async function GET(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { attemptId } = await params;
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    include: { answers: { include: { question: { select: { stem: true, type: true, marks: true } } } } },
  });
  if (!attempt) return notFound();

  // Students can only read their own attempts; teachers/admins are scoped to
  // their own institution (teachers additionally to exams they own).
  if (user.role === 'student') {
    if (attempt.studentId !== user.id) return notFound();
  } else {
    const exam = await prisma.exam.findUnique({ where: { id: attempt.examId }, select: { institutionId: true, teacherId: true } });
    if (!exam || exam.institutionId !== user.institutionId) return notFound();
    if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();
  }

  return NextResponse.json({
    id: attempt.id,
    examId: attempt.examId,
    studentId: attempt.studentId,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString(),
    score: attempt.score,
    totalMarks: attempt.totalMarks,
    scorePercentage: attempt.scorePercentage,
    trustScore: attempt.trustScore,
    violationCount: attempt.violationCount,
    // Safe to return: no correctAnswer/isCorrect leakage, only what was earned —
    // mirrors the shape already returned by POST /api/attempts/[id]/submit.
    perQuestion: attempt.answers.map(a => ({
      questionId: a.questionId,
      stem: a.question.stem,
      type: a.question.type,
      marks: a.question.marks,
      marksAwarded: a.marksAwarded,
    })),
  });
}

const updateSchema = z.object({
  trustScore: z.number().min(0).max(100).optional(),
  violationCount: z.number().min(0).optional(),
});

export const PUT = withErrorHandling(async (request: Request, { params }: { params: Promise<{ attemptId: string }> }) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  // Only teachers and admins may update trustScore/violationCount (e.g. manual review)
  if (user.role === 'student') return forbidden();

  const { attemptId } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return notFound();

  // Teachers/admins are scoped to their own institution (teachers additionally
  // to exams they own) — prevents cross-tenant trustScore/violationCount tampering.
  const exam = await prisma.exam.findUnique({ where: { id: attempt.examId }, select: { institutionId: true, teacherId: true } });
  if (!exam || exam.institutionId !== user.institutionId) return notFound();
  if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();

  const updated = await prisma.examAttempt.update({
    where: { id: attemptId },
    data: {
      ...(parsed.data.trustScore !== undefined && { trustScore: parsed.data.trustScore }),
      ...(parsed.data.violationCount !== undefined && { violationCount: parsed.data.violationCount }),
    },
  });

  return NextResponse.json({ id: updated.id, trustScore: updated.trustScore, violationCount: updated.violationCount });
});
