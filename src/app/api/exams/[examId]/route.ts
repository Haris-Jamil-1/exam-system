import { NextResponse } from 'next/server';
import { getExamById, updateExam, deleteExam } from '@/lib/data';

export async function GET(_req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const exam = await getExamById(examId);
  if (!exam) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(exam);
}

export async function PUT(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const body = await request.json();
  const updated = await updateExam(examId, body);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const ok = await deleteExam(examId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
