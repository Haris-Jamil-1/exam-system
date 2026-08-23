'use server';
import { prisma } from '@/lib/prisma';
import { getSessionContext } from '@/lib/session';
import { computeEffectiveExamStatus } from '@/lib/exam-status';
import { computeExamDurationMinutes, MIN_EXAM_DURATION_MINUTES } from '@/lib/exam-duration';
import type { Exam, ExamSettings, StatValue } from '@/types';

type PrismaExam = {
  id: string; title: string; subject: string; duration: number;
  totalMarks: number; passingMarks: number; status: string;
  approvalStatus: string; startTime: Date; endTime: Date;
  maxViolations: number; settings: unknown; resultsPublishedAt: Date | null;
  instructions: string | null; isProctoringEnabled: boolean;
  institutionId: string; teacherId: string; classId: string | null; createdAt: Date;
  targetTags: string[]; targetTagsOperator: string;
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
    status: computeEffectiveExamStatus(e.status as Exam['status'], e.startTime, new Date(), e.endTime),
    approvalStatus: e.approvalStatus as Exam['approvalStatus'],
    startTime: e.startTime.toISOString(),
    endTime: e.endTime.toISOString(),
    maxViolations: e.maxViolations,
    settings: e.settings as ExamSettings,
    resultsPublishedAt: e.resultsPublishedAt?.toISOString() ?? null,
    instructions: e.instructions ?? undefined,
    isProctoringEnabled: e.isProctoringEnabled,
    institutionId: e.institutionId,
    teacherId: e.teacherId,
    classId: e.classId,
    targetTags: e.targetTags,
    targetTagsOperator: e.targetTagsOperator as Exam['targetTagsOperator'],
    createdAt: e.createdAt.toISOString(),
    _count: e._count,
  };
}

const COUNT_SELECT = { questions: true, enrollments: true } as const;

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
  const session = await getSessionContext();
  const institutionId = session.institutionId ?? data.institutionId;
  const teacherId = session.prismaUserId ?? data.teacherId;

  // A caller-supplied classId is never trusted blindly — it must be one of this teacher's own
  // classes in their own institution, otherwise the exam would silently scope itself to (and
  // leak its existence/roster-derived visibility to) a class that isn't even this teacher's.
  let classId: string | null = null;
  if (data.classId) {
    const cls = await prisma.class.findUnique({
      where: { id: data.classId },
      select: { teacherId: true, institutionId: true },
    });
    if (cls && cls.teacherId === teacherId && cls.institutionId === institutionId) {
      classId = data.classId;
    }
  }

  try {
    const row = await prisma.exam.create({
      data: {
        title: data.title,
        subject: data.subject,
        // Duration is independent of the availability window (Start/End Time) — it drives
        // only the student's own countdown once they click Start; the window controls when
        // that's even possible. A late start is still force-submitted at endTime regardless
        // of this value (see computeSubmissionDeadline in lib/exam-deadline.ts).
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
        instructions: data.instructions ?? null,
        isProctoringEnabled: data.isProctoringEnabled ?? true,
        institutionId,
        teacherId,
        classId,
        targetTags: data.targetTags ?? [],
        targetTagsOperator: data.targetTagsOperator ?? 'OR',
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
        ...(data.instructions !== undefined && { instructions: data.instructions ?? null }),
        ...(data.isProctoringEnabled !== undefined && { isProctoringEnabled: data.isProctoringEnabled }),
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

/**
 * "Assign to another section" — implemented as a full deep clone (Exam + ExamSections + fixed
 * Questions + their Options), attached to a different Class, with its own schedule. Chosen over
 * linking one Exam to multiple Classes: every subsystem in this app (results, live monitor,
 * grading, status, eligibility) already assumes one Exam <-> one Class <-> one time window: a
 * many-to-many relation would need class-scoping added to attempts/monitor/results everywhere,
 * while a clone needs none of that — each section's copy is a completely ordinary, independent
 * exam from every other subsystem's point of view. Deliberately NOT copied: attempts, answers,
 * violations, enrollments, monitor directives — all attempt-scoped, so a clone starts with a
 * clean slate exactly like a brand-new teacher-authored exam. Status/approvalStatus reset to
 * their normal new-exam defaults for the same reason (a copy is not pre-approved).
 */
export async function duplicateExam(
  examId: string,
  targetClassId: string,
  schedule: { startTime: string; endTime: string },
): Promise<Exam> {
  const { institutionId, prismaUserId } = await getSessionContext();
  if (!institutionId || !prismaUserId) throw new Error('Not authenticated');

  const source = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      sections: { orderBy: { orderIndex: 'asc' } },
      // Fixed questions only — a pooled/private per-attempt question (attemptId set) belongs
      // to one student's one attempt and must never be copied into a fresh exam.
      questions: {
        where: { attemptId: null },
        include: { options: { orderBy: { order: 'asc' } } },
        orderBy: { order: 'asc' },
      },
    },
  });
  if (!source) throw new Error('Exam not found');
  if (source.institutionId !== institutionId || source.teacherId !== prismaUserId) {
    throw new Error('Forbidden');
  }

  const targetClass = await prisma.class.findUnique({
    where: { id: targetClassId },
    select: { teacherId: true, institutionId: true },
  });
  if (!targetClass || targetClass.teacherId !== prismaUserId || targetClass.institutionId !== institutionId) {
    throw new Error('Target section not found or not yours');
  }

  const startTime = new Date(schedule.startTime);
  const endTime = new Date(schedule.endTime);
  const windowMinutes = computeExamDurationMinutes(startTime, endTime);
  if (!windowMinutes || windowMinutes < MIN_EXAM_DURATION_MINUTES) {
    throw new Error(`Schedule window must be at least ${MIN_EXAM_DURATION_MINUTES} minutes`);
  }

  const clonedId = await prisma.$transaction(async (tx) => {
    const newExam = await tx.exam.create({
      data: {
        title: `${source.title} (Copy)`,
        subject: source.subject,
        duration: source.duration,
        totalMarks: source.totalMarks,
        passingMarks: source.passingMarks,
        status: 'draft',
        approvalStatus: 'not_submitted',
        startTime,
        endTime,
        maxViolations: source.maxViolations,
        settings: source.settings as object,
        instructions: source.instructions,
        isProctoringEnabled: source.isProctoringEnabled,
        // Without copying these, a tag-restricted exam (e.g. accommodation-only) silently
        // reverts to the fail-open default (empty targetTags = visible to everyone eligible)
        // on the clone, widening visibility instead of preserving the teacher's restriction.
        targetTags: source.targetTags,
        targetTagsOperator: source.targetTagsOperator,
        institutionId,
        teacherId: prismaUserId,
        classId: targetClassId,
      },
    });

    const sectionIdMap = new Map<string, string>();
    for (const s of source.sections) {
      const newSection = await tx.examSection.create({
        data: {
          examId: newExam.id,
          title: s.title,
          instructions: s.instructions,
          durationMinutes: s.durationMinutes,
          orderIndex: s.orderIndex,
          sectionWeight: s.sectionWeight,
          passingThreshold: s.passingThreshold,
        },
      });
      sectionIdMap.set(s.id, newSection.id);
    }

    for (const q of source.questions) {
      await tx.question.create({
        data: {
          examId: newExam.id,
          sectionId: q.sectionId ? sectionIdMap.get(q.sectionId) : null,
          type: q.type,
          stem: q.stem,
          marks: q.marks,
          difficulty: q.difficulty,
          order: q.order,
          required: q.required,
          explanation: q.explanation,
          correctAnswer: q.correctAnswer ?? undefined,
          learningObjectiveId: q.learningObjectiveId,
          codeLanguage: q.codeLanguage,
          starterCode: q.starterCode,
          testCases: q.testCases ?? undefined,
          allowedFileTypes: q.allowedFileTypes,
          maxFileSizeMB: q.maxFileSizeMB,
          mediaSettings: q.mediaSettings ?? undefined,
          timeLimitSeconds: q.timeLimitSeconds,
          rubric: q.rubric ?? undefined,
          gradingWeights: q.gradingWeights ?? undefined,
          sourceItemId: q.sourceItemId,
          options: q.options.length
            ? { create: q.options.map(o => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })) }
            : undefined,
        },
      });
    }

    return newExam.id;
  });

  const cloned = await getExamById(clonedId);
  if (!cloned) throw new Error('Failed to load duplicated exam');
  return cloned;
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
