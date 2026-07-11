import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';
import { recomputeAttemptScore, runGradingForAttempt } from '@/lib/ai/grading';

// Teacher grading actions (Phase 3, doc 03 / decision 4): confirm accepts the
// latest AI suggestion, override sets the teacher's own mark (reason prompted
// in the UI), regrade re-runs the AI pass for the attempt. Confirmation is
// ALWAYS explicit — nothing auto-confirms, and only these teacher actions ever
// write Answer.marksAwarded for AI-graded answers. Each action appends to the
// AnswerGrading audit log; attempt/section totals are recomputed through the
// existing scoring paths.

const schema = z.object({
  action: z.enum(['confirm', 'override', 'regrade']),
  marks: z.number().min(0).optional(),
  feedback: z.string().max(2000).optional(),
  reason: z.string().max(1000).optional(),
});

export const POST = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ answerId: string }> },
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'teacher' && user.role !== 'admin') return forbidden();

  const { answerId } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const answer = await prisma.answer.findUnique({
    where: { id: answerId },
    include: {
      question: { select: { marks: true, exam: { select: { teacherId: true, institutionId: true } } } },
      gradings: { orderBy: { createdAt: 'desc' }, take: 1, where: { kind: 'ai_suggestion' } },
    },
  });
  if (!answer) return notFound('Answer not found');
  const exam = answer.question.exam;
  if (exam.institutionId !== user.institutionId) return forbidden();
  if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();
  if (answer.gradingStatus === null) {
    return NextResponse.json({ error: 'Answer is deterministically scored' }, { status: 409 });
  }

  const { action } = parsed.data;

  if (action === 'regrade') {
    await prisma.answer.update({ where: { id: answerId }, data: { gradingStatus: 'pending_ai' } });
    after(() => runGradingForAttempt(answer.attemptId));
    return NextResponse.json({ status: 'pending_ai' });
  }

  const latestSuggestion = answer.gradings[0] ?? null;
  let marks: number;
  let feedback: string | null;
  if (action === 'confirm') {
    if (!latestSuggestion) {
      return NextResponse.json({ error: 'No AI suggestion to confirm — use override' }, { status: 409 });
    }
    marks = Math.min(latestSuggestion.totalScore, answer.question.marks);
    feedback = parsed.data.feedback ?? latestSuggestion.feedback;
  } else {
    if (parsed.data.marks === undefined) {
      return NextResponse.json({ error: 'Override requires marks' }, { status: 400 });
    }
    marks = Math.min(parsed.data.marks, answer.question.marks);
    feedback = parsed.data.feedback ?? null;
  }

  await prisma.$transaction([
    prisma.answerGrading.create({
      data: {
        answerId,
        attemptId: answer.attemptId,
        kind: action === 'confirm' ? 'teacher_confirmation' : 'teacher_override',
        rubricSnapshot: latestSuggestion?.rubricSnapshot ?? undefined,
        totalScore: marks,
        feedback,
        rationale: action === 'override' && parsed.data.reason ? { reason: parsed.data.reason } : undefined,
        gradedById: user.id,
      },
    }),
    prisma.answer.update({
      where: { id: answerId },
      data: {
        marksAwarded: marks,
        isCorrect: marks >= answer.question.marks * 0.5,
        gradedAt: new Date(),
        gradingStatus: action === 'confirm' ? 'confirmed' : 'overridden',
      },
    }),
  ]);

  await recomputeAttemptScore(answer.attemptId);

  return NextResponse.json({
    status: action === 'confirm' ? 'confirmed' : 'overridden',
    marksAwarded: marks,
  });
});
