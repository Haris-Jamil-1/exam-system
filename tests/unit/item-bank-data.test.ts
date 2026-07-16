import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 6 Task 1's 4 required tests exercise the actual guarded server functions (not just
// the pure resolveBankPermission logic already covered in item-bank-permissions.test.ts),
// by mocking prisma + Supabase auth. This is the first mocked-prisma test file in this repo
// (everything else has relied on pure-function tests or live-DB QA scripts) — introduced here
// because the spec explicitly requires committed automated coverage for these 4 scenarios,
// not just manual verification.

const {
  mockUser, mockPrismaUser, mockItemBank, mockItemBankAccess, mockItem, mockTransaction,
} = vi.hoisted(() => ({
  mockUser: vi.fn(),
  mockPrismaUser: { findUnique: vi.fn(), findFirst: vi.fn() },
  mockItemBank: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  mockItemBankAccess: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  mockItem: { updateMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  mockTransaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: mockPrismaUser,
    itemBank: mockItemBank,
    itemBankAccess: mockItemBankAccess,
    item: mockItem,
    $transaction: mockTransaction,
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser() } }) },
  }),
}));

import { deleteItemBank, updateItemBank, getSharedWithMeBanks, addCollaborator } from '@/lib/data/item-banks';
import { createItem, updateItem } from '@/lib/data/items';

const INSTITUTION_A = 'inst-a';
const INSTITUTION_B = 'inst-b';

function asAuthedSupabaseUser(prismaUserId: string) {
  mockUser.mockReturnValue({ id: `supabase-${prismaUserId}` });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation((ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
});

describe('deleteItemBank / updateItemBank — editor cannot manage an institutional bank', () => {
  const bank = {
    id: 'bank-1', name: 'Institutional Bank', bankLevel: 'institutional',
    ownerId: INSTITUTION_A, institutionId: INSTITUTION_A,
  };

  it('editor cannot delete the bank', async () => {
    asAuthedSupabaseUser('editor-1');
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'editor-1', institutionId: INSTITUTION_A, role: 'teacher' });
    mockItemBank.findUnique.mockResolvedValue(bank);
    mockItemBankAccess.findUnique.mockResolvedValue({ permissionRole: 'editor' });

    await expect(deleteItemBank('bank-1')).rejects.toThrow('Forbidden');
    expect(mockItemBank.delete).not.toHaveBeenCalled();
  });

  it('editor cannot change core settings (name) — updateItemBank throws Forbidden', async () => {
    asAuthedSupabaseUser('editor-1');
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'editor-1', institutionId: INSTITUTION_A, role: 'teacher' });
    mockItemBank.findUnique.mockResolvedValue(bank);
    mockItemBankAccess.findUnique.mockResolvedValue({ permissionRole: 'editor' });

    await expect(updateItemBank('bank-1', { name: 'Renamed' })).rejects.toThrow('Forbidden');
    expect(mockItemBank.update).not.toHaveBeenCalled();
  });

  it('updateItemBank never accepts ownerId or bankLevel in its payload type — owner update only touches name/description', async () => {
    asAuthedSupabaseUser('owner-1');
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'owner-1', institutionId: INSTITUTION_A, role: 'admin' });
    mockItemBank.findUnique.mockResolvedValue(bank);
    mockItemBankAccess.findUnique.mockResolvedValue(null);
    mockItemBank.update.mockResolvedValue({ ...bank, name: 'Renamed', description: null, createdAt: new Date(), updatedAt: new Date(), _count: { items: 0 } });

    await updateItemBank('bank-1', { name: 'Renamed' });
    const call = mockItemBank.update.mock.calls[0][0];
    expect(call.data).toEqual({ name: 'Renamed' });
    expect(call.data.ownerId).toBeUndefined();
    expect(call.data.bankLevel).toBeUndefined();
  });

  it('owner (admin) can delete the bank', async () => {
    asAuthedSupabaseUser('admin-1');
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'admin-1', institutionId: INSTITUTION_A, role: 'admin' });
    mockItemBank.findUnique.mockResolvedValue(bank);
    mockItemBankAccess.findUnique.mockResolvedValue(null);

    const result = await deleteItemBank('bank-1');
    expect(result).toBe(true);
    expect(mockItemBank.delete).toHaveBeenCalledWith({ where: { id: 'bank-1' } });
  });
});

describe('createItem / updateItem — viewer cannot write items in any bank', () => {
  const bank = {
    id: 'bank-2', name: 'Shared Personal Bank', bankLevel: 'personal',
    ownerId: 'owner-1', institutionId: INSTITUTION_A,
  };

  it('viewer cannot create an item', async () => {
    asAuthedSupabaseUser('viewer-1');
    mockUser.mockReturnValue({ id: 'supabase-viewer-1', user_metadata: { institutionId: INSTITUTION_A } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'viewer-1', institutionId: INSTITUTION_A, role: 'teacher' });
    mockItemBank.findUnique.mockResolvedValue(bank);
    mockItemBankAccess.findUnique.mockResolvedValue({ permissionRole: 'viewer' });

    await expect(createItem({
      type: 'mcq', stem: 'q', marks: 1, difficulty: 'easy', order: 0, required: false,
      status: 'draft', tags: [], aiGenerated: false, authorId: 'viewer-1', bankId: 'bank-2',
    } as Parameters<typeof createItem>[0])).rejects.toThrow('Forbidden');
    expect(mockItem.create).not.toHaveBeenCalled();
  });

  it('viewer cannot update an item', async () => {
    asAuthedSupabaseUser('viewer-1');
    mockUser.mockReturnValue({ id: 'supabase-viewer-1', user_metadata: { institutionId: INSTITUTION_A } });
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'viewer-1', institutionId: INSTITUTION_A, role: 'teacher' });
    mockItem.findUnique.mockResolvedValue({ bankId: 'bank-2' });
    mockItemBank.findUnique.mockResolvedValue(bank);
    mockItemBankAccess.findUnique.mockResolvedValue({ permissionRole: 'viewer' });

    await expect(updateItem('item-1', { stem: 'edited' })).rejects.toThrow('Forbidden');
    expect(mockItem.update).not.toHaveBeenCalled();
  });

  it('editor CAN create/update items (contrast case)', async () => {
    asAuthedSupabaseUser('editor-1');
    mockUser.mockReturnValue({ id: 'supabase-editor-1', user_metadata: { institutionId: INSTITUTION_A } });
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ id: 'editor-1', institutionId: INSTITUTION_A, role: 'teacher' })
      .mockResolvedValueOnce({ id: 'editor-1' });
    mockItemBank.findUnique.mockResolvedValue(bank);
    mockItemBankAccess.findUnique.mockResolvedValue({ permissionRole: 'editor' });
    mockPrismaUser.findFirst.mockResolvedValue({ id: 'editor-1' });
    mockItem.create.mockResolvedValue({
      id: 'item-1', type: 'mcq', stem: 'q', marks: 1, difficulty: 'easy', order: 0, required: false,
      explanation: null, correctAnswer: null, status: 'draft', usageCount: 0, tags: [], codeLanguage: null,
      starterCode: null, testCases: null, allowedFileTypes: [], maxFileSizeMB: null, timeLimitSeconds: null,
      rubric: null, gradingWeights: null, facilityIndex: null, discriminationIndex: null, version: 1,
      previousVersionId: null, authorId: 'editor-1', learningObjectiveId: null, bankId: 'bank-2',
      createdAt: new Date(), aiGenerated: false, options: [],
    });

    await createItem({
      type: 'mcq', stem: 'q', marks: 1, difficulty: 'easy', order: 0, required: false,
      status: 'draft', tags: [], aiGenerated: false, authorId: 'editor-1', bankId: 'bank-2',
    } as Parameters<typeof createItem>[0]);
    expect(mockItem.create).toHaveBeenCalled();
  });
});

describe('getSharedWithMeBanks — no ItemBankAccess row means invisible via the API layer, not just UI', () => {
  it('returns [] when the caller has zero ItemBankAccess rows, without even querying ItemBank', async () => {
    asAuthedSupabaseUser('lonely-1');
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'lonely-1', institutionId: INSTITUTION_A, role: 'teacher' });
    mockItemBankAccess.findMany.mockResolvedValue([]);

    const result = await getSharedWithMeBanks();
    expect(result).toEqual([]);
    expect(mockItemBank.findUnique).not.toHaveBeenCalled();
  });

  it('a bank the caller has an access row for elsewhere IS returned', async () => {
    asAuthedSupabaseUser('shared-1');
    mockPrismaUser.findUnique.mockResolvedValue({ id: 'shared-1', institutionId: INSTITUTION_A, role: 'teacher' });
    mockItemBankAccess.findMany.mockResolvedValue([{ bankId: 'bank-3', permissionRole: 'viewer' }]);
    mockItemBank.findMany.mockResolvedValue([{
      id: 'bank-3', name: 'Someone Else\'s Bank', description: null, bankLevel: 'personal',
      ownerId: 'other-owner', institutionId: INSTITUTION_A, createdAt: new Date(), updatedAt: new Date(),
      _count: { items: 2 },
    }]);

    const result = await getSharedWithMeBanks();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('bank-3');
    expect(result[0].myRole).toBe('viewer');
  });
});

describe('addCollaborator — cross-institution invite is rejected server-side', () => {
  const personalBank = {
    id: 'bank-4', name: 'My Bank', bankLevel: 'personal',
    ownerId: 'owner-1', institutionId: INSTITUTION_A,
  };

  it('rejects inviting a user from a different institution, even though the caller is the owner', async () => {
    asAuthedSupabaseUser('owner-1');
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ id: 'owner-1', institutionId: INSTITUTION_A, role: 'teacher' })
      .mockResolvedValueOnce({ institutionId: INSTITUTION_B, name: 'Outsider', email: 'outsider@b.edu' });
    mockItemBank.findUnique.mockResolvedValue(personalBank);
    mockItemBankAccess.findUnique.mockResolvedValue(null);

    await expect(addCollaborator('bank-4', 'outsider-b', 'editor')).rejects.toThrow('Forbidden');
    expect(mockItemBankAccess.upsert).not.toHaveBeenCalled();
  });

  it('accepts inviting a same-institution user', async () => {
    asAuthedSupabaseUser('owner-1');
    mockPrismaUser.findUnique
      .mockResolvedValueOnce({ id: 'owner-1', institutionId: INSTITUTION_A, role: 'teacher' })
      .mockResolvedValueOnce({ institutionId: INSTITUTION_A, name: 'Colleague', email: 'colleague@a.edu' });
    mockItemBank.findUnique.mockResolvedValue(personalBank);
    mockItemBankAccess.findUnique.mockResolvedValue(null);
    mockItemBankAccess.upsert.mockResolvedValue({
      id: 'access-1', bankId: 'bank-4', userId: 'colleague-a', permissionRole: 'editor',
      assignedById: 'owner-1', createdAt: new Date(),
    });

    const result = await addCollaborator('bank-4', 'colleague-a', 'editor');
    expect(result.permissionRole).toBe('editor');
  });
});
