'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { CurrentUser, MonitorStudent } from '@/types';

function mapUser(u: {
  id: string; name: string; email: string; role: string;
  institutionId: string; avatarUrl: string | null;
}): CurrentUser {
  return {
    id: u.id, name: u.name, email: u.email,
    role: u.role as CurrentUser['role'],
    institutionId: u.institutionId,
    avatarUrl: u.avatarUrl ?? undefined,
  };
}

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

export type StudentRosterEntry = CurrentUser & {
  // Every class (of this teacher's own classes) the student is enrolled in — a student can be
  // enrolled in more than one (ClassEnrollment is unique on the (classId, studentId) pair, not
  // on studentId alone). Empty for a student linked only via the older direct TeacherStudent
  // invite flow, never through a Class.
  classNames: string[];
  // Real average ExamAttempt.trustScore across the student's own completed/submitted attempts —
  // null (never 0/100) when they have no qualifying attempts yet, so the UI can render an
  // explicit "N/A" instead of a misleading placeholder.
  trustScore: number | null;
  // Properly scoped to just this student (unlike the page's previous getViolations() call with
  // no arguments, which resolved to an empty `where: {}` and returned every violation in the
  // entire database across every institution).
  violationCount: number;
};

export async function getStudents(_institutionId?: string): Promise<StudentRosterEntry[]> {
  const { institutionId, role, prismaUserId } = await getSessionContext();
  if (!institutionId) return [];

  // A teacher's roster must include a student linked EITHER via the older direct TeacherStudent
  // invite flow OR via ClassEnrollment in one of this teacher's own classes — the previous
  // TeacherStudent-only filter silently dropped every student who joined through a class invite,
  // since that flow (api/class-invites/accept) only ever writes a ClassEnrollment row, never a
  // TeacherStudent row.
  const where = role === 'teacher' && prismaUserId
    ? {
        role: 'student' as const,
        institutionId,
        OR: [
          { studentTeachers: { some: { teacherId: prismaUserId } } },
          { classEnrollments: { some: { class: { teacherId: prismaUserId } } } },
        ],
      }
    : { role: 'student' as const, institutionId };

  const rows = await prisma.user.findMany({ where, orderBy: { name: 'asc' } });
  if (rows.length === 0) return [];
  const studentIds = rows.map(r => r.id);

  const [classRows, trustAgg, violationCounts] = await Promise.all([
    // Only this teacher's own classes — a student in another teacher's class shouldn't show
    // that class's name on this teacher's roster view.
    role === 'teacher' && prismaUserId
      ? prisma.classEnrollment.findMany({
          where: { studentId: { in: studentIds }, class: { teacherId: prismaUserId } },
          include: { class: { select: { name: true } } },
        })
      : Promise.resolve([]),
    prisma.examAttempt.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds }, status: { not: 'in_progress' } },
      _avg: { trustScore: true },
    }),
    prisma.violation.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentIds } },
      _count: { _all: true },
    }),
  ]);

  const classNamesByStudent = new Map<string, string[]>();
  for (const ce of classRows) {
    const list = classNamesByStudent.get(ce.studentId) ?? [];
    list.push(ce.class.name);
    classNamesByStudent.set(ce.studentId, list);
  }
  const trustByStudent = new Map(trustAgg.map(t => [t.studentId, t._avg.trustScore]));
  const violationsByStudent = new Map(violationCounts.map(v => [v.studentId, v._count._all]));

  return rows.map(r => ({
    ...mapUser(r),
    classNames: classNamesByStudent.get(r.id) ?? [],
    trustScore: trustByStudent.get(r.id) ?? null,
    violationCount: violationsByStudent.get(r.id) ?? 0,
  }));
}

export async function getStudentById(id: string): Promise<CurrentUser | undefined> {
  const row = await prisma.user.findUnique({ where: { id } });
  if (!row || row.role !== 'student') return undefined;
  return mapUser(row);
}

export async function getStudentsForExam(examId: string): Promise<CurrentUser[]> {
  const enrollments = await prisma.examEnrollment.findMany({
    where: { examId },
    include: { student: true },
    orderBy: { enrolledAt: 'asc' },
  });
  return enrollments.map(e => mapUser(e.student));
}

export type StudentResult = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  score: number | null;
  totalMarks: number | null;
  scorePercentage: number | null;
  trustScore: number;
  violationCount: number;
  submitted: boolean;
  // True when this attempt cleared the overall percentage but still missed a
  // per-section passing threshold — a hierarchical-scoring exam can fail a
  // student this way even though their composite score alone looks like a pass.
  sectionsFailed: boolean;
};

export async function getStudentResults(examId: string): Promise<StudentResult[]> {
  const [enrollments, attempts, failedSectionAttempts] = await Promise.all([
    prisma.examEnrollment.findMany({
      where: { examId },
      include: { student: true },
      orderBy: { enrolledAt: 'asc' },
    }),
    prisma.examAttempt.findMany({
      where: { examId },
      select: {
        id: true, studentId: true, score: true, totalMarks: true,
        scorePercentage: true, trustScore: true, violationCount: true, status: true,
      },
    }),
    prisma.sectionAttempt.findMany({
      where: { section: { examId }, passed: false },
      select: { attemptId: true },
    }),
  ]);
  const attemptMap = new Map(attempts.map(a => [a.studentId, a]));
  const failedAttemptIds = new Set(failedSectionAttempts.map(sa => sa.attemptId));
  return enrollments.map(e => {
    const attempt = attemptMap.get(e.studentId);
    const submitted = attempt?.status === 'submitted' || attempt?.status === 'auto_submitted';
    return {
      id: e.student.id,
      name: e.student.name,
      email: e.student.email,
      avatarUrl: e.student.avatarUrl ?? undefined,
      score: submitted ? (attempt?.score ?? null) : null,
      totalMarks: submitted ? (attempt?.totalMarks ?? null) : null,
      scorePercentage: submitted ? (attempt?.scorePercentage ?? null) : null,
      trustScore: attempt?.trustScore ?? 100,
      violationCount: attempt?.violationCount ?? 0,
      submitted,
      sectionsFailed: attempt ? failedAttemptIds.has(attempt.id) : false,
    };
  });
}

type QuestionWithOptions = {
  id: string; type: string; stem: string; marks: number; correctAnswer: unknown;
  options: { id: string; text: string; isCorrect: boolean }[];
};

function formatResponse(q: QuestionWithOptions, response: unknown): string {
  if (response === null || response === undefined || response === '') return '(no answer)';
  switch (q.type) {
    case 'mcq':
    case 'true_false': {
      const opt = q.options.find(o => o.id === response);
      return opt ? opt.text : String(response);
    }
    case 'mrq': {
      if (!Array.isArray(response)) return String(response);
      const texts = response.map(id => q.options.find(o => o.id === id)?.text ?? String(id));
      return texts.length ? texts.join(', ') : '(no answer)';
    }
    case 'matching': {
      if (typeof response !== 'object' || response === null || Array.isArray(response)) return '(no answer)';
      const map = response as Record<string, string>;
      return q.options.map(o => `${o.text} → ${map[o.id] ?? '(unmatched)'}`).join('; ');
    }
    case 'ordering': {
      if (!Array.isArray(response)) return String(response);
      const texts = response.map(id => q.options.find(o => o.id === id)?.text ?? String(id));
      return texts.length ? texts.join(' → ') : '(no answer)';
    }
    default:
      // short_answer, fill_blank, essay, coding, file_upload
      return typeof response === 'string' ? response : JSON.stringify(response);
  }
}

function formatCorrectAnswer(q: QuestionWithOptions): string {
  switch (q.type) {
    case 'mcq':
    case 'true_false': {
      const correct = q.options.find(o => o.isCorrect);
      return correct?.text ?? '(not set)';
    }
    case 'mrq': {
      const texts = q.options.filter(o => o.isCorrect).map(o => o.text);
      return texts.length ? texts.join(', ') : '(not set)';
    }
    case 'matching': {
      const labels = q.correctAnswer as string[] | undefined;
      if (!Array.isArray(labels)) return '(not set)';
      return q.options.map((o, i) => `${o.text} → ${labels[i] ?? ''}`).join('; ');
    }
    case 'ordering': {
      const labels = q.correctAnswer as string[] | undefined;
      return Array.isArray(labels) ? labels.join(' → ') : '(not set)';
    }
    case 'short_answer':
    case 'fill_blank':
      return typeof q.correctAnswer === 'string' ? q.correctAnswer : '(not set)';
    default:
      // essay, coding, file_upload
      return '(manually graded)';
  }
}

export type GradingSuggestion = {
  totalScore: number;
  feedback: string | null;
  criterionScores: { name: string; points: number; evidence: string }[] | null;
  rationale: unknown;
  executionResult: unknown;
  model: string | null;
  createdAt: string;
};

export type StudentSubmissionAnswer = {
  questionId: string;
  stem: string;
  type: string;
  marks: number;
  marksAwarded: number | null;
  isCorrect: boolean | null;
  studentAnswer: string;
  correctAnswer: string;
  sectionId: string | null;
  sectionTitle: string | null;
  // Phase 3 (doc 03): AI-assisted grading state for essay/coding answers.
  answerId: string | null;
  gradingStatus: string | null;
  suggestion: GradingSuggestion | null;
};

export type StudentSubmissionSectionResult = {
  sectionId: string;
  title: string;
  score: number | null;
  totalMarks: number | null;
  scorePercentage: number | null;
  passed: boolean | null;
  sectionWeight: number;
  passingThreshold: number | null;
};

export type StudentSubmissionDetail = {
  student: { id: string; name: string; email: string };
  exam: { id: string; title: string; totalMarks: number };
  attempt: {
    id: string; status: string; score: number | null; totalMarks: number | null;
    scorePercentage: number | null; submittedAt: string | null;
  } | null;
  answers: StudentSubmissionAnswer[];
  sections: StudentSubmissionSectionResult[];
};

/**
 * Full per-question answer review for one student's submission to one exam
 * — backs the TCH-03 review pane (previously no such view existed for any
 * question type). Scoped the same way as the rest of this session's
 * IDOR fixes: caller must be in the exam's institution, and a teacher must
 * own the exam.
 */
export async function getStudentSubmissionDetail(examId: string, studentId: string): Promise<StudentSubmissionDetail | undefined> {
  const { institutionId, role, prismaUserId } = await getSessionContext();
  if (!institutionId || (role !== 'teacher' && role !== 'admin')) return undefined;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, title: true, totalMarks: true, institutionId: true, teacherId: true },
  });
  if (!exam || exam.institutionId !== institutionId) return undefined;
  if (role === 'teacher' && exam.teacherId !== prismaUserId) return undefined;

  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== 'student' || student.institutionId !== institutionId) return undefined;

  const attempt = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
    include: {
      answers: {
        include: {
          gradings: { where: { kind: 'ai_suggestion' }, orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  });

  // OR [attemptId: null, attemptId: this attempt] — this student's actual question set,
  // whether it's the exam's fixed/shared questions or their own privately-drawn stratified
  // pool. A bare `{ examId }` filter would show every other student's pooled questions too
  // once any of them existed, all mixed together in one review pane.
  const questions = await prisma.question.findMany({
    where: { examId, OR: [{ attemptId: null }, { attemptId: attempt?.id ?? '__none__' }] },
    orderBy: { order: 'asc' },
    include: { options: { orderBy: { order: 'asc' } }, section: { select: { id: true, title: true } } },
  });

  const answerByQuestionId = new Map((attempt?.answers ?? []).map(a => [a.questionId, a]));

  const answers: StudentSubmissionAnswer[] = questions.map(q => {
    const a = answerByQuestionId.get(q.id);
    const response = a ? (a.response as unknown) : null;
    return {
      questionId: q.id,
      stem: q.stem,
      type: q.type,
      marks: q.marks,
      marksAwarded: a?.marksAwarded ?? null,
      isCorrect: a?.isCorrect ?? null,
      studentAnswer: formatResponse(q, response),
      correctAnswer: formatCorrectAnswer(q),
      sectionId: q.section?.id ?? null,
      sectionTitle: q.section?.title ?? null,
      answerId: a?.id ?? null,
      gradingStatus: a?.gradingStatus ?? null,
      suggestion: a?.gradings?.[0]
        ? {
            totalScore: a.gradings[0].totalScore,
            feedback: a.gradings[0].feedback,
            criterionScores: (a.gradings[0].criterionScores as GradingSuggestion['criterionScores']) ?? null,
            rationale: a.gradings[0].rationale,
            executionResult: a.gradings[0].executionResult,
            model: a.gradings[0].model,
            createdAt: a.gradings[0].createdAt.toISOString(),
          }
        : null,
    };
  });

  // Sectioned exams also carry a per-section score breakdown (hierarchical scoring) —
  // this stays empty for a normal, non-sectioned exam (zero ExamSection rows).
  const sectionAttempts = attempt
    ? await prisma.sectionAttempt.findMany({
        where: { attemptId: attempt.id },
        include: { section: true },
        orderBy: { section: { orderIndex: 'asc' } },
      })
    : [];

  return {
    student: { id: student.id, name: student.name, email: student.email },
    exam: { id: exam.id, title: exam.title, totalMarks: exam.totalMarks },
    attempt: attempt ? {
      id: attempt.id,
      status: attempt.status,
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      scorePercentage: attempt.scorePercentage,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
    } : null,
    answers,
    sections: sectionAttempts.map(sa => ({
      sectionId: sa.sectionId,
      title: sa.section.title,
      score: sa.score,
      totalMarks: sa.totalMarks,
      scorePercentage: sa.scorePercentage,
      passed: sa.passed,
      sectionWeight: sa.section.sectionWeight,
      passingThreshold: sa.section.passingThreshold,
    })),
  };
}

// An in_progress attempt whose proctoring heartbeat is older than this is
// treated as disconnected — detectors died, tab killed, or suppressed (doc 01's
// anti-suppression signal, surfaced as a first-class monitoring state).
const HEARTBEAT_STALE_MS = 90_000;

// Needs-attention ordering for the monitor roster.
const STATUS_PRIORITY: Record<MonitorStudent['status'], number> = {
  flagged: 0,
  disconnected: 1,
  warning: 2,
  active: 3,
  not_started: 4,
  submitted: 5,
};

export async function getMonitorStudents(examId: string): Promise<MonitorStudent[]> {
  const [enrollments, attempts, violations] = await Promise.all([
    prisma.examEnrollment.findMany({
      where: { examId },
      include: { student: true },
    }),
    prisma.examAttempt.findMany({ where: { examId }, include: { heartbeat: true } }),
    prisma.violation.findMany({ where: { examId } }),
  ]);

  const students = enrollments.map(e => {
    const attempt = attempts.find(a => a.studentId === e.studentId);
    const studentViolations = violations.filter(v => v.studentId === e.studentId);
    const vCount = studentViolations.length;
    const highCount = studentViolations.filter(v => v.severity === 'high').length;
    const heartbeatAt = attempt?.heartbeat?.lastSeenAt ?? null;
    const heartbeatStale =
      attempt?.status === 'in_progress' &&
      heartbeatAt !== null &&
      Date.now() - heartbeatAt.getTime() > HEARTBEAT_STALE_MS;

    let status: MonitorStudent['status'];
    if (!attempt) status = 'not_started';
    else if (attempt.status === 'submitted' || attempt.status === 'auto_submitted') status = 'submitted';
    else if (heartbeatStale) status = 'disconnected';
    else if (highCount >= 1 || vCount >= 3 || attempt.trustScore < 60) status = 'flagged';
    else if (vCount >= 1) status = 'warning';
    else status = 'active';

    return {
      id: e.student.id,
      name: e.student.name,
      avatarUrl: e.student.avatarUrl ?? undefined,
      status,
      violationCount: vCount,
      trustScore: attempt?.trustScore ?? 100,
      lastSeen: attempt?.startedAt.toISOString() ?? new Date().toISOString(),
      attemptId: attempt?.id,
      attemptStatus: attempt?.status,
      lastHeartbeat: heartbeatAt?.toISOString(),
    };
  });

  return students.sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || a.trustScore - b.trustScore,
  );
}
