import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getQuestions } from '@/lib/data';
import type { Question } from '@/types';

const submitSchema = z.object({
  examId: z.string(),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  violationCount: z.number().default(0),
  trustScore: z.number().default(100),
});

function scoreAnswers(questions: Question[], answers: Record<string, string | string[]>) {
  let score = 0;
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);

  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer || !q.correctAnswer) continue;

    let correct = false;
    switch (q.type) {
      case 'mcq':
      case 'true_false':
        correct = answer === q.correctAnswer;
        break;
      case 'fill_blank':
      case 'short_answer':
        correct =
          typeof answer === 'string' &&
          typeof q.correctAnswer === 'string' &&
          answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
        break;
      case 'mrq':
      case 'matching':
        // Both arrays; order-independent comparison
        if (Array.isArray(answer) && Array.isArray(q.correctAnswer)) {
          correct =
            answer.length === q.correctAnswer.length &&
            [...answer].sort().join(',') === [...q.correctAnswer].sort().join(',');
        }
        break;
      case 'ordering':
        // Order matters
        if (Array.isArray(answer) && Array.isArray(q.correctAnswer)) {
          correct =
            answer.length === q.correctAnswer.length &&
            answer.join(',') === q.correctAnswer.join(',');
        }
        break;
      case 'essay':
        // Manual grading required — always 0 until Phase 3 AI grading
        correct = false;
        break;
    }

    if (correct) score += q.marks;
  }

  return { score, totalMarks };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;
  const body = await request.json();
  const parsed = submitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { examId, answers, violationCount, trustScore } = parsed.data;

  // Load questions with full answer keys server-side
  const questions = await getQuestions(examId);
  const { score, totalMarks } = scoreAnswers(questions, answers);

  return NextResponse.json({
    id: attemptId,
    status: 'submitted',
    submittedAt: new Date().toISOString(),
    score,
    totalMarks,
    scorePercentage: totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0,
    trustScore,
    violationCount,
  });
}
