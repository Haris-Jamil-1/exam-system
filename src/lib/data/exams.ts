// Phase 2: replace each function body with Supabase/Prisma query scoped to institution_id.
// Signatures stay identical — only the body changes.
import type { Exam, StatValue } from '@/types';
import { mockExams } from '@/lib/mock-data/exams';
import { mockViolations } from '@/lib/mock-data/violations';

const examsDb = [...mockExams];

export async function getExams(institutionId?: string): Promise<Exam[]> {
  // Phase 2: return prisma.exam.findMany({ where: { institutionId } })
  if (institutionId) return examsDb.filter(e => e.institutionId === institutionId);
  return examsDb;
}

export async function getExamById(id: string): Promise<Exam | undefined> {
  // Phase 2: return prisma.exam.findUnique({ where: { id } }) ?? undefined
  return examsDb.find(e => e.id === id);
}

export async function createExam(data: Omit<Exam, 'id' | 'createdAt'>): Promise<Exam> {
  // Phase 2: return prisma.exam.create({ data })
  const newExam: Exam = {
    ...data,
    id: `exam-${Date.now()}`,
    createdAt: new Date().toISOString(),
    _count: { questions: 0, enrollments: 0 },
  };
  examsDb.push(newExam);
  return newExam;
}

export async function updateExam(id: string, data: Partial<Exam>): Promise<Exam | undefined> {
  // Phase 2: return prisma.exam.update({ where: { id }, data })
  const index = examsDb.findIndex(e => e.id === id);
  if (index === -1) return undefined;
  examsDb[index] = { ...examsDb[index], ...data };
  return examsDb[index];
}

export async function deleteExam(id: string): Promise<boolean> {
  // Phase 2: await prisma.exam.delete({ where: { id } }); return true
  const index = examsDb.findIndex(e => e.id === id);
  if (index === -1) return false;
  examsDb.splice(index, 1);
  return true;
}

export async function getExamStats(examId: string): Promise<StatValue[]> {
  const exam = await getExamById(examId);
  if (!exam) return [];
  const violations = mockViolations.filter(v => v.examId === examId);
  const enrollments = exam._count?.enrollments ?? 0;
  return [
    { label: 'Enrolled Students', value: enrollments },
    { label: 'Total Questions', value: exam._count?.questions ?? 0 },
    { label: 'Duration (min)', value: exam.duration },
    { label: 'Violations', value: violations.length, trend: violations.length > 5 ? 'up' : 'down' },
  ];
}
