'use server';
import { prisma } from '@/lib/prisma';
import type { Question, Option, PublicQuestion, TestCase } from '@/types';

type PrismaOption = { id: string; text: string; isCorrect: boolean; questionId: string; order: number };

function mapOption(o: PrismaOption): Option {
  return { id: o.id, text: o.text, isCorrect: o.isCorrect };
}

type PrismaQuestion = {
  id: string; examId: string; type: string; stem: string;
  marks: number; difficulty: string; order: number; required: boolean;
  explanation: string | null; correctAnswer: unknown; learningObjectiveId: string | null;
  codeLanguage: string | null; starterCode: string | null; testCases: unknown;
  allowedFileTypes: string[]; maxFileSizeMB: number | null;
  options: PrismaOption[];
};

function mapQuestion(q: PrismaQuestion): Question {
  return {
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
    learningObjectiveId: q.learningObjectiveId ?? undefined,
    codeLanguage: q.codeLanguage ?? undefined,
    starterCode: q.starterCode ?? undefined,
    testCases: q.testCases as TestCase[] | undefined,
    allowedFileTypes: q.allowedFileTypes.length ? q.allowedFileTypes : undefined,
    maxFileSizeMB: q.maxFileSizeMB ?? undefined,
    options: q.options.length ? q.options.map(mapOption) : undefined,
  };
}

export async function getQuestionsForStudent(examId: string): Promise<PublicQuestion[]> {
  const all = await getQuestions(examId);
  return all.map(({ correctAnswer: _ca, explanation: _ex, options, ...rest }) => ({
    ...rest,
    options: options?.map(({ isCorrect: _ic, ...opt }) => opt),
  }));
}

export async function getQuestions(examId: string): Promise<Question[]> {
  const rows = await prisma.question.findMany({
    where: { examId },
    orderBy: { order: 'asc' },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  return rows.map(mapQuestion);
}

export async function getQuestionById(id: string): Promise<Question | undefined> {
  const row = await prisma.question.findUnique({
    where: { id },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  return row ? mapQuestion(row) : undefined;
}

export async function createQuestion(data: Omit<Question, 'id'>): Promise<Question> {
  const { options, ...rest } = data;
  try {
    const row = await prisma.question.create({
      data: {
        examId: rest.examId,
        type: rest.type,
        stem: rest.stem,
        marks: rest.marks,
        difficulty: rest.difficulty,
        order: rest.order,
        required: rest.required ?? false,
        explanation: rest.explanation ?? null,
        ...(rest.correctAnswer !== undefined && { correctAnswer: rest.correctAnswer as object }),
        learningObjectiveId: rest.learningObjectiveId ?? null,
        codeLanguage: rest.codeLanguage ?? null,
        starterCode: rest.starterCode ?? null,
        ...(rest.testCases !== undefined && { testCases: rest.testCases as object }),
        allowedFileTypes: rest.allowedFileTypes ?? [],
        maxFileSizeMB: rest.maxFileSizeMB ?? null,
        options: options?.length
          ? { create: options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i })) }
          : undefined,
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    return mapQuestion(row);
  } catch (err) {
    console.error('[createQuestion] Prisma error:', err);
    throw err;
  }
}

export async function updateQuestion(id: string, data: Partial<Question>): Promise<Question | undefined> {
  const row = await prisma.question.update({
    where: { id },
    data: {
      ...(data.type && { type: data.type }),
      ...(data.stem && { stem: data.stem }),
      ...(data.marks !== undefined && { marks: data.marks }),
      ...(data.difficulty && { difficulty: data.difficulty }),
      ...(data.order !== undefined && { order: data.order }),
      ...(data.required !== undefined && { required: data.required }),
      ...(data.explanation !== undefined && { explanation: data.explanation ?? null }),
      ...(data.correctAnswer !== undefined && { correctAnswer: data.correctAnswer as object }),
      ...(data.codeLanguage !== undefined && { codeLanguage: data.codeLanguage ?? null }),
      ...(data.starterCode !== undefined && { starterCode: data.starterCode ?? null }),
      ...(data.testCases !== undefined && { testCases: data.testCases as object }),
      ...(data.allowedFileTypes && { allowedFileTypes: data.allowedFileTypes }),
      ...(data.maxFileSizeMB !== undefined && { maxFileSizeMB: data.maxFileSizeMB ?? null }),
    },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  return mapQuestion(row);
}

export async function deleteQuestion(id: string): Promise<boolean> {
  await prisma.question.delete({ where: { id } });
  return true;
}

export async function reorderQuestions(examId: string, orderedIds: string[]): Promise<Question[]> {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.question.update({ where: { id }, data: { order: index + 1 } })
    )
  );
  return getQuestions(examId);
}
