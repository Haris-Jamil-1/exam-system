'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { Exam, ExamSettings, StatValue } from '@/types';

type PrismaExam = {
  id: string; title: string; subject: string; duration: number;
  totalMarks: number; passingMarks: number; status: string;
  approvalStatus: string; startTime: Date; endTime: Date;
  maxViolations: number; settings: unknown; resultsPublishedAt: Date | null;
  institutionId: string; teacherId: string; createdAt: Date;
  _count?: { questions: number; enrollments: number };
};

function mapExam(e: PrismaExam): Exam {
  return {
    id: e.id,
    title: e.title,
    subject: e.subject,
    duration: e.duration,
    totalMarks: e.totalMarks,
    passingMarks: e.passingMarks,
    status: e.status as Exam['status'],
    approvalStatus: e.approvalStatus as Exam['approvalStatus'],
    startTime: e.startTime.toISOString(),
    endTime: e.endTime.toISOString(),
    maxViolations: e.maxViolations,
    settings: e.settings as ExamSettings,
    resultsPublishedAt: e.resultsPublishedAt?.toISOString(),
    institutionId: e.institutionId,
    teacherId: e.teacherId,
    createdAt: e.createdAt.toISOString(),
    _count: e._count,
  };
}

const COUNT_SELECT = { questions: true, enrollments: true } as const;

async function getSessionContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const institutionId = (user?.user_metadata?.institutionId as string | undefined) ?? null;
  const role = (user?.user_metadata?.role as string | undefined) ?? null;
  const supabaseId = user?.id ?? null;
  let prismaUserId: string | null = null;
  if (supabaseId) {
    const u = await prisma.user.findUnique({ where: { supabaseId }, select: { id: true } });
    prismaUserId = u?.id ?? null;
  }
  return { institutionId, role, prismaUserId };
}

export async function getExams(_institutionId?: string): Promise<Exam[]> {
  const { institutionId, role, prismaUserId } = await getSessionContext();
  if (!institutionId) return [];
  const where = role === 'teacher' && prismaUserId
    ? { institutionId, teacherId: prismaUserId }
    : { institutionId };
  const rows = await prisma.exam.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: COUNT_SELECT } },
  });
  return rows.map(mapExam);
}

export async function getExamById(id: string): Promise<Exam | undefined> {
  const row = await prisma.exam.findUnique({
    where: { id },
    include: { _count: { select: COUNT_SELECT } },
  });
  return row ? mapExam(row) : undefined;
}

export async function createExam(data: Omit<Exam, 'id' | 'createdAt'>): Promise<Exam> {
  // Always resolve institutionId and teacherId from the authenticated session
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const institutionId = (user?.user_metadata?.institutionId as string | undefined) ?? data.institutionId;
  let teacherId = data.teacherId;
  if (user?.id) {
    const teacher = await prisma.user.findFirst({ where: { supabaseId: user.id }, select: { id: true } });
    if (teacher) teacherId = teacher.id;
  }
  try {
    const row = await prisma.exam.create({
      data: {
        title: data.title,
        subject: data.subject,
        duration: data.duration,
        totalMarks: data.totalMarks,
        passingMarks: data.passingMarks,
        status: data.status,
        approvalStatus: data.approvalStatus ?? 'not_submitted',
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        maxViolations: data.maxViolations,
        settings: data.settings as object,
        resultsPublishedAt: data.resultsPublishedAt ? new Date(data.resultsPublishedAt) : null,
        institutionId,
        teacherId,
      },
      include: { _count: { select: COUNT_SELECT } },
    });
    return mapExam(row);
  } catch (err) {
    console.error('[createExam] Prisma error:', err);
    throw err;
  }
}

export async function updateExam(id: string, data: Partial<Exam>): Promise<Exam | undefined> {
  try {
    const row = await prisma.exam.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.subject && { subject: data.subject }),
        ...(data.duration !== undefined && { duration: data.duration }),
        ...(data.totalMarks !== undefined && { totalMarks: data.totalMarks }),
        ...(data.passingMarks !== undefined && { passingMarks: data.passingMarks }),
        ...(data.status && { status: data.status }),
        ...(data.approvalStatus !== undefined && { approvalStatus: data.approvalStatus }),
        ...(data.startTime && { startTime: new Date(data.startTime) }),
        ...(data.endTime && { endTime: new Date(data.endTime) }),
        ...(data.maxViolations !== undefined && { maxViolations: data.maxViolations }),
        ...(data.settings && { settings: data.settings as object }),
        ...(data.resultsPublishedAt !== undefined && {
          resultsPublishedAt: data.resultsPublishedAt ? new Date(data.resultsPublishedAt) : null,
        }),
      },
      include: { _count: { select: COUNT_SELECT } },
    });
    return mapExam(row);
  } catch (err) {
    console.error('[updateExam] Prisma error:', err);
    throw err;
  }
}

export async function deleteExam(id: string): Promise<boolean> {
  try {
    // Delete in FK-safe order: violations reference both examId and attemptId,
    // so delete them first; attempts then cascade their answers.
    await prisma.$transaction([
      prisma.violation.deleteMany({ where: { examId: id } }),
      prisma.examAttempt.deleteMany({ where: { examId: id } }),
      prisma.exam.delete({ where: { id } }),
    ]);
    return true;
  } catch (err) {
    console.error('[deleteExam] error:', err);
    return false;
  }
}

// ── Schedule conflict detection ───────────────────────────────────────────────

export type ConflictingStudent = { id: string; name: string; email: string };
export type ScheduleConflict = {
  conflictingExam: {
    id: string; title: string; teacher: string;
    startTime: string; endTime: string;
    status: 'scheduled' | 'live';
  };
  affectedStudents: ConflictingStudent[];
};

// Accepts either the global prisma client or a transaction client
type DbClient = Pick<typeof prisma, 'teacherStudent' | 'exam'>;

export async function checkScheduleConflicts(
  teacherId: string,
  startTime: Date,
  endTime: Date,
  excludeExamId?: string,
  db: DbClient = prisma,
): Promise<ScheduleConflict[]> {
  const teacherStudents = await db.teacherStudent.findMany({
    where: { teacherId },
    select: { studentId: true },
  });
  if (teacherStudents.length === 0) return [];

  const studentIds = teacherStudents.map(r => r.studentId);

  const overlapping = await db.exam.findMany({
    where: {
      // Exclude the exam being scheduled so it never conflicts with itself
      ...(excludeExamId && { id: { not: excludeExamId } }),
      approvalStatus: 'approved',
      status: { in: ['scheduled', 'live'] },
      // Overlap: existing.startTime < newEnd  AND  existing.endTime > newStart
      // All values are UTC Date objects — Prisma stores/compares in UTC
      startTime: { lt: endTime },
      endTime:   { gt: startTime },
    },
    select: {
      id: true, title: true, status: true,
      startTime: true, endTime: true, teacherId: true,
      teacher: { select: { name: true } },
    },
  });
  if (overlapping.length === 0) return [];

  const conflicts: ScheduleConflict[] = [];

  for (const exam of overlapping) {
    const affected = await db.teacherStudent.findMany({
      where: { teacherId: exam.teacherId, studentId: { in: studentIds } },
      select: { student: { select: { id: true, name: true, email: true } } },
    });
    if (affected.length > 0) {
      conflicts.push({
        conflictingExam: {
          id: exam.id,
          title: exam.title,
          teacher: exam.teacher.name,
          status: exam.status as 'scheduled' | 'live',
          startTime: exam.startTime.toISOString(),
          endTime: exam.endTime.toISOString(),
        },
        affectedStudents: affected.map(r => r.student),
      });
    }
  }

  return conflicts;
}

/**
 * Atomically checks for schedule conflicts and, if none, applies the update.
 * Runs inside a SERIALIZABLE transaction so two concurrent approvals cannot
 * both pass the conflict check and both write.
 *
 * Returns { conflicts } if blocked, or { exam } on success.
 */
export async function scheduleExamAtomically(
  examId: string,
  teacherId: string,
  startTime: Date,
  endTime: Date,
  updateData: Record<string, unknown>,
): Promise<{ conflicts: ScheduleConflict[] } | { exam: Exam }> {
  type TxResult = { conflicts: ScheduleConflict[] } | { row: PrismaExam & { _count: { questions: number; enrollments: number } } };

  const result = await prisma.$transaction(async (tx) => {
    const db = tx as unknown as DbClient;
    const conflicts = await checkScheduleConflicts(teacherId, startTime, endTime, examId, db);
    if (conflicts.length > 0) return { conflicts } as TxResult;

    const row = await tx.exam.update({
      where: { id: examId },
      data: updateData,
      include: { _count: { select: COUNT_SELECT } },
    });
    return { row } as TxResult;
  }, {
    isolationLevel: 'Serializable' as const,
    maxWait: 5000,
    timeout: 10000,
  });

  if ('conflicts' in result) return result;
  return { exam: mapExam(result.row as PrismaExam) };
}

export async function getExamStats(examId: string): Promise<StatValue[]> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { _count: { select: COUNT_SELECT } },
  });
  if (!exam) return [];
  const violationCount = await prisma.violation.count({ where: { examId } });
  return [
    { label: 'Enrolled Students', value: exam._count.enrollments },
    { label: 'Total Questions', value: exam._count.questions },
    { label: 'Duration (min)', value: exam.duration },
    { label: 'Violations', value: violationCount, trend: violationCount > 5 ? 'up' : 'down' },
  ];
}
