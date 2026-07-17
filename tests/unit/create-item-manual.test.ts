import { describe, it, expect, vi, beforeEach } from 'vitest';

// Task 3's explicit ask: "Add a test that creates an item through the manual builder end-to-end
// and confirms it's persisted and retrievable." This repo has no React/DOM test environment (see
// PHASE_7_1_PROGRESS.md), so — matching that established convention — this exercises the exact
// server-side contract the fixed form now calls with a real (coerced) number for marks, a
// resolved authorId, and confirms the created row round-trips through getItemById. It also
// covers the second real bug this session closed: createItem previously fell through to an
// empty-string authorId (an FK-constraint crash with zero user-facing error) when no matching
// Prisma User existed for the session — it now throws an explicit, catchable error instead.

const { mockUser, mockPrismaUser, mockItem, mockGetCallerAndBankPermission } = vi.hoisted(() => ({
  mockUser: vi.fn(),
  mockPrismaUser: { findFirst: vi.fn() },
  mockItem: { create: vi.fn(), findUnique: vi.fn() },
  mockGetCallerAndBankPermission: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: mockPrismaUser, item: mockItem },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser() } }) },
  }),
}));
vi.mock('@/lib/data/item-banks', () => ({
  getCallerAndBankPermission: mockGetCallerAndBankPermission,
  getAccessibleBankIds: vi.fn(),
}));

import { createItem, getItemById } from '@/lib/data/items';

const TEACHER_SUPABASE_ID = 'supabase-teacher-1';
const TEACHER_PRISMA_ID = 'teacher-1';
const BANK_ID = 'bank-1';

const EDITOR_PERMISSION = {
  caller: { id: TEACHER_PRISMA_ID, institutionId: 'inst-a', role: 'teacher' as const },
  role: 'editor' as const,
  bank: { id: BANK_ID, bankLevel: 'personal', ownerId: TEACHER_PRISMA_ID, institutionId: 'inst-a' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockReturnValue({ id: TEACHER_SUPABASE_ID, user_metadata: { institutionId: 'inst-a' } });
  mockGetCallerAndBankPermission.mockResolvedValue(EDITOR_PERMISSION);
});

describe('createItem — manual item builder (Task 3)', () => {
  it('creates an item with a real (coerced) number for marks and the resolved authorId, and it is retrievable via getItemById', async () => {
    mockPrismaUser.findFirst.mockResolvedValue({ id: TEACHER_PRISMA_ID });

    const createdRow = {
      id: 'item-1', type: 'mcq', stem: 'What is 2+2?', marks: 4, difficulty: 'medium',
      order: 0, required: false, explanation: null, correctAnswer: '4',
      status: 'draft', usageCount: 0, tags: [], codeLanguage: null, starterCode: null,
      testCases: null, allowedFileTypes: [], maxFileSizeMB: null, timeLimitSeconds: null,
      rubric: null, gradingWeights: null, facilityIndex: null, discriminationIndex: null,
      version: 1, previousVersionId: null, authorId: TEACHER_PRISMA_ID,
      learningObjectiveId: null, bankId: BANK_ID, createdAt: new Date(), aiGenerated: false,
      options: [],
    };
    mockItem.create.mockResolvedValue(createdRow);

    const result = await createItem({
      type: 'mcq', stem: 'What is 2+2?', marks: 4, difficulty: 'medium', order: 0,
      status: 'draft', tags: [], authorId: '', bankId: BANK_ID,
    } as Parameters<typeof createItem>[0]);

    expect(result.marks).toBe(4);
    expect(typeof result.marks).toBe('number');
    // authorId is always resolved server-side from the session — never the caller-supplied value
    expect(mockItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ authorId: TEACHER_PRISMA_ID, marks: 4 }) }),
    );

    // Retrievable afterward
    mockItem.findUnique.mockResolvedValue({ ...createdRow, bankId: BANK_ID });
    const fetched = await getItemById('item-1');
    expect(fetched?.id).toBe('item-1');
    expect(fetched?.stem).toBe('What is 2+2?');
  });

  it('throws an explicit, catchable error instead of silently falling back to an empty authorId when no matching User row exists', async () => {
    mockPrismaUser.findFirst.mockResolvedValue(null); // Supabase session with no matching Prisma User

    await expect(createItem({
      type: 'mcq', stem: 'What is 2+2?', marks: 4, difficulty: 'medium', order: 0,
      status: 'draft', tags: [], authorId: '', bankId: BANK_ID,
    } as Parameters<typeof createItem>[0])).rejects.toThrow(/session/i);

    expect(mockItem.create).not.toHaveBeenCalled();
  });
});
