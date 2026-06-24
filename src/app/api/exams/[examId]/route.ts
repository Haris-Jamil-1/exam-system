import { NextResponse } from 'next/server';
import { getExamById, updateExam, deleteExam } from '@/lib/data';
import { getAuthUser, unauthorized, notFound, forbidden } from '@/lib/api-auth';

export async function GET(_req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { examId } = await params;
  const exam = await getExamById(examId);
  if (!exam) return notFound();
  return NextResponse.json(exam);
}

export async function PUT(request: Request, { params }: { params: Promise<{ examId: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { examId } = await params;
  const exam = await getExamById(examId);
  if (!exam) return notFound();

  // Only the exam's teacher or an admin may update
  if (user.role !== 'admin' && exam.teacherId !== user.id) return forbidden();

  const body = await request.json();
  const updated = await updateExam(examId, body);
  if (!updated) return notFound();
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { examId } = await params;
  const exam = await getExamById(examId);
  if (!exam) return notFound();

  // Only the exam's teacher or an admin may delete
  if (user.role !== 'admin' && exam.teacherId !== user.id) return forbidden();

  const ok = await deleteExam(examId);
  if (!ok) return notFound();
  return NextResponse.json({ success: true });
}
