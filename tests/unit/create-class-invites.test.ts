import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockUser, mockPrismaUser, mockClass, mockClassEnrollment, mockClassInvite, mockSend,
} = vi.hoisted(() => ({
  mockUser: vi.fn(),
  mockPrismaUser: { findUnique: vi.fn(), findFirst: vi.fn() },
  mockClass: { findUnique: vi.fn() },
  mockClassEnrollment: { findUnique: vi.fn() },
  mockClassInvite: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  mockSend: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: mockPrismaUser,
    class: mockClass,
    classEnrollment: mockClassEnrollment,
    classInvite: mockClassInvite,
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser() } }) },
  }),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

import { createClassInvites } from '@/lib/data/classes';

const INSTITUTION_A = 'inst-a';
const INSTITUTION_B = 'inst-b';
const CLASS_ID = 'class-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockReturnValue({ id: 'supabase-teacher' });
  mockClass.findUnique.mockResolvedValue({ id: CLASS_ID, name: 'Algebra', teacherId: 'teacher-1', institutionId: INSTITUTION_A });
  mockClassEnrollment.findUnique.mockResolvedValue(null);
  mockClassInvite.findFirst.mockResolvedValue(null);
  mockClassInvite.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'invite-1', token: 'tok-1', ...data }));
  mockClassInvite.delete.mockResolvedValue({});
  mockSend.mockResolvedValue({ error: null });
});

describe('createClassInvites — cross-institution block (Task 4)', () => {
  it('invites a brand-new email normally', async () => {
    mockPrismaUser.findFirst.mockResolvedValue(null); // no existing student found by role+institution scan
    // isEmailActiveElsewhere does its own prisma.user.findUnique(email) lookup
    mockPrismaUser.findUnique.mockImplementation(async ({ where }: { where: { supabaseId?: string; email?: string } }) => {
      if (where.supabaseId) return { id: 'teacher-1', institutionId: INSTITUTION_A, role: 'teacher', isSuperAdmin: false };
      return null;
    });

    const result = await createClassInvites(CLASS_ID, ['new@example.com']);
    expect(result).toEqual([{ email: 'new@example.com', outcome: 'invited' }]);
  });

  it('reports cross_institution and never creates a ClassInvite for an active member of another institution', async () => {
    mockPrismaUser.findUnique.mockImplementation(async ({ where }: { where: { supabaseId?: string; email?: string } }) => {
      if (where.supabaseId) return { id: 'teacher-1', institutionId: INSTITUTION_A, role: 'teacher', isSuperAdmin: false };
      if (where.email === 'other-tenant@example.com') return { institutionId: INSTITUTION_B, suspendedAt: null };
      return null;
    });

    const result = await createClassInvites(CLASS_ID, ['other-tenant@example.com']);
    expect(result).toEqual([{ email: 'other-tenant@example.com', outcome: 'cross_institution' }]);
    expect(mockClassInvite.create).not.toHaveBeenCalled();
  });

  it('allows a suspended member of another institution through (not "active" elsewhere)', async () => {
    mockPrismaUser.findFirst.mockResolvedValue(null);
    mockPrismaUser.findUnique.mockImplementation(async ({ where }: { where: { supabaseId?: string; email?: string } }) => {
      if (where.supabaseId) return { id: 'teacher-1', institutionId: INSTITUTION_A, role: 'teacher', isSuperAdmin: false };
      if (where.email === 'moved@example.com') return { institutionId: INSTITUTION_B, suspendedAt: new Date() };
      return null;
    });

    const result = await createClassInvites(CLASS_ID, ['moved@example.com']);
    expect(result).toEqual([{ email: 'moved@example.com', outcome: 'invited' }]);
    expect(mockClassInvite.create).toHaveBeenCalledTimes(1);
  });
});
