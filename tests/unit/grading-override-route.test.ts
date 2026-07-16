import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 7 Task 2 required tests: override recalculates the score and flags the answer as
// finalized/modified; a user without grading rights is rejected server-side; finalized
// (confirmed) items reject further override attempts.

const { mockGetAuthUser, mockPrisma, mockRecompute } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockPrisma: {
    answer: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    answerGrading: { create: vi.fn() },
  },
  mockRecompute: vi.fn(),
}));

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth');
  return { ...actual, getAuthUser: mockGetAuthUser };
});
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/ai/grading', () => ({ recomputeAttemptScore: mockRecompute, runGradingForAttempt: vi.fn() }));
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: (fn: () => void) => fn() };
});

import { POST } from '@/app/api/grading/answers/[answerId]/route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/grading/answers/answer-1', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
const params = () => ({ params: Promise.resolve({ answerId: 'answer-1' }) });

const BASE_ANSWER = {
  id: 'answer-1', attemptId: 'attempt-1', gradingStatus: 'ai_suggested',
  question: { marks: 10, exam: { teacherId: 'teacher-1', institutionId: 'inst-a' } },
  gradings: [{ totalScore: 7, feedback: 'AI feedback', rubricSnapshot: null }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  mockGetAuthUser.mockResolvedValue({ id: 'teacher-1', institutionId: 'inst-a', role: 'teacher' });
  mockPrisma.answer.findUnique.mockResolvedValue(BASE_ANSWER);
  mockPrisma.answer.update.mockResolvedValue({});
  mockPrisma.answerGrading.create.mockResolvedValue({});
});

describe('POST /api/grading/answers/[answerId] — override recalculates and flags', () => {
  it('applies the override mark, capped at question max, and flags gradingStatus overridden', async () => {
    const res = await POST(makeRequest({ action: 'override', marks: 9, reason: 'partial credit' }), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('overridden');
    expect(body.marksAwarded).toBe(9);
    expect(mockPrisma.answer.update).toHaveBeenCalledWith({
      where: { id: 'answer-1' },
      data: expect.objectContaining({ marksAwarded: 9, gradingStatus: 'overridden' }),
    });
    expect(mockRecompute).toHaveBeenCalledWith('attempt-1');
  });

  it('caps an override above the question max', async () => {
    const res = await POST(makeRequest({ action: 'override', marks: 999 }), params());
    const body = await res.json();
    expect(body.marksAwarded).toBe(10); // capped to question.marks
  });
});

describe('POST /api/grading/answers/[answerId] — server-enforced grading rights', () => {
  it('rejects a student outright', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'student-1', institutionId: 'inst-a', role: 'student' });
    const res = await POST(makeRequest({ action: 'override', marks: 5 }), params());
    expect(res.status).toBe(403);
    expect(mockPrisma.answer.update).not.toHaveBeenCalled();
  });

  it('rejects a teacher from a different institution', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'teacher-x', institutionId: 'inst-OTHER', role: 'teacher' });
    const res = await POST(makeRequest({ action: 'override', marks: 5 }), params());
    expect(res.status).toBe(403);
    expect(mockPrisma.answer.update).not.toHaveBeenCalled();
  });

  it('rejects a teacher from the same institution who does not own this exam', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'teacher-other', institutionId: 'inst-a', role: 'teacher' });
    const res = await POST(makeRequest({ action: 'override', marks: 5 }), params());
    expect(res.status).toBe(403);
    expect(mockPrisma.answer.update).not.toHaveBeenCalled();
  });

  it('allows an admin in the same institution regardless of exam ownership', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'admin-1', institutionId: 'inst-a', role: 'admin' });
    const res = await POST(makeRequest({ action: 'override', marks: 5 }), params());
    expect(res.status).toBe(200);
  });
});

describe('POST /api/grading/answers/[answerId] — finalized (confirmed) answers reject further mutation', () => {
  it('rejects a second override attempt once the answer is confirmed', async () => {
    mockPrisma.answer.findUnique.mockResolvedValue({ ...BASE_ANSWER, gradingStatus: 'confirmed' });
    const res = await POST(makeRequest({ action: 'override', marks: 5 }), params());
    expect(res.status).toBe(409);
    expect(mockPrisma.answer.update).not.toHaveBeenCalled();
  });

  it('rejects a confirm attempt on an already-confirmed answer', async () => {
    mockPrisma.answer.findUnique.mockResolvedValue({ ...BASE_ANSWER, gradingStatus: 'confirmed' });
    const res = await POST(makeRequest({ action: 'confirm' }), params());
    expect(res.status).toBe(409);
  });

  it('rejects a regrade attempt on an already-confirmed answer', async () => {
    mockPrisma.answer.findUnique.mockResolvedValue({ ...BASE_ANSWER, gradingStatus: 'confirmed' });
    const res = await POST(makeRequest({ action: 'regrade' }), params());
    expect(res.status).toBe(409);
  });

  it('still allows overriding an already-overridden (but not confirmed) answer', async () => {
    mockPrisma.answer.findUnique.mockResolvedValue({ ...BASE_ANSWER, gradingStatus: 'overridden' });
    const res = await POST(makeRequest({ action: 'override', marks: 6 }), params());
    expect(res.status).toBe(200);
  });
});
