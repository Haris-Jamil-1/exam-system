import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression coverage for Task 6 ("joined teachers don't show up in the admin panel"): the actual
// bug was in the accept-invite upsert (covered by invite-accept-decision.test.ts), but this locks
// down the other half of the claim — that getTeachersList's own query has no status/institution
// filter that would additionally hide a freshly-joined teacher once their User row is correct.

const { mockUser, mockPrismaUser, mockExamEnrollment, mockPrismaExam } = vi.hoisted(() => ({
  mockUser: vi.fn(),
  mockPrismaUser: { findMany: vi.fn(), findUnique: vi.fn() },
  mockExamEnrollment: { count: vi.fn() },
  mockPrismaExam: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: mockPrismaUser, examEnrollment: mockExamEnrollment, exam: mockPrismaExam },
}));

// getClaims is the local ES256 verification path lib/session.ts now uses instead of
// getUser's HTTPS round trip; it exposes the same `sub` / `user_metadata` fields.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: mockUser() } }),
      getClaims: async () => {
        const u = mockUser();
        return u
          ? { data: { claims: { sub: u.id, user_metadata: u.user_metadata } }, error: null }
          : { data: null, error: null };
      },
    },
  }),
}));

import { getTeachersList } from '@/lib/data/analytics';

const INSTITUTION_A = 'inst-a';

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockReturnValue({
    id: 'supabase-admin',
    user_metadata: { institutionId: INSTITUTION_A, role: 'admin' },
  });
  mockPrismaUser.findUnique.mockResolvedValue({ id: 'admin-1' });
  mockExamEnrollment.count.mockResolvedValue(0);
  // Per-teacher enrolment totals now come from one exam.findMany instead of an
  // examEnrollment.count per teacher (the N+1 that pass removed).
  mockPrismaExam.findMany.mockResolvedValue([]);
});

describe('getTeachersList', () => {
  it('queries only by institutionId + role, with no status filter that could hide a joined teacher', async () => {
    mockPrismaUser.findMany.mockResolvedValue([]);
    await getTeachersList();
    expect(mockPrismaUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { institutionId: INSTITUTION_A, role: 'teacher' } }),
    );
  });

  it('includes a just-accepted teacher (institutionId/role set correctly, not suspended) as active', async () => {
    mockPrismaUser.findMany.mockResolvedValue([
      { id: 'new-teacher', name: 'New Teacher', email: 'new@example.com', department: null, suspendedAt: null, _count: { exams: 0 } },
    ]);
    const result = await getTeachersList();
    expect(result).toEqual([
      expect.objectContaining({ id: 'new-teacher', status: 'active' }),
    ]);
  });

  it('still surfaces a suspended teacher (marked, not hidden)', async () => {
    mockPrismaUser.findMany.mockResolvedValue([
      { id: 'susp-teacher', name: 'Susp Teacher', email: 'susp@example.com', department: null, suspendedAt: new Date(), _count: { exams: 0 } },
    ]);
    const result = await getTeachersList();
    expect(result).toEqual([
      expect.objectContaining({ id: 'susp-teacher', status: 'suspended' }),
    ]);
  });
});
