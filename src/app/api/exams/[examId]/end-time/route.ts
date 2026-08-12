import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, notFound, forbidden, withErrorHandling } from '@/lib/api-auth';
import { computeEffectiveExamStatus } from '@/lib/exam-status';

// Mid-exam Exam.endTime change from the live monitor screen (2026-08-12). Deliberately its own
// route rather than folded into PUT /api/exams/[examId]: that route blocks any startTime/
// endTime/duration edit once an exam is effectively live (see its own comment) — this is the
// one, narrow, audited exception to that rule, only reachable while the exam IS live, only
// ever touching endTime, and only ever notifying currently in_progress attempts.

const bodySchema = z.object({ newEndTime: z.string() });

export const PATCH = withErrorHandling(async (request: Request, { params }: { params: Promise<{ examId: string }> }) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'teacher' && user.role !== 'admin') return forbidden();

  const { examId } = await params;
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return notFound('Exam not found');
  if (exam.institutionId !== user.institutionId) return notFound('Exam not found');
  if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();

  const effectiveStatus = computeEffectiveExamStatus(exam.status, exam.startTime, new Date(), exam.endTime);
  if (effectiveStatus !== 'live') {
    return NextResponse.json(
      { error: 'not_live', message: 'This exam is not currently in progress — use the Edit screen to change its schedule instead.' },
      { status: 409 },
    );
  }

  const newEndTime = new Date(parsed.data.newEndTime);
  const now = new Date();
  if (Number.isNaN(newEndTime.getTime()) || newEndTime.getTime() <= now.getTime()) {
    return NextResponse.json({ error: 'invalid_end_time', message: 'New end time must be in the future.' }, { status: 400 });
  }

  const oldEndTime = exam.endTime;

  // Only in_progress attempts get notified — an already-submitted/auto_submitted student must
  // never be un-submitted or have their finalized state touched by this. Nothing else in this
  // codebase re-touches a finalized ExamAttempt based on a change to the parent Exam row (the
  // submit/force-finalize routes both gate on status === 'in_progress' before writing), so this
  // read is itself the only thing that needs to get that filter right.
  const activeAttempts = await prisma.examAttempt.findMany({
    where: { examId, status: 'in_progress' },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.exam.update({ where: { id: examId }, data: { endTime: newEndTime } }),
    prisma.examTimeChange.create({
      data: { examId, changedById: user.id, oldEndTime, newEndTime },
    }),
    ...(activeAttempts.length > 0
      ? [
          prisma.monitorDirective.createMany({
            data: activeAttempts.map(a => ({
              attemptId: a.id,
              kind: 'time_extended' as const,
              message: JSON.stringify({ oldEndTime: oldEndTime.toISOString(), newEndTime: newEndTime.toISOString() }),
              requestedById: user.id,
            })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({
    oldEndTime: oldEndTime.toISOString(),
    newEndTime: newEndTime.toISOString(),
    notifiedStudents: activeAttempts.length,
  });
});

export async function GET(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'teacher' && user.role !== 'admin') return forbidden();

  const { examId } = await params;
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { institutionId: true, teacherId: true } });
  if (!exam) return notFound('Exam not found');
  if (exam.institutionId !== user.institutionId) return notFound('Exam not found');
  if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit')) || 10, 50);

  const changes = await prisma.examTimeChange.findMany({
    where: { examId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { changedBy: { select: { name: true } } },
  });

  return NextResponse.json(
    changes.map(c => ({
      id: c.id,
      oldEndTime: c.oldEndTime.toISOString(),
      newEndTime: c.newEndTime.toISOString(),
      changedByName: c.changedBy.name,
      createdAt: c.createdAt.toISOString(),
    })),
  );
}
