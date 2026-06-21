import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getExams, createExam } from '@/lib/data';

const examSettingsSchema = z.object({
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  showResultsAfter: z.boolean().default(true),
  allowedViolations: z.number().default(3),
  proctoringLevel: z.enum(['basic', 'standard', 'strict']).default('standard'),
});

const createExamSchema = z.object({
  title: z.string().min(3),
  subject: z.string().min(2),
  duration: z.number().min(5),
  totalMarks: z.number().min(1),
  passingMarks: z.number().min(1),
  status: z.enum(['draft', 'scheduled', 'live', 'completed']).default('draft'),
  startTime: z.string(),
  endTime: z.string(),
  institutionId: z.string(),
  teacherId: z.string(),
  maxViolations: z.number().default(3),
  settings: examSettingsSchema,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const institutionId = searchParams.get('institutionId') ?? undefined;
  const exams = await getExams(institutionId);
  return NextResponse.json(exams);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createExamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const exam = await createExam(parsed.data as Parameters<typeof createExam>[0]);
  return NextResponse.json(exam, { status: 201 });
}
