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

async function getSessionInstitutionId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (user?.user_metadata?.institutionId as string | undefined) ?? null;
}

export async function getStudents(_institutionId?: string): Promise<CurrentUser[]> {
  const institutionId = await getSessionInstitutionId();
  if (!institutionId) return [];
  const rows = await prisma.user.findMany({
    where: { role: 'student', institutionId },
    orderBy: { name: 'asc' },
  });
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
