import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 7 Task 1's required test: "Item-sequential lock rejects direct API re-edit of a
// past-answered item." The exam-taking architecture has no per-question autosave — every
// answer only ever lands server-side via one bulk submit at section/exam-submit time (see the
// ItemLock model comment in schema.prisma). This new endpoint is the entire server enforcement
// surface for Exam.settings.isItemSequential: the client calls it once per question, the
// moment it advances past one, and a second call for the same question must be rejected.

const { mockGetAuthUser, mockPrismaAttempt, mockPrismaExam, mockPrismaQuestion, mockPrismaItemLock } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockPrismaAttempt: { findUnique: vi.fn() },
  mockPrismaExam: { findUnique: vi.fn() },
  mockPrismaQuestion: { findUnique: vi.fn() },
  mockPrismaItemLock: { findUnique: vi.fn(), create: vi.fn() },
}));

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth');
  return { ...actual, getAuthUser: mockGetAuthUser };
});
vi.mock('@/lib/prisma', () => ({
  prisma: {
    examAttempt: mockPrismaAttempt,
    exam: mockPrismaExam,
    question: mockPrismaQuestion,
    itemLock: mockPrismaItemLock,
  },
}));

import { POST } from '@/app/api/attempts/[attemptId]/items/[questionId]/lock/route';

function makeRequest(response: unknown = 'A'): Request {
  return new Request('http://localhost/api/attempts/attempt-1/items/q-1/lock', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response }),
  });
}
function params(attemptId = 'attempt-1', questionId = 'q-1') {
  return { params: Promise.resolve({ attemptId, questionId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue({ id: 'student-1', institutionId: 'inst-a', role: 'student' });
  mockPrismaAttempt.findUnique.mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', studentId: 'student-1', status: 'in_progress' });
  mockPrismaExam.findUnique.mockResolvedValue({ settings: { isItemSequential: true } });
  mockPrismaQuestion.findUnique.mockResolvedValue({ examId: 'exam-1', attemptId: null });
  mockPrismaItemLock.findUnique.mockResolvedValue(null);
  mockPrismaItemLock.create.mockResolvedValue({ lockedAt: new Date() });
});

describe('POST /api/attempts/[attemptId]/items/[questionId]/lock', () => {
  it('locks an unlocked item and returns 201', async () => {
    const res = await POST(makeRequest('A'), params());
    expect(res.status).toBe(201);
    expect(mockPrismaItemLock.create).toHaveBeenCalledWith({
      data: { attemptId: 'attempt-1', questionId: 'q-1', response: 'A' },
    });
  });

  it('rejects a second lock attempt on the same item — the direct re-edit test', async () => {
    mockPrismaItemLock.findUnique.mockResolvedValue({ id: 'lock-1', attemptId: 'attempt-1', questionId: 'q-1', response: 'A', lockedAt: new Date() });
    const res = await POST(makeRequest('B'), params()); // trying to change the answer
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('item_locked');
    expect(mockPrismaItemLock.create).not.toHaveBeenCalled();
  });

  it('rejects when the exam does not use isItemSequential at all', async () => {
    mockPrismaExam.findUnique.mockResolvedValue({ settings: { isItemSequential: false } });
    const res = await POST(makeRequest('A'), params());
    expect(res.status).toBe(400);
    expect(mockPrismaItemLock.create).not.toHaveBeenCalled();
  });

  it('rejects a caller who does not own the attempt', async () => {
    mockPrismaAttempt.findUnique.mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', studentId: 'someone-else', status: 'in_progress' });
    const res = await POST(makeRequest('A'), params());
    expect(res.status).toBe(403);
    expect(mockPrismaItemLock.create).not.toHaveBeenCalled();
  });

  it('rejects locking once the attempt is already submitted', async () => {
    mockPrismaAttempt.findUnique.mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', studentId: 'student-1', status: 'submitted' });
    const res = await POST(makeRequest('A'), params());
    expect(res.status).toBe(409);
    expect(mockPrismaItemLock.create).not.toHaveBeenCalled();
  });

  it('rejects a question that does not belong to this attempt (wrong exam or another student\'s pooled question)', async () => {
    mockPrismaQuestion.findUnique.mockResolvedValue({ examId: 'exam-1', attemptId: 'someone-elses-attempt' });
    const res = await POST(makeRequest('A'), params());
    expect(res.status).toBe(404);
    expect(mockPrismaItemLock.create).not.toHaveBeenCalled();
  });

  it('allows a question that is this attempt\'s own pooled question', async () => {
    mockPrismaQuestion.findUnique.mockResolvedValue({ examId: 'exam-1', attemptId: 'attempt-1' });
    const res = await POST(makeRequest('A'), params());
    expect(res.status).toBe(201);
  });
});
