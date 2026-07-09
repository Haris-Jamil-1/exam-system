'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { Question, Option, PublicQuestion, TestCase } from '@/types';

async function getCallerPrismaUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return prisma.user.findUnique({ where: { supabaseId: user.id } });
}

type PrismaOption = { id: string; text: string; isCorrect: boolean; questionId: string; order: number };

function mapOption(o: PrismaOption): Option {
  return { id: o.id, text: o.text, isCorrect: o.isCorrect };
}

type PrismaQuestion = {
  id: string; examId: string; type: string; stem: string;
  marks: number; difficulty: string; order: number; required: boolean;
  explanation: string | null; correctAnswer: unknown; learningObjectiveId: string | null;
  codeLanguage: string | null; starterCode: string | null; testCases: unknown;
  allowedFileTypes: string[]; maxFileSizeMB: number | null; timeLimitSeconds: number | null;
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
    timeLimitSeconds: q.timeLimitSeconds ?? undefined,
    options: q.options.length ? q.options.map(mapOption) : undefined,
  };
}

export async function getQuestionsForStudent(examId: string): Promise<PublicQuestion[]> {
  const all = await getQuestions(examId);
  return all.map(({ correctAnswer, explanation: _ex, options, type, ...rest }) => {
    if (type === 'matching' && options?.length) {
      // ── New format ──────────────────────────────────────────────────────────
      // correctAnswer is ordered string[] of right-side labels (options[i] ↔ correctAnswer[i]).
      if (Array.isArray(correctAnswer)) {
        const rightLabels = correctAnswer as string[];
        // Detect new vs legacy: new format has actual text, not option IDs.
        const isNewFormat = !options.some(o => rightLabels.includes(o.id));
        if (isNewFormat) {
          return {
            ...rest, type,
            options: options.map(({ isCorrect: _ic, ...opt }) => opt),
            matchingChoices: shuffled(rightLabels),
          };
        }
      }
      // ── Legacy format ───────────────────────────────────────────────────────
      // option.text contains the full pair, e.g. "Stack — Function call management".
      // Split on common separators so students only see the left-side term; the
      // right-side labels are returned shuffled in matchingChoices.
      const pairs = options.map(o => splitPair(o.text));
      if (pairs.every(p => p !== null)) {
        return {
          ...rest, type,
          options: options.map((o, i) => ({ id: o.id, text: pairs[i]!.left })),
          matchingChoices: shuffled(pairs.map(p => p!.right)),
        };
      }
      // Fallback: can't split — return options without isCorrect (answer still somewhat visible,
      // but at least the isCorrect flag and correctAnswer are stripped).
      return { ...rest, type, options: options.map(({ isCorrect: _ic, ...opt }) => opt) };
    }

    return {
      ...rest,
      type,
      options: options?.map(({ isCorrect: _ic, ...opt }) => opt),
    };
  });
}

function splitPair(text: string): { left: string; right: string } | null {
  // Matches separators: " — ", " → ", " - ", ": ", " = ", " | "
  const m = text.match(/^(.+?)\s*(?:—|→|–|-|:|\|)\s*(.+)$/);
  return m ? { left: m[1].trim(), right: m[2].trim() } : null;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
        timeLimitSeconds: rest.timeLimitSeconds ?? null,
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
  const caller = await getCallerPrismaUser();
  if (!caller) throw new Error('Unauthorized');
  {
    const question = await prisma.question.findUnique({ where: { id }, select: { examId: true } });
    if (!question) return undefined;
    const exam = await prisma.exam.findUnique({ where: { id: question.examId }, select: { teacherId: true, institutionId: true } });
    if (!exam || exam.institutionId !== caller.institutionId) throw new Error('Forbidden');
    if (caller.role === 'teacher' && exam.teacherId !== caller.id) throw new Error('Forbidden');
  }
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
      ...(data.timeLimitSeconds !== undefined && { timeLimitSeconds: data.timeLimitSeconds ?? null }),
    },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  return mapQuestion(row);
}

export async function deleteQuestion(id: string): Promise<boolean> {
  const caller = await getCallerPrismaUser();
  if (!caller) throw new Error('Unauthorized');
  const question = await prisma.question.findUnique({ where: { id }, select: { examId: true } });
  if (!question) return false;
  const exam = await prisma.exam.findUnique({ where: { id: question.examId }, select: { teacherId: true, institutionId: true } });
  if (!exam || exam.institutionId !== caller.institutionId) throw new Error('Forbidden');
  if (caller.role === 'teacher' && exam.teacherId !== caller.id) throw new Error('Forbidden');
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
