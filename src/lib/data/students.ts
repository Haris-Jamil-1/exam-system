// Phase 2: replace each function body with Supabase/Prisma query.
import type { CurrentUser, MonitorStudent } from '@/types';
import { mockUsers } from '@/lib/mock-data/users';
import { mockViolations } from '@/lib/mock-data/violations';

export async function getStudents(institutionId?: string): Promise<CurrentUser[]> {
  // Phase 2: prisma.user.findMany({ where: { role: 'student', institutionId } })
  return mockUsers.filter(u => {
    if (u.role !== 'student') return false;
    if (institutionId) return u.institutionId === institutionId;
    return true;
  });
}

export async function getStudentById(id: string): Promise<CurrentUser | undefined> {
  // Phase 2: prisma.user.findUnique({ where: { id } }) ?? undefined
  return mockUsers.find(u => u.id === id && u.role === 'student');
}

export async function getStudentsForExam(_examId: string): Promise<CurrentUser[]> {
  // Phase 2: prisma.examEnrollment.findMany({ where: { examId }, include: { student: true } }).map(e => e.student)
  return mockUsers.filter(u => u.role === 'student' && u.institutionId === 'inst-1');
}

export async function getMonitorStudents(examId: string): Promise<MonitorStudent[]> {
  // Phase 2: join exam_enrollments + exam_attempts + violations for live status
  const students = (await getStudentsForExam(examId)).slice(0, 12);
  const statuses: MonitorStudent['status'][] = [
    'active', 'active', 'active', 'warning', 'flagged',
    'active', 'submitted', 'active', 'warning', 'active', 'active', 'flagged',
  ];
  return students.map((s, i) => {
    const vCount = mockViolations.filter(v => v.studentId === s.id && v.examId === examId).length;
    return {
      id: s.id,
      name: s.name,
      avatarUrl: s.avatarUrl,
      status: statuses[i] ?? 'active',
      violationCount: vCount,
      trustScore: Math.max(40, 100 - vCount * 15),
      lastSeen: new Date(Date.now() - Math.floor(Math.random() * 120000)).toISOString(),
    };
  });
}
