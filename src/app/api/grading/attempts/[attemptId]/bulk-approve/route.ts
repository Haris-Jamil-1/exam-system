import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';
import { recomputeAttemptScore } from '@/lib/ai/grading';

// Phase 7 Task 2: "Approve All" — transitions every currently-unmodified AI-suggested answer
// in one attempt to the finalized ("confirmed") state in a single action, matching what a
// single confirm() call on /api/grading/answers/[answerId] does per-item. Same permission
// model as that route (teacher who owns the exam, or an institution admin), traced through
// Answer -> Question -> Exam since Question carries examId/teacherId directly.
//
// Judgment call (flagged in PHASE_7_PROGRESS.md, not decided silently): answers already in
// `overridden` status are counted as already-finalized in the response but their marks and
// status are left untouched — they already represent a teacher's own explicit, specific mark,
// and overwriting them with whatever the AI originally suggested would be the exact
// "double-processed" outcome the spec warns against. Only `ai_suggested` (never touched by a
// teacher) answers actually transition here.
export const POST = withErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'teacher' && user.role !== 'admin') return forbidden();

  const { attemptId } = await params;

  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId }, select: { examId: true } });
  if (!attempt) return notFound('Attempt not found');

  const exam = await prisma.exam.findUnique({ where: { id: attempt.examId }, select: { teacherId: true, institutionId: true } });
  if (!exam) return notFound('Attempt not found');
  // Matches the sibling /api/grading/answers/[answerId] route's exact same checks.
  if (exam.institutionId !== user.institutionId) return forbidden();
  if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();

  const answers = await prisma.answer.findMany({
    where: { attemptId, gradingStatus: { not: null } },
    include: {
      question: { select: { marks: true } },
      gradings: { orderBy: { createdAt: 'desc' }, take: 1, where: { kind: 'ai_suggestion' } },
    },
  });

  let approved = 0;
  let alreadyFinalized = 0;
  let notReady = 0;
  const mutations: Prisma.PrismaPromise<unknown>[] = [];

  for (const answer of answers) {
    if (answer.gradingStatus === 'confirmed' || answer.gradingStatus === 'overridden') {
      alreadyFinalized++;
      continue;
    }
    const suggestion = answer.gradings[0];
    if (answer.gradingStatus === 'pending_ai' || !suggestion) {
      notReady++;
      continue;
    }
    const marks = Math.min(suggestion.totalScore, answer.question.marks);
    mutations.push(
      prisma.answerGrading.create({
        data: {
          answerId: answer.id,
          attemptId,
          kind: 'teacher_confirmation',
          rubricSnapshot: suggestion.rubricSnapshot ?? undefined,
          totalScore: marks,
          feedback: suggestion.feedback,
          gradedById: user.id,
        },
      }),
      prisma.answer.update({
        where: { id: answer.id },
        data: { marksAwarded: marks, isCorrect: marks >= answer.question.marks * 0.5, gradedAt: new Date(), gradingStatus: 'confirmed' },
      }),
    );
    approved++;
  }

  if (mutations.length > 0) {
    await prisma.$transaction(mutations);
    await recomputeAttemptScore(attemptId);
  }

  return NextResponse.json({ approved, alreadyFinalized, notReady, total: answers.length });
});
