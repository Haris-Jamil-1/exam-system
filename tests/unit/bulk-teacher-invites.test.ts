import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockUser, mockPrismaUser, mockInviteToken, mockSend,
} = vi.hoisted(() => ({
  mockUser: vi.fn(),
  mockPrismaUser: { findUnique: vi.fn() },
  mockInviteToken: { findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
  mockSend: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: mockPrismaUser, inviteToken: mockInviteToken },
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

import { createBulkTeacherInvites } from '@/lib/data/invites';

const INSTITUTION_A = 'inst-a';
const INSTITUTION_B = 'inst-b';

function asAuthedUser(role: 'admin' | 'teacher', institutionId = INSTITUTION_A) {
  mockUser.mockReturnValue({ id: 'supabase-caller' });
  mockPrismaUser.findUnique.mockImplementation(async ({ where }: { where: { supabaseId?: string; email?: string } }) => {
    if (where.supabaseId === 'supabase-caller') {
      return { id: 'caller-1', institutionId, role, suspendedAt: null, institution: { suspendedAt: null }, isSuperAdmin: false };
    }
    return null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInviteToken.findFirst.mockResolvedValue(null);
  mockInviteToken.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'invite-1', token: 'tok-1', ...data }));
  mockInviteToken.delete.mockResolvedValue({});
  mockSend.mockResolvedValue({ error: null });
});

describe('createBulkTeacherInvites (Task 2)', () => {
  it('returns null for a non-admin caller', async () => {
    asAuthedUser('teacher');
    const result = await createBulkTeacherInvites(['a@example.com']);
    expect(result).toBeNull();
    expect(mockInviteToken.create).not.toHaveBeenCalled();
  });

  it('sends an invite for each new, unique, lowercased email', async () => {
    asAuthedUser('admin');
    mockPrismaUser.findUnique.mockImplementation(async ({ where }: { where: { supabaseId?: string; email?: string } }) => {
      if (where.supabaseId) return { id: 'caller-1', institutionId: INSTITUTION_A, role: 'admin', suspendedAt: null, institution: { suspendedAt: null }, isSuperAdmin: false };
      return null; // no existing member for any invited email
    });

    const result = await createBulkTeacherInvites(['A@example.com', 'a@example.com', 'b@example.com']);
    expect(result).toEqual([
      { email: 'a@example.com', outcome: 'invited' },
      { email: 'b@example.com', outcome: 'invited' },
    ]);
    expect(mockInviteToken.create).toHaveBeenCalledTimes(2);
  });

  it('reports already_member for an email already in the caller institution', async () => {
    asAuthedUser('admin');
    mockPrismaUser.findUnique.mockImplementation(async ({ where }: { where: { supabaseId?: string; email?: string } }) => {
      if (where.supabaseId) return { id: 'caller-1', institutionId: INSTITUTION_A, role: 'admin', suspendedAt: null, institution: { suspendedAt: null }, isSuperAdmin: false };
      if (where.email === 'existing@example.com') return { institutionId: INSTITUTION_A, suspendedAt: null };
      return null;
    });

    const result = await createBulkTeacherInvites(['existing@example.com']);
    expect(result).toEqual([{ email: 'existing@example.com', outcome: 'already_member' }]);
    expect(mockInviteToken.create).not.toHaveBeenCalled();
  });

  it('blocks (Task 4) an email that is an active member of a DIFFERENT institution', async () => {
    asAuthedUser('admin');
    mockPrismaUser.findUnique.mockImplementation(async ({ where }: { where: { supabaseId?: string; email?: string } }) => {
      if (where.supabaseId) return { id: 'caller-1', institutionId: INSTITUTION_A, role: 'admin', suspendedAt: null, institution: { suspendedAt: null }, isSuperAdmin: false };
      if (where.email === 'other-tenant@example.com') return { institutionId: INSTITUTION_B, suspendedAt: null };
      return null;
    });

    const result = await createBulkTeacherInvites(['other-tenant@example.com']);
    expect(result).toEqual([{ email: 'other-tenant@example.com', outcome: 'cross_institution' }]);
    expect(mockInviteToken.create).not.toHaveBeenCalled();
  });

  it('reports already_invited when a pending InviteToken already exists', async () => {
    asAuthedUser('admin');
    mockInviteToken.findFirst.mockResolvedValue({ id: 'pending-1' });

    const result = await createBulkTeacherInvites(['pending@example.com']);
    expect(result).toEqual([{ email: 'pending@example.com', outcome: 'already_invited' }]);
    expect(mockInviteToken.create).not.toHaveBeenCalled();
  });

  it('rolls back and reports failed when the invite email fails to send', async () => {
    asAuthedUser('admin');
    mockSend.mockResolvedValue({ error: { message: 'send failed' } });

    const result = await createBulkTeacherInvites(['bounces@example.com']);
    expect(result).toEqual([{ email: 'bounces@example.com', outcome: 'failed' }]);
    expect(mockInviteToken.delete).toHaveBeenCalledWith({ where: { id: 'invite-1' } });
  });

  it('caps a bulk request at 50 emails', async () => {
    asAuthedUser('admin');
    const emails = Array.from({ length: 60 }, (_, i) => `bulk${i}@example.com`);
    const result = await createBulkTeacherInvites(emails);
    expect(result).toHaveLength(50);
  });
});
