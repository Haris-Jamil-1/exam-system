import { NextResponse } from 'next/server';
import { z } from 'zod';

const submitSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  violationCount: z.number().default(0),
  trustScore: z.number().default(100),
});

export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  return NextResponse.json({
    id: attemptId,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
    trustScore: parsed.data.trustScore,
    violationCount: parsed.data.violationCount,
  });
}
