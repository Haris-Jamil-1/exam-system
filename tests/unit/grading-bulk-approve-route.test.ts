import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 7 Task 2 required test: bulk-approve finalizes all unmodified (ai_suggested) items
// without mishandling already-modified ones (overridden/confirmed are counted but left
// untouched — not excluded from the response, not double-processed), and a user without
// grading rights is rejected server-side.

const { mockGetAuthUser, mockPrisma, mockRecompute } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockPrisma: {
    examAttempt: { findUnique: vi.fn() },
    exam: { findUnique: vi.fn() },
    answer: { findMany: vi.fn(), update: vi.fn() },
    answerGrading: { create: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
  mockRecompute: vi.fn(),
}));

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth');
  return { ...actual, getAuthUser: mockGetAuthUser };
});
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/ai/grading', () => ({ recomputeAttemptScore: mockRecompute }));

import { POST } from '@/app/api/grading/attempts/[attemptId]/bulk-approve/route';

const params = () => ({ params: Promise.resolve({ attemptId: 'attempt-1' }) });
function req() { return new Request('http://localhost/x', { method: 'POST' }); }

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  mockGetAuthUser.mockResolvedValue({ id: 'teacher-1', institutionId: 'inst-a', role: 'teacher' });
  mockPrisma.examAttempt.findUnique.mockResolvedValue({ examId: 'exam-1' });
  mockPrisma.exam.findUnique.mockResolvedValue({ teacherId: 'teacher-1', institutionId: 'inst-a' });
});

describe('POST /api/grading/attempts/[attemptId]/bulk-approve', () => {
  it('finalizes every unmodified ai_suggested answer, leaves overridden/confirmed untouched but counted, and skips pending_ai as not-ready', async () => {
    mockPrisma.answer.findMany.mockResolvedValue([
      { id: 'a1', gradingStatus: 'ai_suggested', question: { marks: 10 }, gradings: [{ totalScore: 8, feedback: 'ok', rubricSnapshot: null }] },
      { id: 'a2', gradingStatus: 'ai_suggested', question: { marks: 5 }, gradings: [{ totalScore: 5, feedback: null, rubricSnapshot: null }] },
      { id: 'a3', gradingStatus: 'overridden', question: { marks: 10 }, gradings: [] },
      { id: 'a4', gradingStatus: 'confirmed', question: { marks: 10 }, gradings: [] },
      { id: 'a5', gradingStatus: 'pending_ai', question: { marks: 10 }, gradings: [] },
    ]);

    const res = await POST(req(), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ approved: 2, alreadyFinalized: 2, notReady: 1, total: 5 });

    // Only the two ai_suggested answers were mutated.
    expect(mockPrisma.answer.update).toHaveBeenCalledTimes(2);
    const updatedIds = mockPrisma.answer.update.mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id);
    expect(updatedIds.sort()).toEqual(['a1', 'a2']);
    // a3 (overridden) and a4 (confirmed) were never touched.
    expect(updatedIds).not.toContain('a3');
    expect(updatedIds).not.toContain('a4');

    expect(mockRecompute).toHaveBeenCalledWith('attempt-1');
  });

  it('caps an ai_suggested item at the question max when confirming', async () => {
    mockPrisma.answer.findMany.mockResolvedValue([
      { id: 'a1', gradingStatus: 'ai_suggested', question: { marks: 5 }, gradings: [{ totalScore: 999, feedback: null, rubricSnapshot: null }] },
    ]);
    await POST(req(), params());
    const call = mockPrisma.answer.update.mock.calls[0][0] as { data: { marksAwarded: number } };
    expect(call.data.marksAwarded).toBe(5);
  });

  it('does not call recompute or the transaction when nothing needs approving', async () => {
    mockPrisma.answer.findMany.mockResolvedValue([
      { id: 'a3', gradingStatus: 'overridden', question: { marks: 10 }, gradings: [] },
    ]);
    const res = await POST(req(), params());
    const body = await res.json();
    expect(body).toEqual({ approved: 0, alreadyFinalized: 1, notReady: 0, total: 1 });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRecompute).not.toHaveBeenCalled();
  });

  it('rejects a student outright', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'student-1', institutionId: 'inst-a', role: 'student' });
    const res = await POST(req(), params());
    expect(res.status).toBe(403);
    expect(mockPrisma.answer.findMany).not.toHaveBeenCalled();
  });

  it('rejects a teacher who does not own this exam', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'teacher-other', institutionId: 'inst-a', role: 'teacher' });
    const res = await POST(req(), params());
    expect(res.status).toBe(403);
    expect(mockPrisma.answer.findMany).not.toHaveBeenCalled();
  });

  it('rejects a teacher from a different institution', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'teacher-x', institutionId: 'inst-OTHER', role: 'teacher' });
    const res = await POST(req(), params());
    expect(res.status).toBe(403);
  });

  it('allows an admin in the same institution regardless of exam ownership', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'admin-1', institutionId: 'inst-a', role: 'admin' });
    mockPrisma.answer.findMany.mockResolvedValue([]);
    const res = await POST(req(), params());
    expect(res.status).toBe(200);
  });
});
