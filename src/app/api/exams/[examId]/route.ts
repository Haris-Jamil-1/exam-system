import { NextResponse } from 'next/server';
import { getExamById, updateExam, deleteExam, scheduleExamAtomically } from '@/lib/data';
import { getAuthUser, unauthorized, notFound, forbidden } from '@/lib/api-auth';

/**
 * Ensures a datetime string is treated as UTC when parsed to a Date.
 * The HTML datetime-local input produces strings like "2024-01-15T10:00"
 * (no timezone designator). `new Date("2024-01-15T10:00")` is parsed as
 * local time on most runtimes — appending "Z" forces UTC interpretation.
 */
function toUtc(str: string): Date {
  // If the string already has a timezone offset (Z, +HH:MM, -HH:MM), trust it.
  const hasTimezone = /[Zz]$|[+-]\d{2}:\d{2}$/.test(str);
  return new Date(hasTimezone ? str : `${str}Z`);
}

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

  if (exam.institutionId !== user.institutionId) return notFound();
  if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();

  const body = await request.json();

  // When approving or directly scheduling, run a conflict check inside a
  // SERIALIZABLE transaction so concurrent approvals can't both slip through.
  const isScheduling =
    body.approvalStatus === 'approved' ||
    body.status === 'scheduled' ||
    body.status === 'live';

  if (isScheduling) {
    // Normalize to UTC so the overlap query compares apples to apples.
    const startTime = toUtc(body.startTime ?? exam.startTime);
    const endTime   = toUtc(body.endTime   ?? exam.endTime);

    // Build the exact update data to apply inside the transaction.
    const updateData: Record<string, unknown> = {};
    if (body.title         !== undefined) updateData.title         = body.title;
    if (body.subject       !== undefined) updateData.subject       = body.subject;
    if (body.duration      !== undefined) updateData.duration      = body.duration;
    if (body.totalMarks    !== undefined) updateData.totalMarks    = body.totalMarks;
    if (body.passingMarks  !== undefined) updateData.passingMarks  = body.passingMarks;
    if (body.status        !== undefined) updateData.status        = body.status;
    if (body.approvalStatus !== undefined) updateData.approvalStatus = body.approvalStatus;
    if (body.startTime     !== undefined) updateData.startTime     = startTime;
    if (body.endTime       !== undefined) updateData.endTime       = endTime;
    if (body.maxViolations !== undefined) updateData.maxViolations = body.maxViolations;
    if (body.settings      !== undefined) updateData.settings      = body.settings;
    if (body.resultsPublishedAt !== undefined) {
      updateData.resultsPublishedAt = body.resultsPublishedAt
        ? new Date(body.resultsPublishedAt)
        : null;
    }

    try {
      const result = await scheduleExamAtomically(
        examId, exam.teacherId, startTime, endTime, updateData,
      );

      if ('conflicts' in result) {
        return NextResponse.json(
          {
            error: 'schedule_conflict',
            message: 'Some students already have exams during this time slot.',
            conflicts: result.conflicts,
          },
          { status: 409 },
        );
      }

      return NextResponse.json(result.exam);
    } catch (err: unknown) {
      // P2034 = serialization failure (two concurrent transactions clashed).
      // The client should retry after a brief back-off.
      const code = (err as { code?: string })?.code;
      if (code === 'P2034') {
        return NextResponse.json(
          { error: 'retry', message: 'Another approval happened simultaneously. Please try again.' },
          { status: 503 },
        );
      }
      console.error('[PUT /api/exams] scheduling error:', err);
      return NextResponse.json({ error: 'internal' }, { status: 500 });
    }
  }

  // Non-scheduling updates (title edits, result publishing, etc.) don't need
  // the conflict check — use the standard update helper.
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

  if (exam.institutionId !== user.institutionId) return notFound();
  if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();

  const ok = await deleteExam(examId);
  if (!ok) return notFound();
  return NextResponse.json({ success: true });
}
