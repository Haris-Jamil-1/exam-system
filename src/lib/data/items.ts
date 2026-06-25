'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { Item, Option, TestCase } from '@/types';

export interface ItemFilters {
  type?: string;
  difficulty?: string;
  status?: string;
  authorId?: string;
}

type PrismaItemOption = { id: string; text: string; isCorrect: boolean; itemId: string; order: number };

function mapItemOption(o: PrismaItemOption): Option {
  return { id: o.id, text: o.text, isCorrect: o.isCorrect };
}

type PrismaItem = {
  id: string; type: string; stem: string; marks: number; difficulty: string;
  order: number; required: boolean; explanation: string | null; correctAnswer: unknown;
  status: string; usageCount: number; tags: string[]; codeLanguage: string | null;
  starterCode: string | null; testCases: unknown; allowedFileTypes: string[];
  maxFileSizeMB: number | null; facilityIndex: number | null;
  discriminationIndex: number | null; version: number; previousVersionId: string | null;
  authorId: string; learningObjectiveId: string | null; createdAt: Date;
  options: PrismaItemOption[];
};

function mapItem(i: PrismaItem): Item {
  return {
    id: i.id,
    type: i.type as Item['type'],
    stem: i.stem,
    marks: i.marks,
    difficulty: i.difficulty as Item['difficulty'],
    order: i.order,
    required: i.required,
    explanation: i.explanation ?? undefined,
    correctAnswer: i.correctAnswer as string | string[] | undefined,
    status: i.status as Item['status'],
    usageCount: i.usageCount,
    tags: i.tags,
    codeLanguage: i.codeLanguage ?? undefined,
    starterCode: i.starterCode ?? undefined,
    testCases: i.testCases as TestCase[] | undefined,
    allowedFileTypes: i.allowedFileTypes.length ? i.allowedFileTypes : undefined,
    maxFileSizeMB: i.maxFileSizeMB ?? undefined,
    facilityIndex: i.facilityIndex ?? undefined,
    discriminationIndex: i.discriminationIndex ?? undefined,
    version: i.version,
    previousVersionId: i.previousVersionId ?? undefined,
    authorId: i.authorId,
    learningObjectiveId: i.learningObjectiveId ?? undefined,
    createdAt: i.createdAt.toISOString(),
    options: i.options.length ? i.options.map(mapItemOption) : undefined,
  };
}

async function getInstitutionId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (user?.user_metadata?.institutionId as string | undefined) ?? null;
}

export async function getItems(filters?: ItemFilters): Promise<Item[]> {
  const institutionId = await getInstitutionId();
  if (!institutionId) return [];
  const rows = await prisma.item.findMany({
    where: {
      institutionId,
      ...(filters?.type && { type: filters.type as Item['type'] }),
      ...(filters?.difficulty && { difficulty: filters.difficulty as Item['difficulty'] }),
      ...(filters?.status && { status: filters.status as Item['status'] }),
      ...(filters?.authorId && { authorId: filters.authorId }),
    },
    orderBy: { createdAt: 'desc' },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  return rows.map(mapItem);
}

export async function getItemById(id: string): Promise<Item | undefined> {
  const row = await prisma.item.findUnique({
    where: { id },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  return row ? mapItem(row) : undefined;
}

export async function createItem(data: Omit<Item, 'id' | 'createdAt' | 'usageCount'>): Promise<Item> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const institutionId = (user?.user_metadata?.institutionId as string | undefined) ?? null;
  if (!institutionId) throw new Error('Not authenticated');
  // Always resolve authorId from session — ignore caller-supplied value
  let authorId = data.authorId;
  if (user?.id) {
    const prismaUser = await prisma.user.findFirst({ where: { supabaseId: user.id }, select: { id: true } });
    if (prismaUser) authorId = prismaUser.id;
  }
  const { options, ...rest } = data;
  try {
    const row = await prisma.item.create({
      data: {
        type: rest.type,
        stem: rest.stem,
        marks: rest.marks,
        difficulty: rest.difficulty,
        order: rest.order,
        required: rest.required ?? false,
        explanation: rest.explanation ?? null,
        ...(rest.correctAnswer !== undefined && { correctAnswer: rest.correctAnswer as object }),
        status: rest.status,
        tags: rest.tags,
        codeLanguage: rest.codeLanguage ?? null,
        starterCode: rest.starterCode ?? null,
        ...(rest.testCases !== undefined && { testCases: rest.testCases as object }),
        allowedFileTypes: rest.allowedFileTypes ?? [],
        maxFileSizeMB: rest.maxFileSizeMB ?? null,
        learningObjectiveId: rest.learningObjectiveId ?? null,
        previousVersionId: rest.previousVersionId ?? null,
        institutionId,
        authorId,
        options: options?.length
          ? { create: options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, order: i })) }
          : undefined,
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    return mapItem(row);
  } catch (err) {
    console.error('[createItem] Prisma error:', err);
    throw err;
  }
}

export async function updateItem(id: string, data: Partial<Item>): Promise<Item | undefined> {
  const row = await prisma.item.update({
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
      ...(data.status && { status: data.status }),
      ...(data.tags && { tags: data.tags }),
      ...(data.codeLanguage !== undefined && { codeLanguage: data.codeLanguage ?? null }),
      ...(data.starterCode !== undefined && { starterCode: data.starterCode ?? null }),
      ...(data.testCases !== undefined && { testCases: data.testCases as object }),
      ...(data.allowedFileTypes && { allowedFileTypes: data.allowedFileTypes }),
      ...(data.maxFileSizeMB !== undefined && { maxFileSizeMB: data.maxFileSizeMB ?? null }),
      ...(data.facilityIndex !== undefined && { facilityIndex: data.facilityIndex ?? null }),
      ...(data.discriminationIndex !== undefined && { discriminationIndex: data.discriminationIndex ?? null }),
      ...(data.learningObjectiveId !== undefined && { learningObjectiveId: data.learningObjectiveId ?? null }),
    },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  return mapItem(row);
}
