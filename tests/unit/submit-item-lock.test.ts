import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 7 defense-in-depth test: even if a client stops calling the per-item lock endpoint
// partway through and tries to smuggle a different answer for an already-locked question
// through the final bulk submit, the submit route must use the server-trusted locked value,
// never the client-submitted one, for any isItemSequential exam.

const { mockGetAuthUser, mockPrisma } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockPrisma: {
    examAttempt: { findUnique: vi.fn(), update: vi.fn() },
    exam: { findUnique: vi.fn() },
    question: { findMany: vi.fn() },
    violation: { findMany: vi.fn() },
    itemLock: { findMany: vi.fn() },
    answer: { upsert: vi.fn() },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
  },
}));

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth');
  return { ...actual, getAuthUser: mockGetAuthUser };
});
vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/ai/grading', () => ({ runGradingForAttempt: vi.fn() }));
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: (fn: () => void) => fn() };
});

import { POST } from '@/app/api/attempts/[attemptId]/submit/route';

function makeRequest(answers: Record<string, string>): Request {
  return new Request('http://localhost/api/attempts/attempt-1/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId: 'exam-1', answers }),
  });
}

const QUESTION_ROW = (id: string, correct: string) => ({
  id, examId: 'exam-1', attemptId: null, sectionId: null, type: 'mcq', stem: `Q ${id}`,
  marks: 1, difficulty: 'medium', order: 0, required: false, explanation: null,
  correctAnswer: null,
  options: [
    { id: `${id}-correct`, text: correct, isCorrect: true, order: 0 },
    { id: `${id}-wrong`, text: 'wrong', isCorrect: false, order: 1 },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  mockGetAuthUser.mockResolvedValue({ id: 'student-1', institutionId: 'inst-a', role: 'student' });
  mockPrisma.examAttempt.findUnique.mockResolvedValue({
    id: 'attempt-1', examId: 'exam-1', studentId: 'student-1', status: 'in_progress',
    startedAt: new Date(Date.now() - 60_000),
  });
  mockPrisma.violation.findMany.mockResolvedValue([]);
  mockPrisma.answer.upsert.mockResolvedValue({});
  mockPrisma.examAttempt.update.mockResolvedValue({});
});

describe('POST /api/attempts/[attemptId]/submit — isItemSequential locked answers override the client payload', () => {
  it('uses the locked response instead of a tampered client-submitted one', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      duration: 60, endTime: new Date(Date.now() + 3600_000),
      settings: { isItemSequential: true },
    });
    mockPrisma.question.findMany.mockResolvedValue([QUESTION_ROW('q-1', 'q-1-correct')]);
    // The item was locked in with the CORRECT answer id...
    mockPrisma.itemLock.findMany.mockResolvedValue([{ questionId: 'q-1', response: 'q-1-correct' }]);

    // ...but the client's bulk submit tries to claim the WRONG option instead.
    const res = await POST(makeRequest({ 'q-1': 'q-1-wrong' }), { params: Promise.resolve({ attemptId: 'attempt-1' }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Scored using the locked (correct) answer, not the tampered submitted one.
    expect(body.perQuestion[0].marksAwarded).toBe(1);
  });

  it('does not touch answers at all when the exam is not isItemSequential', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      duration: 60, endTime: new Date(Date.now() + 3600_000),
      settings: {},
    });
    mockPrisma.question.findMany.mockResolvedValue([QUESTION_ROW('q-1', 'q-1-correct')]);

    const res = await POST(makeRequest({ 'q-1': 'q-1-wrong' }), { params: Promise.resolve({ attemptId: 'attempt-1' }) });
    expect(res.status).toBe(200);
    expect(mockPrisma.itemLock.findMany).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.perQuestion[0].marksAwarded).toBe(0); // client's (wrong) submitted value is scored as-is
  });
});
