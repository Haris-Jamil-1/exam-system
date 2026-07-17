import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@/generated/prisma/client';

// Phase 7 Task 1's remaining required tests: section-sequential lock rejects direct API
// re-access to a submitted/locked section, and section-weight validation blocks exam start
// when weights don't sum to 100%. (Composite scoring's threshold-override-to-Failed case is
// already covered by the pre-existing tests/unit/section-scoring.test.ts — not duplicated here.)

const { mockGetAuthUser, mockPrisma } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockPrisma: {
    examAttempt: { findUnique: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
    examSection: { findUnique: vi.fn(), findMany: vi.fn() },
    exam: { findUnique: vi.fn() },
    sectionAttempt: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    examEnrollment: { upsert: vi.fn() },
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: unknown) => {
      if (typeof fn === 'function') return (fn as (tx: unknown) => unknown)(mockPrisma);
      return Promise.all(fn as Promise<unknown>[]);
    }),
  },
}));

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth');
  return { ...actual, getAuthUser: mockGetAuthUser };
});
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/data/pooling', () => ({ materializePooledQuestions: vi.fn() }));

import { POST as startSection } from '@/app/api/attempts/[attemptId]/sections/[sectionId]/start/route';
import { POST as startAttempt } from '@/app/api/attempts/route';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: unknown) => {
    if (typeof fn === 'function') return (fn as (tx: unknown) => unknown)(mockPrisma);
    return Promise.all(fn as Promise<unknown>[]);
  });
  mockGetAuthUser.mockResolvedValue({ id: 'student-1', institutionId: 'inst-a', role: 'student' });
  mockPrisma.examEnrollment.upsert.mockResolvedValue({});
  // Eligibility gate (Task 5): student-1 is TeacherStudent-linked to teacher-1, matching the
  // unscoped (classId: null) exams every test in this file uses — same pre-existing behavior.
  mockPrisma.user.findUnique.mockResolvedValue({
    studentTeachers: [{ teacherId: 'teacher-1' }],
    classEnrollments: [],
  });
});

describe('POST /api/attempts/[attemptId]/sections/[sectionId]/start — section-sequential lock', () => {
  function params(attemptId = 'attempt-1', sectionId = 'section-2') {
    return { params: Promise.resolve({ attemptId, sectionId }) };
  }

  it('rejects starting section 2 directly when section 1 (lower orderIndex) is not yet submitted', async () => {
    mockPrisma.examAttempt.findUnique.mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', studentId: 'student-1', status: 'in_progress' });
    mockPrisma.examSection.findUnique.mockResolvedValue({ id: 'section-2', examId: 'exam-1', orderIndex: 1 });
    mockPrisma.exam.findUnique.mockResolvedValue({ settings: { isSectionSequential: true } });
    mockPrisma.examSection.findMany.mockResolvedValue([{ id: 'section-1' }]);
    mockPrisma.sectionAttempt.findMany.mockResolvedValue([{ sectionId: 'section-1', status: 'in_progress' }]);

    const res = await startSection(new Request('http://x', { method: 'POST' }), params());
    expect(res.status).toBe(403);
    expect(mockPrisma.sectionAttempt.upsert).not.toHaveBeenCalled();
  });

  it('allows starting section 2 once section 1 is actually submitted', async () => {
    mockPrisma.examAttempt.findUnique.mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', studentId: 'student-1', status: 'in_progress' });
    mockPrisma.examSection.findUnique.mockResolvedValue({ id: 'section-2', examId: 'exam-1', orderIndex: 1 });
    mockPrisma.exam.findUnique.mockResolvedValue({ settings: { isSectionSequential: true } });
    mockPrisma.examSection.findMany.mockResolvedValue([{ id: 'section-1' }]);
    mockPrisma.sectionAttempt.findMany.mockResolvedValue([{ sectionId: 'section-1', status: 'submitted' }]);
    mockPrisma.sectionAttempt.upsert.mockResolvedValue({ id: 'sa-2', sectionId: 'section-2', status: 'in_progress', startedAt: new Date() });

    const res = await startSection(new Request('http://x', { method: 'POST' }), params());
    expect(res.status).toBe(201);
  });
});

describe('POST /api/attempts — section-weight-sums-to-100% blocks exam start', () => {
  function req(examId = 'exam-1') {
    return new Request('http://x', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ examId }),
    });
  }

  it('blocks starting a brand-new attempt when section weights sum to 80, not 100', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 3600_000),
      status: 'live', institutionId: 'inst-a', settings: {}, classId: null, teacherId: 'teacher-1', approvalStatus: 'approved',
      sections: [{ sectionWeight: 40 }, { sectionWeight: 40 }],
    });
    mockPrisma.examAttempt.findUnique.mockResolvedValue(null);

    const res = await startAttempt(req());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_section_weights');
    expect(mockPrisma.examAttempt.create).not.toHaveBeenCalled();
  });

  it('allows starting when weights sum to exactly 100', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 3600_000),
      status: 'live', institutionId: 'inst-a', settings: {}, classId: null, teacherId: 'teacher-1', approvalStatus: 'approved',
      sections: [{ sectionWeight: 60 }, { sectionWeight: 40 }],
    });
    mockPrisma.examAttempt.findUnique.mockResolvedValue(null);
    mockPrisma.examAttempt.create.mockResolvedValue({
      id: 'attempt-1', examId: 'exam-1', studentId: 'student-1', status: 'in_progress',
      startedAt: new Date(), trustScore: 100, violationCount: 0,
    });

    const res = await startAttempt(req());
    expect(res.status).toBe(201);
  });

  it('does not check weights at all for a non-sectioned exam', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 3600_000),
      status: 'live', institutionId: 'inst-a', settings: {}, classId: null, teacherId: 'teacher-1', approvalStatus: 'approved', sections: [],
    });
    mockPrisma.examAttempt.findUnique.mockResolvedValue(null);
    mockPrisma.examAttempt.create.mockResolvedValue({
      id: 'attempt-1', examId: 'exam-1', studentId: 'student-1', status: 'in_progress',
      startedAt: new Date(), trustScore: 100, violationCount: 0,
    });

    const res = await startAttempt(req());
    expect(res.status).toBe(201);
  });

  it('still allows RESUMING an existing attempt even if weights are (now) misconfigured', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      startTime: new Date(Date.now() - 60_000), endTime: new Date(Date.now() + 3600_000),
      status: 'live', institutionId: 'inst-a', settings: {}, classId: null, teacherId: 'teacher-1', approvalStatus: 'approved',
      sections: [{ sectionWeight: 40 }, { sectionWeight: 40 }],
    });
    mockPrisma.examAttempt.findUnique.mockResolvedValue({
      id: 'attempt-1', examId: 'exam-1', studentId: 'student-1', status: 'in_progress',
      startedAt: new Date(), trustScore: 100, violationCount: 0,
    });
    mockPrisma.examAttempt.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    mockPrisma.examAttempt.findUniqueOrThrow.mockResolvedValue({
      id: 'attempt-1', examId: 'exam-1', studentId: 'student-1', status: 'in_progress',
      startedAt: new Date(), trustScore: 100, violationCount: 0,
    });

    const res = await startAttempt(req());
    expect(res.status).toBe(201);
  });
});
