'use server';
import { prisma } from '@/lib/prisma';
import type { Violation } from '@/types';

type PrismaViolation = {
  id: string;
  attemptId: string;
  studentId: string;
  examId: string;
  type: string;
  severity: string;
  description: string;
  screenshotUrl: string | null;
  timestamp: Date;
};

function mapViolation(v: PrismaViolation): Violation {
  return {
    id: v.id,
    attemptId: v.attemptId,
    studentId: v.studentId,
    examId: v.examId,
    type: v.type as Violation['type'],
    severity: v.severity as Violation['severity'],
    description: v.description,
    screenshotUrl: v.screenshotUrl ?? undefined,
    timestamp: v.timestamp.toISOString(),
  };
}

export async function getViolations(examId?: string, studentId?: string): Promise<Violation[]> {
  const rows = await prisma.violation.findMany({
    where: {
      ...(examId && { examId }),
      ...(studentId && { studentId }),
    },
    orderBy: { timestamp: 'desc' },
  });
  return rows.map(mapViolation);
}

export async function getLiveAlerts(examId: string): Promise<Violation[]> {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const rows = await prisma.violation.findMany({
    where: { examId, timestamp: { gte: cutoff } },
    orderBy: { timestamp: 'desc' },
    take: 20,
  });
  return rows.map(mapViolation);
}

export async function logViolation(data: Omit<Violation, 'id'>): Promise<Violation> {
  try {
    const row = await prisma.violation.create({
      data: {
        attemptId: data.attemptId,
        studentId: data.studentId,
        examId: data.examId,
        type: data.type,
        severity: data.severity,
        description: data.description,
        screenshotUrl: data.screenshotUrl ?? null,
      },
    });
    return mapViolation(row);
  } catch (err) {
    console.error('[logViolation] Prisma error:', err);
    throw err;
  }
}

export async function getMonitorFeed(examId: string): Promise<Violation[]> {
  const rows = await prisma.violation.findMany({
    where: { examId },
    orderBy: { timestamp: 'desc' },
  });
  return rows.map(mapViolation);
}
