// Phase 2: replace each function body with Supabase/Prisma query.
// Realtime subscription (getLiveAlerts) will use Supabase Realtime channel in Phase 2.
import type { Violation } from '@/types';
import { mockViolations } from '@/lib/mock-data/violations';

const violationsDb = [...mockViolations];

export async function getViolations(examId?: string, studentId?: string): Promise<Violation[]> {
  // Phase 2: prisma.violation.findMany({ where: { examId, studentId } })
  return violationsDb.filter(v => {
    if (examId && v.examId !== examId) return false;
    if (studentId && v.studentId !== studentId) return false;
    return true;
  });
}

export async function getLiveAlerts(examId: string): Promise<Violation[]> {
  // Phase 2: supabase.from('violations').select().eq('examId', examId).order('timestamp', { ascending: false }).limit(20)
  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  return violationsDb
    .filter(v => v.examId === examId && v.timestamp >= cutoff)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);
}

export async function logViolation(data: Omit<Violation, 'id'>): Promise<Violation> {
  // Phase 2: return prisma.violation.create({ data })
  const newViolation: Violation = { ...data, id: `v-${Date.now()}` };
  violationsDb.push(newViolation);
  return newViolation;
}

export async function getMonitorFeed(examId: string): Promise<Violation[]> {
  // Phase 2: prisma.violation.findMany({ where: { examId }, orderBy: { timestamp: 'desc' } })
  return violationsDb
    .filter(v => v.examId === examId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
