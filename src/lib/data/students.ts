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

export async function getStudents(_institutionId?: string): Promise<CurrentUser[]> {
  const { institutionId, role, prismaUserId } = await getSessionContext();
  if (!institutionId) return [];

  const where = role === 'teacher' && prismaUserId
    ? { role: 'student' as const, institutionId, studentTeachers: { some: { teacherId: prismaUserId } } }
    : { role: 'student' as const, institutionId };

  const rows = await prisma.user.findMany({ where, orderBy: { name: 'asc' } });
  return rows.map(mapUser);
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
};

export async function getStudentResults(examId: string): Promise<StudentResult[]> {
  const [enrollments, attempts] = await Promise.all([
    prisma.examEnrollment.findMany({
      where: { examId },
      include: { student: true },
      orderBy: { enrolledAt: 'asc' },
    }),
    prisma.examAttempt.findMany({
      where: { examId },
      select: {
        studentId: true, score: true, totalMarks: true,
        scorePercentage: true, trustScore: true, violationCount: true, status: true,
      },
    }),
  ]);
  const attemptMap = new Map(attempts.map(a => [a.studentId, a]));
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

export type StudentSubmissionAnswer = {
  questionId: string;
  stem: string;
  type: string;
  marks: number;
  marksAwarded: number | null;
  isCorrect: boolean | null;
  studentAnswer: string;
  correctAnswer: string;
};

export type StudentSubmissionDetail = {
  student: { id: string; name: string; email: string };
  exam: { id: string; title: string; totalMarks: number };
  attempt: {
    id: string; status: string; score: number | null; totalMarks: number | null;
    scorePercentage: number | null; submittedAt: string | null;
  } | null;
  answers: StudentSubmissionAnswer[];
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

  const [questions, attempt] = await Promise.all([
    prisma.question.findMany({
      where: { examId },
      orderBy: { order: 'asc' },
      include: { options: { orderBy: { order: 'asc' } } },
    }),
    prisma.examAttempt.findUnique({
      where: { examId_studentId: { examId, studentId } },
      include: { answers: true },
    }),
  ]);

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
    };
  });

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
  };
}

export async function getMonitorStudents(examId: string): Promise<MonitorStudent[]> {
  const [enrollments, attempts, violations] = await Promise.all([
    prisma.examEnrollment.findMany({
      where: { examId },
      include: { student: true },
    }),
    prisma.examAttempt.findMany({ where: { examId } }),
    prisma.violation.findMany({ where: { examId } }),
  ]);

  return enrollments.map(e => {
    const attempt = attempts.find(a => a.studentId === e.studentId);
    const studentViolations = violations.filter(v => v.studentId === e.studentId);
    const vCount = studentViolations.length;

    let status: MonitorStudent['status'] = 'active';
    if (!attempt) status = 'active';
    else if (attempt.status === 'submitted' || attempt.status === 'auto_submitted') status = 'submitted';
    else if (vCount >= 3) status = 'flagged';
    else if (vCount >= 1) status = 'warning';

    return {
      id: e.student.id,
      name: e.student.name,
      avatarUrl: e.student.avatarUrl ?? undefined,
      status,
      violationCount: vCount,
      trustScore: attempt?.trustScore ?? 100,
      lastSeen: attempt?.startedAt.toISOString() ?? new Date().toISOString(),
    };
  });
}
