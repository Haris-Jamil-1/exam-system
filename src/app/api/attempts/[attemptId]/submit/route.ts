import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, notFound, forbidden } from '@/lib/api-auth';
import type { Question } from '@/types';

const submitSchema = z.object({
  examId: z.string(),
  // Matching questions send { [leftOptionId]: selectedRightText }; all others send string | string[].
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())])),
  // trustScore is NOT accepted from client — calculated server-side from violation count
});

type PerQuestion = {
  questionId: string;
  stem: string;
  type: string;
  marks: number;
  response: string | string[] | Record<string, string>;
  isCorrect: boolean;
  marksAwarded: number;
};

function scoreAnswers(questions: Question[], answers: Record<string, string | string[] | Record<string, string>>) {
  let score = 0;
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const perQuestion: PerQuestion[] = [];

  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer && answer !== '') {
      perQuestion.push({ questionId: q.id, stem: q.stem, type: q.type, marks: q.marks, response: '', isCorrect: false, marksAwarded: 0 });
      continue;
    }

    let correct = false;
    let marksAwarded = 0;

    switch (q.type) {
      case 'mcq':
      case 'true_false': {
        const selectedOpt = q.options?.find(o => o.id === (answer as string));
        correct = selectedOpt?.isCorrect === true;
        marksAwarded = correct ? q.marks : 0;
        break;
      }
      case 'fill_blank':
      case 'short_answer':
        correct =
          typeof answer === 'string' &&
          typeof q.correctAnswer === 'string' &&
          answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
        marksAwarded = correct ? q.marks : 0;
        break;
      case 'mrq': {
        if (Array.isArray(answer) && q.options) {
          const correctIds = q.options.filter(o => o.isCorrect).map(o => o.id).sort();
          const selectedIds = [...answer].sort();
          correct =
            selectedIds.length === correctIds.length &&
            selectedIds.join(',') === correctIds.join(',');
        }
        marksAwarded = correct ? q.marks : 0;
        break;
      }
      case 'matching': {
        if (
          answer !== null &&
          typeof answer === 'object' &&
          !Array.isArray(answer) &&
          q.options &&
          Array.isArray(q.correctAnswer)
        ) {
          // New format: { leftOptionId: selectedRightText } — partial credit per pair
          const matchMap = answer as Record<string, string>;
          const rightLabels = q.correctAnswer as string[];
          let correctPairs = 0;
          q.options.forEach((opt, i) => {
            if (matchMap[opt.id] === rightLabels[i]) correctPairs++;
          });
          correct = correctPairs === q.options.length;
          marksAwarded = q.options.length > 0
            ? parseFloat(((q.marks / q.options.length) * correctPairs).toFixed(2))
            : 0;
        } else if (Array.isArray(answer) && q.options) {
          // Legacy format: all-or-nothing
          const correctIds = q.options.filter(o => o.isCorrect).map(o => o.id).sort();
          const selectedIds = [...answer].sort();
          correct =
            selectedIds.length === correctIds.length &&
            selectedIds.join(',') === correctIds.join(',');
          marksAwarded = correct ? q.marks : 0;
        }
        break;
      }
      case 'ordering': {
        // Partial credit: 1 point per correctly-positioned item
        if (Array.isArray(answer) && Array.isArray(q.correctAnswer) && q.options) {
          const studentTexts = (answer as string[]).map(id => q.options?.find(o => o.id === id)?.text ?? '');
          const expected = q.correctAnswer as string[];
          let correctPositions = 0;
          studentTexts.forEach((text, i) => {
            if (text === expected[i]) correctPositions++;
          });
          correct = correctPositions === expected.length;
          marksAwarded = expected.length > 0
            ? parseFloat(((q.marks / expected.length) * correctPositions).toFixed(2))
            : 0;
        }
        break;
      }
      case 'essay':
      case 'coding':
      case 'file_upload':
        // Manual / async grading
        correct = false;
        marksAwarded = 0;
        break;
    }

    score += marksAwarded;
    perQuestion.push({ questionId: q.id, stem: q.stem, type: q.type, marks: q.marks, response: answer ?? '', isCorrect: correct, marksAwarded });
  }

  return { score, totalMarks, perQuestion };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { attemptId } = await params;
  const body = await request.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { examId, answers } = parsed.data;

  const attempt = await prisma.examAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) return notFound('Attempt not found');
  if (attempt.studentId !== user.id) return forbidden();
  if (attempt.examId !== examId) return forbidden();
  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Attempt already submitted' }, { status: 409 });
  }

  const questionRows = await prisma.question.findMany({
    where: { examId },
    orderBy: { order: 'asc' },
    include: { options: { orderBy: { order: 'asc' } } },
  });

  const questions: Question[] = questionRows.map(q => ({
    id: q.id,
    examId: q.examId,
    type: q.type as Question['type'],
    stem: q.stem,
    marks: q.marks,
    difficulty: q.difficulty as Question['difficulty'],
    order: q.order,
    required: q.required,
    explanation: q.explanation ?? undefined,
    correctAnswer: q.correctAnswer as string | string[] | undefined,
    options: q.options.map(o => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
  }));

  const { score, totalMarks, perQuestion } = scoreAnswers(questions, answers);

  const violationCount = await prisma.violation.count({ where: { attemptId } });
  const trustScore = Math.max(0, 100 - violationCount * 15);
  const scorePercentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;

  await prisma.$transaction([
    ...perQuestion.map(a =>
      prisma.answer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: a.questionId } },
        create: {
          attemptId,
          questionId: a.questionId,
          response: a.response as object,
          isCorrect: a.isCorrect,
          marksAwarded: a.marksAwarded,
          gradedAt: new Date(),
        },
        update: {
          response: a.response as object,
          isCorrect: a.isCorrect,
          marksAwarded: a.marksAwarded,
          gradedAt: new Date(),
        },
      })
    ),
    prisma.examAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'submitted',
        submittedAt: new Date(),
        score,
        totalMarks,
        scorePercentage,
        trustScore,
        violationCount,
      },
    }),
  ]);

  return NextResponse.json({
    id: attemptId,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
    score,
    totalMarks,
    scorePercentage,
    trustScore,
    violationCount,
    // Safe to return: no correctAnswer or isCorrect leakage, only what student earned
    perQuestion: perQuestion.map(({ questionId, stem, type, marks, marksAwarded }) => ({
      questionId, stem, type, marks, marksAwarded,
    })),
  });
}
