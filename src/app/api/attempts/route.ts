import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized } from '@/lib/api-auth';

const startSchema = z.object({ examId: z.string() });

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { examId } = parsed.data;

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
