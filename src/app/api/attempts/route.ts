import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden } from '@/lib/api-auth';

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
