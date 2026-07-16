import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, notFound, forbidden, withErrorHandling } from '@/lib/api-auth';
import { runGradingForAttempt } from '@/lib/ai/grading';
import { scoreAnswers, computeSectionScores, type PerQuestion } from '@/lib/scoring';
import type { Question, ExamSection, ExamSettings } from '@/types';

const submitSchema = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())])),
});

export const POST = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ attemptId: string; sectionId: string }> }
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { attemptId, sectionId } = await params;
  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return notFound('Attempt not found');
  if (attempt.studentId !== user.id) return forbidden();
  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 });
  }

  const section = await prisma.examSection.findUnique({ where: { id: sectionId } });
  if (!section || section.examId !== attempt.examId) return notFound('Section not found');

  const sectionAttempt = await prisma.sectionAttempt.findUnique({ where: { attemptId_sectionId: { attemptId, sectionId } } });
  if (!sectionAttempt || sectionAttempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Section already submitted' }, { status: 409 });
  }

  const exam = await prisma.exam.findUnique({ where: { id: attempt.examId }, select: { duration: true, endTime: true, settings: true } });

  const questionRows = await prisma.question.findMany({
    where: { examId: attempt.examId, sectionId, OR: [{ attemptId: null }, { attemptId }] },
    orderBy: { order: 'asc' },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  const questions: Question[] = questionRows.map(q => ({
    id: q.id, examId: q.examId, sectionId: q.sectionId ?? undefined, type: q.type as Question['type'],
    stem: q.stem, marks: q.marks, difficulty: q.difficulty as Question['difficulty'], order: q.order,
    required: q.required, explanation: q.explanation ?? undefined,
    correctAnswer: q.correctAnswer as string | string[] | undefined,
    options: q.options.map(o => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
  }));

  // Phase 7: isItemSequential defense-in-depth — same as the non-sectioned submit route.
  const settings = exam?.settings as unknown as ExamSettings | undefined;
  let effectiveAnswers = parsed.data.answers;
  if (settings?.isItemSequential) {
    const locks = await prisma.itemLock.findMany({ where: { attemptId }, select: { questionId: true, response: true } });
    if (locks.length > 0) {
      effectiveAnswers = { ...parsed.data.answers };
      for (const lock of locks) {
        if (lock.response !== null) effectiveAnswers[lock.questionId] = lock.response as typeof parsed.data.answers[string];
      }
    }
  }

  const { perQuestion } = scoreAnswers(questions, effectiveAnswers);

  // Section deadline: whichever comes first — this section's own duration (from when the
  // student clicked "Start Section", not the overall attempt) or the exam's global close time.
  // Same "whichever is sooner" pattern as the overall exam (items 1-4), scoped to one section.
  let sectionStatus: 'submitted' | 'auto_submitted' = 'submitted';
  if (exam && sectionAttempt.startedAt) {
    const deadlineMs = section.durationMinutes
      ? Math.min(sectionAttempt.startedAt.getTime() + section.durationMinutes * 60_000, exam.endTime.getTime())
      : exam.endTime.getTime();
    if (Date.now() > deadlineMs + 5000) sectionStatus = 'auto_submitted';
  }

  const sectionRawScore = perQuestion.reduce((s, pq) => s + pq.marksAwarded, 0);
  const sectionTotalMarks = perQuestion.reduce((s, pq) => s + pq.marks, 0);
  const sectionScorePct = sectionTotalMarks > 0 ? (sectionRawScore / sectionTotalMarks) * 100 : 0;
  const sectionPassed = section.passingThreshold === null || section.passingThreshold === undefined
    ? true
    : sectionScorePct >= section.passingThreshold;

  // Essay/coding answers enter the grading state machine (doc 03) — same
  // two-stage flow as the non-sectioned submit route.
  const needsGrading = new Set(
    questions.filter(q => q.type === 'essay' || q.type === 'coding').map(q => q.id),
  );

  await prisma.$transaction([
    ...perQuestion.map(a =>
      prisma.answer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
        create: { attemptId, questionId: a.questionId, response: a.response as object, isCorrect: a.isCorrect, marksAwarded: a.marksAwarded, gradedAt: new Date(), gradingStatus: needsGrading.has(a.questionId) ? 'pending_ai' : null },
        update: { response: a.response as object, isCorrect: a.isCorrect, marksAwarded: a.marksAwarded, gradedAt: new Date(), gradingStatus: needsGrading.has(a.questionId) ? 'pending_ai' : null },
      })
    ),
    prisma.sectionAttempt.update({
      where: { id: sectionAttempt.id },
      data: {
        status: sectionStatus,
        submittedAt: new Date(),
        score: sectionRawScore,
        totalMarks: sectionTotalMarks,
        scorePercentage: Math.round(sectionScorePct * 100) / 100,
        passed: sectionPassed,
      },
    }),
  ]);

  // Is this the last section? If so, finalize the whole attempt now — every section's
  // SectionAttempt row is submitted by this point, so the composite can be computed.
  const allSections = await prisma.examSection.findMany({ where: { examId: attempt.examId }, orderBy: { orderIndex: 'asc' } });
  const isLastSection = allSections.length > 0 && section.orderIndex >= Math.max(...allSections.map(s => s.orderIndex));

  let overallResult: { score: number; totalMarks: number; scorePercentage: number; failed: boolean; status: string } | null = null;

  if (isLastSection) {
    const allAnswers = await prisma.answer.findMany({
      where: { attemptId },
      include: { question: { select: { sectionId: true, marks: true, type: true, stem: true } } },
    });
    const allPerQuestion: PerQuestion[] = allAnswers.map(a => ({
      questionId: a.questionId, stem: a.question.stem, type: a.question.type, marks: a.question.marks,
      response: (a.response as PerQuestion['response']) ?? '', isCorrect: a.isCorrect ?? false, marksAwarded: a.marksAwarded ?? 0,
    }));
    const allQuestions: Question[] = allAnswers.map(a => ({
      id: a.questionId, examId: attempt.examId, sectionId: a.question.sectionId ?? undefined,
      type: a.question.type as Question['type'], stem: a.question.stem, marks: a.question.marks,
      difficulty: 'medium', order: 0,
    }));
    const sectionTypes: ExamSection[] = allSections.map(s => ({
      id: s.id, examId: s.examId, title: s.title, instructions: s.instructions ?? undefined,
      durationMinutes: s.durationMinutes ?? undefined, orderIndex: s.orderIndex, sectionWeight: s.sectionWeight,
      passingThreshold: s.passingThreshold ?? undefined, createdAt: s.createdAt.toISOString(),
    }));

    const hierarchical = computeSectionScores(allPerQuestion, allQuestions, sectionTypes);
    const rawScoreSum = hierarchical.sections.reduce((s, sec) => s + sec.rawScore, 0);
    const rawTotalSum = hierarchical.sections.reduce((s, sec) => s + sec.totalMarks, 0);

    const violationCount = await prisma.violation.count({ where: { attemptId } });
    const trustScore = Math.max(0, 100 - violationCount * 15);

    // Availability window vs. duration, same "whichever is sooner" rule as the overall exam
    // (item 2) — recomputed independently here too, matching the flat submit route's logic.
    let overallStatus: 'submitted' | 'auto_submitted' = sectionStatus;
    if (exam) {
      const deadlineMs = Math.min(attempt.startedAt.getTime() + exam.duration * 60_000, exam.endTime.getTime());
      if (Date.now() > deadlineMs + 5000) overallStatus = 'auto_submitted';
    }

    await prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: overallStatus,
        submittedAt: new Date(),
        score: rawScoreSum,
        totalMarks: rawTotalSum,
        scorePercentage: hierarchical.compositeScore,
        trustScore,
        violationCount,
      },
    });

    overallResult = {
      score: rawScoreSum, totalMarks: rawTotalSum, scorePercentage: hierarchical.compositeScore,
      failed: hierarchical.failed, status: overallStatus,
    };
  }

  // AI grading runs once the whole attempt is finalized — a mid-exam pass
  // would race with sections still being written.
  if (isLastSection) {
    after(() => runGradingForAttempt(attemptId));
  }

  const nextSection = allSections.find(s => s.orderIndex > section.orderIndex);

  return NextResponse.json({
    sectionId,
    status: sectionStatus,
    score: sectionRawScore,
    totalMarks: sectionTotalMarks,
    scorePercentage: Math.round(sectionScorePct * 100) / 100,
    passed: sectionPassed,
    isLastSection,
    nextSectionId: nextSection?.id ?? null,
    overallResult,
  });
});
