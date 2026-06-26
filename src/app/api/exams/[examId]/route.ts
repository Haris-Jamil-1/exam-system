import { NextResponse } from 'next/server';
import { getExamById, updateExam, deleteExam, checkScheduleConflicts } from '@/lib/data';
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

  // When approving or directly scheduling, check for student time conflicts
  const isScheduling =
    body.approvalStatus === 'approved' ||
    body.status === 'scheduled' ||
    body.status === 'live';

  if (isScheduling) {
    const startTime = body.startTime ? new Date(body.startTime) : new Date(exam.startTime);
    const endTime   = body.endTime   ? new Date(body.endTime)   : new Date(exam.endTime);
    const conflicts = await checkScheduleConflicts(exam.teacherId, startTime, endTime, examId);
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: 'schedule_conflict', message: 'Some students already have exams during this time slot.', conflicts },
        { status: 409 },
      );
    }
  }

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
