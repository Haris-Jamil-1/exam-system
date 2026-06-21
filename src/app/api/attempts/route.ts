import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { ExamAttempt } from '@/types';

const startAttemptSchema = z.object({
  examId: z.string(),
  studentId: z.string(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = startAttemptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // Phase 2: create in DB
  const attempt: ExamAttempt = {
    id: `attempt-${Date.now()}`,
    examId: parsed.data.examId,
    studentId: parsed.data.studentId,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    trustScore: 100,
    violationCount: 0,
  };
  return NextResponse.json(attempt, { status: 201 });
}
