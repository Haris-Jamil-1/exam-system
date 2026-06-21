import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getViolations, logViolation } from '@/lib/data';

const violationSchema = z.object({
  attemptId: z.string(),
  studentId: z.string(),
  examId: z.string(),
  type: z.enum(['tab_switch', 'window_blur', 'fullscreen_exit', 'no_face', 'multiple_faces', 'audio_detected', 'phone_detected']),
  severity: z.enum(['low', 'medium', 'high']),
  timestamp: z.string(),
  description: z.string(),
  screenshotUrl: z.string().optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const examId = searchParams.get('examId') ?? undefined;
  const studentId = searchParams.get('studentId') ?? undefined;
  const violations = await getViolations(examId, studentId);
  return NextResponse.json(violations);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = violationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const violation = await logViolation(parsed.data);
  return NextResponse.json(violation, { status: 201 });
}
