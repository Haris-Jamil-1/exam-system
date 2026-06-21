import { NextResponse } from 'next/server';

export async function GET(_req: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return NextResponse.json({
    id: attemptId,
    status: 'in_progress',
    trustScore: 100,
    violationCount: 0,
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const body = await request.json();
  return NextResponse.json({ id: attemptId, ...body });
}
