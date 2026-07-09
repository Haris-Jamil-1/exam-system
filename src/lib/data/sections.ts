'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { ExamSection, SectionAttempt } from '@/types';

async function getCallerPrismaUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { supabaseId: user.id } });
}

async function assertExamOwnership(examId: string) {
  const caller = await getCallerPrismaUser();
  if (!caller) throw new Error('Unauthorized');
  const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { teacherId: true, institutionId: true } });
  if (!exam || exam.institutionId !== caller.institutionId) throw new Error('Forbidden');
  if (caller.role === 'teacher' && exam.teacherId !== caller.id) throw new Error('Forbidden');
  return exam;
}

type PrismaSection = {
  id: string; examId: string; title: string; instructions: string | null;
  durationMinutes: number | null; orderIndex: number; sectionWeight: number;
  passingThreshold: number | null; createdAt: Date;
  _count?: { questions: number };
};

function mapSection(s: PrismaSection): ExamSection {
  return {
    id: s.id,
    examId: s.examId,
    title: s.title,
    instructions: s.instructions ?? undefined,
    durationMinutes: s.durationMinutes ?? undefined,
    orderIndex: s.orderIndex,
    sectionWeight: s.sectionWeight,
    passingThreshold: s.passingThreshold ?? undefined,
    createdAt: s.createdAt.toISOString(),
    questionCount: s._count?.questions,
  };
}

/** Public read — used by both the teacher builder/editor and the student exam page. */
export async function getSections(examId: string): Promise<ExamSection[]> {
  const rows = await prisma.examSection.findMany({
    where: { examId },
    orderBy: { orderIndex: 'asc' },
    include: { _count: { select: { questions: true } } },
  });
  return rows.map(mapSection);
}

export async function createSection(data: Omit<ExamSection, 'id' | 'createdAt' | 'questionCount'>): Promise<ExamSection> {
  await assertExamOwnership(data.examId);
  const row = await prisma.examSection.create({
    data: {
      examId: data.examId,
      title: data.title,
      instructions: data.instructions ?? null,
      durationMinutes: data.durationMinutes ?? null,
      orderIndex: data.orderIndex,
      sectionWeight: data.sectionWeight,
      passingThreshold: data.passingThreshold ?? null,
    },
    include: { _count: { select: { questions: true } } },
  });
  return mapSection(row);
}

export async function updateSection(id: string, data: Partial<ExamSection>): Promise<ExamSection | undefined> {
  const existing = await prisma.examSection.findUnique({ where: { id }, select: { examId: true } });
  if (!existing) return undefined;
  await assertExamOwnership(existing.examId);
  const row = await prisma.examSection.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.instructions !== undefined && { instructions: data.instructions ?? null }),
      ...(data.durationMinutes !== undefined && { durationMinutes: data.durationMinutes ?? null }),
      ...(data.orderIndex !== undefined && { orderIndex: data.orderIndex }),
      ...(data.sectionWeight !== undefined && { sectionWeight: data.sectionWeight }),
      ...(data.passingThreshold !== undefined && { passingThreshold: data.passingThreshold ?? null }),
    },
    include: { _count: { select: { questions: true } } },
  });
  return mapSection(row);
}

/** Deletes the section AND every question assigned to it (cascade) — the caller UI must warn
 * about this first if the section has questions; there is no "orphan the questions" mode. */
export async function deleteSection(id: string): Promise<boolean> {
  const existing = await prisma.examSection.findUnique({ where: { id }, select: { examId: true } });
  if (!existing) return false;
  await assertExamOwnership(existing.examId);
  await prisma.examSection.delete({ where: { id } });
  return true;
}

/**
 * A student's own progress across every section of one attempt — used to resume a sectioned
 * exam correctly (which section is still in progress, which are already submitted/locked).
 * Also usable by a teacher/admin reviewing a specific attempt (same ownership rule as the
 * rest of this app's per-student review pages).
 */
export async function getSectionAttempts(attemptId: string): Promise<SectionAttempt[]> {
  const caller = await getCallerPrismaUser();
  if (!caller) return [];
  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId }, select: { studentId: true, examId: true } });
  if (!attempt) return [];
  if (attempt.studentId !== caller.id) {
    // Not the student themselves — only their own teacher/institution admin may view it.
    const exam = await prisma.exam.findUnique({ where: { id: attempt.examId }, select: { teacherId: true, institutionId: true } });
    if (!exam || exam.institutionId !== caller.institutionId) return [];
    if (caller.role === 'teacher' && exam.teacherId !== caller.id) return [];
    if (caller.role === 'student') return [];
  }
  const rows = await prisma.sectionAttempt.findMany({ where: { attemptId } });
  return rows.map(r => ({
    id: r.id,
    attemptId: r.attemptId,
    sectionId: r.sectionId,
    status: r.status,
    startedAt: r.startedAt?.toISOString(),
    submittedAt: r.submittedAt?.toISOString(),
    score: r.score ?? undefined,
    totalMarks: r.totalMarks ?? undefined,
    scorePercentage: r.scorePercentage ?? undefined,
    passed: r.passed ?? undefined,
  }));
}
