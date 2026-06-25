import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViolations, logViolation } from '@/lib/data';
import { getAuthUser, unauthorized } from '@/lib/api-auth';

const violationSchema = z.object({
  attemptId: z.string(),
  examId: z.string(),
  type: z.enum(['tab_switch', 'window_blur', 'fullscreen_exit', 'no_face', 'multiple_faces', 'audio_detected', 'phone_detected']),
  severity: z.enum(['low', 'medium', 'high']),
  timestamp: z.string(),
  description: z.string(),
  screenshotUrl: z.string().optional(),
  // studentId is NOT accepted from body — always taken from JWT
});

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const examId = searchParams.get('examId') ?? undefined;
  // Scope to only the caller's own violations when no examId is supplied
  const studentId = user.role === 'student'
    ? user.id
    : (searchParams.get('studentId') ?? undefined);
  const violations = await getViolations(examId, studentId, user.institutionId);
  return NextResponse.json(violations);
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const parsed = violationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const violation = await logViolation({
    ...parsed.data,
    studentId: user.id, // always use authenticated user's id, never body value
    timestamp: parsed.data.timestamp,
  });
  return NextResponse.json(violation, { status: 201 });
}
