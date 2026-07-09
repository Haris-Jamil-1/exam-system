import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, notFound, forbidden, withErrorHandling } from '@/lib/api-auth';

export const POST = withErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ attemptId: string; sectionId: string }> }
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { attemptId, sectionId } = await params;

  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return notFound('Attempt not found');
  if (attempt.studentId !== user.id) return forbidden();
  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 });
  }

  const section = await prisma.examSection.findUnique({ where: { id: sectionId } });
  if (!section || section.examId !== attempt.examId) return notFound('Section not found');

  // Server-side enforcement of "Lock Completed Sections" — the student UI already hides/disables
  // access to a locked section, but a direct API call must be blocked too, the same way every
  // other client-side-only gate in this app has needed a server-side backstop.
  const exam = await prisma.exam.findUnique({ where: { id: attempt.examId }, select: { settings: true } });
  const isSectionSequential = !!(exam?.settings as { isSectionSequential?: boolean } | null)?.isSectionSequential;
  if (isSectionSequential) {
    const priorSections = await prisma.examSection.findMany({
      where: { examId: attempt.examId, orderIndex: { lt: section.orderIndex } },
      select: { id: true },
    });
    if (priorSections.length > 0) {
      const priorAttempts = await prisma.sectionAttempt.findMany({
        where: { attemptId, sectionId: { in: priorSections.map(s => s.id) } },
        select: { sectionId: true, status: true },
      });
      const submittedIds = new Set(priorAttempts.filter(a => a.status !== 'in_progress').map(a => a.sectionId));
      const allPriorSubmitted = priorSections.every(s => submittedIds.has(s.id));
      if (!allPriorSubmitted) {
        return NextResponse.json({ error: 'Complete the previous section first' }, { status: 403 });
      }
    }
  }

  // Upsert: resuming a section already in progress must not reset its timer.
  const sectionAttempt = await prisma.sectionAttempt.upsert({
    where: { attemptId_sectionId: { attemptId, sectionId } },
    create: { attemptId, sectionId, status: 'in_progress', startedAt: new Date() },
    update: {},
  });

  return NextResponse.json({
    id: sectionAttempt.id,
    sectionId: sectionAttempt.sectionId,
    status: sectionAttempt.status,
    startedAt: sectionAttempt.startedAt?.toISOString() ?? null,
  }, { status: 201 });
});
