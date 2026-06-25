'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { StatValue, PendingExam } from '@/types';

async function getSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const institutionId = user?.user_metadata?.institutionId as string | undefined;
  const supabaseId = user?.id as string | undefined;
  const role = user?.user_metadata?.role as string | undefined;
  let prismaUserId: string | null = null;
  if (supabaseId) {
    const u = await prisma.user.findUnique({ where: { supabaseId }, select: { id: true } });
    prismaUserId = u?.id ?? null;
  }
  return { institutionId: institutionId ?? null, supabaseId: supabaseId ?? null, role: role ?? null, prismaUserId };
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export async function getDashboardStats(): Promise<StatValue[]> {
  const { institutionId, role, prismaUserId } = await getSession();
  if (!institutionId) return [];
  const examFilter = role === 'teacher' && prismaUserId
    ? { institutionId, teacherId: prismaUserId }
    : { institutionId };
  const [activeExams, totalStudents, pendingReviews, trustAgg] = await Promise.all([
    prisma.exam.count({ where: { ...examFilter, status: 'live' } }),
    prisma.user.count({ where: { institutionId, role: 'student' } }),
    prisma.violation.count({
      where: { exam: examFilter, severity: 'high' },
    }),
    prisma.examAttempt.aggregate({
      where: { exam: examFilter },
      _avg: { trustScore: true },
    }),
  ]);
  const avgTrust = trustAgg._avg.trustScore?.toFixed(1) ?? '—';
  return [
    { key: 'activeExams', label: 'Active Exams', value: activeExams },
    { key: 'totalStudents', label: 'Total Students', value: totalStudents },
    { key: 'avgTrust', label: 'Avg Trust Score', value: avgTrust },
    { key: 'pendingReviews', label: 'High-Severity Flags', value: pendingReviews },
  ];
}

export async function getAnalyticsKpis(): Promise<StatValue[]> {
  const { institutionId } = await getSession();
  if (!institutionId) return [];
  const [totalExams, trustAgg, attempts] = await Promise.all([
    prisma.exam.count({ where: { institutionId } }),
    prisma.examAttempt.aggregate({
      where: { exam: { institutionId } },
      _avg: { trustScore: true, scorePercentage: true },
    }),
    prisma.examAttempt.findMany({
      where: { exam: { institutionId }, status: { not: 'in_progress' } },
      select: { score: true, exam: { select: { passingMarks: true } } },
    }),
  ]);
  const passed = attempts.filter(a => (a.score ?? 0) >= a.exam.passingMarks).length;
  const passRate = attempts.length ? Math.round((passed / attempts.length) * 100) : 0;
  const avgTrust = trustAgg._avg.trustScore?.toFixed(1) ?? '—';
  return [
    { key: 'avgScore', label: 'Exams Conducted', value: totalExams },
    { key: 'avgTrust', label: 'Avg Trust Score', value: avgTrust },
    { key: 'completion', label: 'Avg Pass Rate', value: `${passRate}%` },
    { key: 'reliability', label: 'Avg Score', value: trustAgg._avg.scorePercentage ? `${trustAgg._avg.scorePercentage.toFixed(0)}%` : '—' },
  ];
}

export async function getScoreDistribution(examId?: string): Promise<{ range: string; count: number }[]> {
  const { institutionId } = await getSession();
  const where = examId
    ? { examId, status: { not: 'in_progress' as const } }
    : { exam: { institutionId: institutionId ?? undefined }, status: { not: 'in_progress' as const } };
  const attempts = await prisma.examAttempt.findMany({ where, select: { scorePercentage: true } });
  if (!attempts.length) return [];
  const buckets = [
    { range: '0–50', min: 0, max: 50 },
    { range: '51–60', min: 51, max: 60 },
    { range: '61–70', min: 61, max: 70 },
    { range: '71–80', min: 71, max: 80 },
    { range: '81–90', min: 81, max: 90 },
    { range: '91–100', min: 91, max: 100 },
  ];
  return buckets.map(b => ({
    range: b.range,
    count: attempts.filter(a => {
      const pct = a.scorePercentage ?? 0;
      return pct >= b.min && pct <= b.max;
    }).length,
  }));
}

export async function getTrustTrend(examId?: string): Promise<{ week: string; avgTrust: number }[]> {
  const { institutionId } = await getSession();
  const where = examId
    ? { examId }
    : { exam: { institutionId: institutionId ?? undefined } };
  const attempts = await prisma.examAttempt.findMany({
    where,
    select: { trustScore: true, startedAt: true },
    orderBy: { startedAt: 'asc' },
  });
  if (!attempts.length) return [];
  // Group into weekly buckets
  const weekMap = new Map<string, number[]>();
  for (const a of attempts) {
    const week = `Week ${Math.ceil((new Date(a.startedAt).getDate()) / 7)}`;
    const bucket = weekMap.get(week) ?? [];
    bucket.push(a.trustScore);
    weekMap.set(week, bucket);
  }
  return Array.from(weekMap.entries()).map(([week, scores]) => ({
    week,
    avgTrust: Math.round(scores.reduce((s, v) => s + v, 0) / scores.length),
  }));
}

export async function getQuestionDifficulty(examId?: string): Promise<{ difficulty: string; correct: number; incorrect: number }[]> {
  const { institutionId } = await getSession();
  const questionWhere = examId
    ? { examId }
    : { exam: { institutionId: institutionId ?? undefined } };
  const answers = await prisma.answer.findMany({
    where: { question: questionWhere },
    select: { isCorrect: true, question: { select: { difficulty: true } } },
  });
  if (!answers.length) return [];
  const buckets: Record<string, { correct: number; incorrect: number }> = {
    Easy: { correct: 0, incorrect: 0 },
    Medium: { correct: 0, incorrect: 0 },
    Hard: { correct: 0, incorrect: 0 },
  };
  for (const a of answers) {
    const d = a.question.difficulty;
    const label = d.charAt(0).toUpperCase() + d.slice(1);
    if (label in buckets) {
      if (a.isCorrect) buckets[label].correct++;
      else buckets[label].incorrect++;
    }
  }
  return Object.entries(buckets).map(([difficulty, v]) => ({ difficulty, ...v }));
}

export async function getAdminStats(): Promise<StatValue[]> {
  const { institutionId } = await getSession();
  if (!institutionId) return [];
  const [pending, teachers, students, trustAgg] = await Promise.all([
    prisma.exam.count({ where: { institutionId, approvalStatus: 'pending' } }),
    prisma.user.count({ where: { institutionId, role: 'teacher' } }),
    prisma.user.count({ where: { institutionId, role: 'student' } }),
    prisma.examAttempt.aggregate({
      where: { exam: { institutionId } },
      _avg: { trustScore: true },
    }),
  ]);
  return [
    { key: 'pendingApprovals', label: 'Pending Approvals', value: pending },
    { key: 'teachers', label: 'Total Teachers', value: teachers },
    { key: 'students', label: 'Total Students', value: students },
    { key: 'avgTrust', label: 'Avg Trust Score', value: trustAgg._avg.trustScore?.toFixed(1) ?? '—' },
  ];
}

export async function getStudentStats(): Promise<StatValue[]> {
  const { institutionId: _instId, supabaseId } = await getSession();
  if (!supabaseId) return [];
  const student = await prisma.user.findUnique({ where: { supabaseId } });
  if (!student) return [];
  const now = new Date();
  const [upcoming, completed, trustAgg, attempts] = await Promise.all([
    prisma.examEnrollment.count({
      where: { studentId: student.id, exam: { startTime: { gt: now } } },
    }),
    prisma.examAttempt.count({
      where: { studentId: student.id, status: { not: 'in_progress' } },
    }),
    prisma.examAttempt.aggregate({
      where: { studentId: student.id, status: { not: 'in_progress' } },
      _avg: { scorePercentage: true, trustScore: true },
    }),
    prisma.examAttempt.findFirst({
      where: { studentId: student.id, status: { not: 'in_progress' } },
      orderBy: { submittedAt: 'desc' },
      select: { trustScore: true },
    }),
  ]);
  const avgScore = trustAgg._avg.scorePercentage ? `${trustAgg._avg.scorePercentage.toFixed(0)}%` : '—';
  return [
    { key: 'upcoming', label: 'Upcoming Exams', value: upcoming },
    { key: 'completed', label: 'Completed', value: completed },
    { key: 'avgScore', label: 'Average Score', value: avgScore },
    { key: 'trust', label: 'Trust Score', value: attempts?.trustScore ?? 100 },
  ];
}

export async function getRecentExams() {
  const { institutionId, role, prismaUserId } = await getSession();
  if (!institutionId) return [];
  const where = role === 'teacher' && prismaUserId
    ? { institutionId, teacherId: prismaUserId }
    : { institutionId };
  const rows = await prisma.exam.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: { _count: { select: { enrollments: true } } },
  });
  return rows.map(e => ({
    id: e.id,
    title: e.title,
    course: e.subject,
    detail: `${e.duration} min · ${e._count.enrollments} students`,
    students: e._count.enrollments,
    status: e.status as 'draft' | 'scheduled' | 'live' | 'completed',
  }));
}

export async function getRecentAlerts() {
  const { institutionId, role, prismaUserId } = await getSession();
  if (!institutionId) return [];
  const examFilter = role === 'teacher' && prismaUserId
    ? { institutionId, teacherId: prismaUserId }
    : { institutionId };
  const rows = await prisma.violation.findMany({
    where: { exam: examFilter },
    orderBy: { timestamp: 'desc' },
    take: 5,
    include: { student: { select: { name: true } } },
  });
  return rows.map(v => ({
    id: v.id,
    student: v.student.name,
    event: v.description,
    time: relativeTime(v.timestamp),
    severity: v.severity as 'low' | 'medium' | 'high',
  }));
}

export async function getStudentExams() {
  const { supabaseId } = await getSession();
  if (!supabaseId) return [];
  const student = await prisma.user.findUnique({ where: { supabaseId } });
  if (!student) return [];

  const now = new Date();

  // Show all approved exams in the student's institution — no enrollment row needed
  const [exams, attempts] = await Promise.all([
    prisma.exam.findMany({
      where: {
        institutionId: student.institutionId,
        approvalStatus: 'approved',
        status: { in: ['scheduled', 'live', 'completed'] },
      },
      include: { _count: { select: { questions: true } } },
      orderBy: { startTime: 'asc' },
    }),
    prisma.examAttempt.findMany({
      where: { studentId: student.id },
      select: { examId: true, score: true, trustScore: true, status: true, scorePercentage: true },
    }),
  ]);

  const attemptMap = new Map(attempts.map(a => [a.examId, a]));

  return exams.map(exam => {
    const attempt = attemptMap.get(exam.id);
    const submitted = attempt && (attempt.status === 'submitted' || attempt.status === 'auto_submitted');

    let status: 'available' | 'upcoming' | 'completed' = 'upcoming';
    if (submitted) {
      status = 'completed';
    } else if (exam.status === 'live' || exam.startTime <= now) {
      status = 'available';
    }

    const settings = exam.settings as { resultsVisibility?: string } | null;
    const resultsHeld = settings?.resultsVisibility === 'held' && !exam.resultsPublishedAt;
    const scoreValue = submitted && !resultsHeld && attempt?.scorePercentage != null
      ? Math.round(attempt.scorePercentage) : undefined;

    return {
      id: exam.id,
      title: exam.title,
      course: exam.subject,
      status,
      schedule: exam.startTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      durationMins: exam.duration,
      questions: exam._count.questions,
      score: scoreValue,
      trust: submitted ? attempt?.trustScore : undefined,
    };
  });
}

export async function getTeachersList() {
  const { institutionId } = await getSession();
  if (!institutionId) return [];
  const teachers = await prisma.user.findMany({
    where: { institutionId, role: 'teacher' },
    include: { _count: { select: { exams: true } } },
    orderBy: { name: 'asc' },
  });
  const studentCounts = await Promise.all(
    teachers.map(t =>
      prisma.examEnrollment.count({ where: { exam: { teacherId: t.id } } })
    )
  );
  return teachers.map((t, i) => ({
    id: t.id,
    name: t.name,
    email: t.email,
    department: t.department ?? '—',
    exams: t._count.exams,
    students: studentCounts[i],
    status: 'active' as const,
  }));
}

export async function getPendingExams(): Promise<PendingExam[]> {
  const { institutionId } = await getSession();
  if (!institutionId) return [];
  const rows = await prisma.exam.findMany({
    where: { institutionId, approvalStatus: 'pending' },
    orderBy: { createdAt: 'desc' },
    include: {
      teacher: { select: { id: true, name: true } },
      _count: { select: { questions: true, enrollments: true } },
    },
  });
  return rows.map(e => ({
    id: e.id,
    title: e.title,
    subject: e.subject,
    teacher: e.teacher.name,
    teacherId: e.teacher.id,
    questions: e._count.questions,
    duration: e.duration,
    students: e._count.enrollments,
    submittedAt: e.createdAt.toISOString(),
    proctoringLevel: ((e.settings as { proctoringLevel?: string })?.proctoringLevel ?? 'standard') as PendingExam['proctoringLevel'],
  }));
}

export async function getApprovedExams() {
  const { institutionId } = await getSession();
  if (!institutionId) return [];
  const rows = await prisma.exam.findMany({
    where: { institutionId, approvalStatus: 'approved' },
    orderBy: { startTime: 'desc' },
    include: {
      teacher: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
  });
  return rows.map(e => ({
    id: e.id,
    title: e.title,
    subject: e.subject,
    teacher: e.teacher.name,
    status: e.status as 'draft' | 'scheduled' | 'live' | 'completed',
    date: e.startTime.toISOString(),
    students: e._count.enrollments,
  }));
}
