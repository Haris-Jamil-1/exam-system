import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import { getAuthUser, unauthorized, notFound, forbidden, withErrorHandling } from '@/lib/api-auth';
import { materializePooledQuestions } from '@/lib/data/pooling';
import { InsufficientPoolError } from '@/lib/data/pooling-errors';
import type { ExamSettings } from '@/types';

const startSchema = z.object({ examId: z.string() });

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  // Only students take exams
  if (user.role !== 'student') return forbidden();

  const body = await request.json();
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { examId } = parsed.data;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      startTime: true, endTime: true, status: true, institutionId: true, settings: true,
      sections: { select: { sectionWeight: true } },
    },
  });
  if (!exam) return notFound();

  // Only gate a brand-new attempt behind the scheduled window — an attempt
  // that already exists may always be resumed (e.g. to finish submitting
  // right at the boundary). This is enforced here, not just in the
  // exam-taking UI's waiting room, since that client-side check is trivially
  // bypassed with a direct API call.
  const existing = await prisma.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId: user.id } },
  });
  if (!existing) {
    const now = new Date();
    // A teacher going live early (status 'live') intentionally overrides the
    // scheduled startTime — mirrors the client's waiting-room override logic.
    if (now < exam.startTime && exam.status !== 'live') {
      return NextResponse.json({ error: 'not_started', message: 'This exam has not started yet.' }, { status: 403 });
    }
    if (now > exam.endTime) {
      return NextResponse.json({ error: 'exam_ended', message: 'This exam has already ended.' }, { status: 403 });
    }
    // Phase 7: a sectioned exam's weights must sum to exactly 100% (within float
    // tolerance) before a student can start it — the wizard's own validator is a
    // non-blocking warning only, trivially bypassed with a direct API call, so this
    // is the one place it's actually enforced. Deliberately not auto-normalized
    // (e.g. scaling weights to sum to 100) — a misconfigured blueprint should block
    // the exam, not silently reweight it out from under the teacher.
    if (exam.sections.length > 0) {
      const weightSum = exam.sections.reduce((sum, s) => sum + s.sectionWeight, 0);
      if (Math.abs(weightSum - 100) > 0.01) {
        return NextResponse.json({
          error: 'invalid_section_weights',
          message: `This exam's section weights sum to ${weightSum}%, not 100% — contact your instructor.`,
        }, { status: 400 });
      }
    }
  }

  // Auto-enroll student so teacher can see them in results
  await prisma.examEnrollment.upsert({
    where: { examId_studentId: { examId, studentId: user.id } },
    create: { examId, studentId: user.id },
    update: {},
  });

  // Attempt creation + pooled-question materialization run in one transaction so two
  // near-simultaneous requests for the same student/exam (e.g. a double-click or two open
  // tabs) can't both win the "brand new attempt" race and each materialize their own private
  // question set. `create` (not `upsert`) means only one concurrent caller's insert actually
  // succeeds — the DB's unique constraint on (examId, studentId) is the sole arbiter; the
  // loser catches the unique-violation and falls back to reading the winner's row, never
  // running materialization itself. If the pool has shrunk below the blueprint since it was
  // saved, materializePooledQuestions throws InsufficientPoolError and the whole transaction
  // (including the attempt row) rolls back — no half-materialized attempt is left behind.
  let attempt: Prisma.ExamAttemptModel;
  try {
    attempt = await prisma.$transaction(async (tx) => {
      let created: Prisma.ExamAttemptModel;
      let isNew = true;
      try {
        created = await tx.examAttempt.create({
          data: { examId, studentId: user.id, status: 'in_progress' },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          created = await tx.examAttempt.findUniqueOrThrow({
            where: { examId_studentId: { examId, studentId: user.id } },
          });
          isNew = false;
        } else {
          throw err;
        }
      }

      // Stratified dynamic pooling: only for the attempt this call actually created (never
      // re-draw on resume — the student must keep the same private question set every time
      // they reopen the exam, and never double-draw when a concurrent request already won).
      if (isNew) {
        const settings = exam.settings as unknown as ExamSettings;
        if (settings?.dynamicPoolingBlueprint && settings.dynamicPoolingBankIds?.length) {
          await materializePooledQuestions(tx, {
            examId,
            institutionId: exam.institutionId,
            attemptId: created.id,
            bankIds: settings.dynamicPoolingBankIds,
            blueprint: settings.dynamicPoolingBlueprint,
          });
        }
      }
      return created;
    });
  } catch (err) {
    if (err instanceof InsufficientPoolError) {
      return NextResponse.json({
        error: 'insufficient_pool',
        message: 'This exam cannot start right now — its question pool is smaller than configured. Contact your instructor.',
        shortfalls: err.shortfalls,
      }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({
    id: attempt.id,
    examId: attempt.examId,
    studentId: attempt.studentId,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    trustScore: attempt.trustScore,
    violationCount: attempt.violationCount,
  }, { status: 201 });
});
