import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, notFound, forbidden } from '@/lib/api-auth';

const startSchema = z.object({ examId: z.string() });

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  // Only students take exams
  if (user.role !== 'student') return forbidden();

  const body = await request.json();
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { examId } = parsed.data;

  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { startTime: true, endTime: true, status: true } });
  if (!exam) return notFound();

  // Only gate a brand-new attempt behind the scheduled window — an attempt
  // that already exists may always be resumed (e.g. to finish submitting
  // right at the boundary). This is enforced here, not just in the
  // exam-taking UI's waiting room, since that client-side check is trivially
  // bypassed with a direct API call.
  const existing = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId: user.id } },
  });
  if (!existing) {
    const now = new Date();
    // A teacher going live early (status 'live') intentionally overrides the
    // scheduled startTime — mirrors the client's waiting-room override logic.
    if (now < exam.startTime && exam.status !== 'live') {
      return NextResponse.json({ error: 'not_started', message: 'This exam has not started yet.' }, { status: 403 });
    }
    if (now > exam.endTime) {
      return NextResponse.json({ error: 'exam_ended', message: 'This exam has already ended.' }, { status: 403 });
    }
  }

  // Auto-enroll student so teacher can see them in results
  await prisma.examEnrollment.upsert({
    where: { examId_studentId: { examId, studentId: user.id } },
    create: { examId, studentId: user.id },
    update: {},
  });

  // Upsert: if student already has an attempt for this exam, return it (resume flow)
  const attempt = await prisma.examAttempt.upsert({
    where: { examId_studentId: { examId, studentId: user.id } },
    create: { examId, studentId: user.id, status: 'in_progress' },
    update: {},
  });

  return NextResponse.json({
    id: attempt.id,
    examId: attempt.examId,
    studentId: attempt.studentId,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    trustScore: attempt.trustScore,
    violationCount: attempt.violationCount,
  }, { status: 201 });
}
