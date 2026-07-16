import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 6 Task 2 + Task 3 required coverage: this is the first route-handler-level test in
// this repo. Prior sessions verified /api/ai/generate-questions exclusively via manual/live
// Playwright QA (see CLAUDE.md's 2026-07-09 "item 6/7" entries) — this closes that gap with
// committed automated tests, per the Phase 6 spec's explicit test requirements for both tasks.

const { mockGetAuthUser, mockGetCallerAndBankPermission, mockConsumeAiQuota,
  mockGenerationJobCreate, mockLearningObjectiveFindUnique, mockAfter, mockRunGenerationJob,
} = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockGetCallerAndBankPermission: vi.fn(),
  mockConsumeAiQuota: vi.fn(),
  mockGenerationJobCreate: vi.fn(),
  mockLearningObjectiveFindUnique: vi.fn(),
  mockAfter: vi.fn(),
  mockRunGenerationJob: vi.fn(),
}));

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth');
  return { ...actual, getAuthUser: mockGetAuthUser };
});
vi.mock('@/lib/data/item-banks', () => ({
  getCallerAndBankPermission: mockGetCallerAndBankPermission,
}));
vi.mock('@/lib/ai/quota', () => ({
  consumeAiQuota: mockConsumeAiQuota,
  AiQuotaExceededError: class AiQuotaExceededError extends Error {
    constructor(public used: number, public quota: number) { super('quota exceeded'); }
  },
}));
vi.mock('@/lib/ai/generation-job', () => ({ runGenerationJob: mockRunGenerationJob }));
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: mockAfter };
});
vi.mock('@/lib/prisma', () => ({
  prisma: {
    learningObjective: { findUnique: mockLearningObjectiveFindUnique },
    generationJob: { create: mockGenerationJobCreate },
  },
}));

import { POST } from '@/app/api/ai/generate-questions/route';
import { MAX_BATCH_SIZE } from '@/lib/ai/constants';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/ai/generate-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const EDITOR_PERMISSION = {
  caller: { id: 'teacher-1', institutionId: 'inst-a', role: 'teacher' as const },
  role: 'editor' as const,
  bank: { id: 'bank-1', bankLevel: 'personal', ownerId: 'teacher-1', institutionId: 'inst-a' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue({ id: 'teacher-1', institutionId: 'inst-a', role: 'teacher' });
  mockConsumeAiQuota.mockResolvedValue(undefined);
  mockGenerationJobCreate.mockResolvedValue({ id: 'job-1' });
});

describe('POST /api/ai/generate-questions — itemBankId is required and access-checked', () => {
  it('rejects a payload with no itemBankId at all (the old examId-shaped payload no longer works)', async () => {
    const res = await POST(makeRequest({ text: 'source material '.repeat(3), examId: 'exam-old-1' }));
    expect(res.status).toBe(400);
    expect(mockGetCallerAndBankPermission).not.toHaveBeenCalled();
    expect(mockGenerationJobCreate).not.toHaveBeenCalled();
  });

  it('rejects an itemBankId that does not resolve to any bank (404, not silently ignored)', async () => {
    mockGetCallerAndBankPermission.mockResolvedValue(null);
    const res = await POST(makeRequest({ text: 'source material '.repeat(3), itemBankId: 'nonexistent-bank' }));
    expect(res.status).toBe(404);
    expect(mockGenerationJobCreate).not.toHaveBeenCalled();
  });

  it('rejects when the caller only has viewer access to the bank (403)', async () => {
    mockGetCallerAndBankPermission.mockResolvedValue({ ...EDITOR_PERMISSION, role: 'viewer' });
    const res = await POST(makeRequest({ text: 'source material '.repeat(3), itemBankId: 'bank-1' }));
    expect(res.status).toBe(403);
    expect(mockGenerationJobCreate).not.toHaveBeenCalled();
  });

  it('accepts a valid itemBankId with editor access and creates a job scoped to that bank', async () => {
    mockGetCallerAndBankPermission.mockResolvedValue(EDITOR_PERMISSION);
    const res = await POST(makeRequest({ text: 'source material '.repeat(3), itemBankId: 'bank-1', count: 3 }));
    expect(res.status).toBe(202);
    expect(mockGenerationJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ itemBankId: 'bank-1' }) }),
    );
  });
});

describe('POST /api/ai/generate-questions — server-side batch-size enforcement (Task 3)', () => {
  it('rejects a client-bypassed over-limit count even though the frontend caps it at MAX_BATCH_SIZE', async () => {
    mockGetCallerAndBankPermission.mockResolvedValue(EDITOR_PERMISSION);
    const res = await POST(makeRequest({
      text: 'source material '.repeat(3), itemBankId: 'bank-1', count: MAX_BATCH_SIZE + 35,
    }));
    expect(res.status).toBe(400);
    expect(mockGenerationJobCreate).not.toHaveBeenCalled();
    expect(mockAfter).not.toHaveBeenCalled();
  });

  it('accepts exactly MAX_BATCH_SIZE', async () => {
    mockGetCallerAndBankPermission.mockResolvedValue(EDITOR_PERMISSION);
    const res = await POST(makeRequest({
      text: 'source material '.repeat(3), itemBankId: 'bank-1', count: MAX_BATCH_SIZE,
    }));
    expect(res.status).toBe(202);
  });
});

describe('POST /api/ai/generate-questions — CLO resolution (Task 3)', () => {
  it('rejects a nonexistent learningObjectiveId with a clear 400, not silent ignore', async () => {
    mockGetCallerAndBankPermission.mockResolvedValue(EDITOR_PERMISSION);
    mockLearningObjectiveFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({
      text: 'source material '.repeat(3), itemBankId: 'bank-1', learningObjectiveId: 'clo-ghost',
    }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/learningObjectiveId/i);
    expect(mockGenerationJobCreate).not.toHaveBeenCalled();
  });

  it('rejects a CLO belonging to a different institution than the bank', async () => {
    mockGetCallerAndBankPermission.mockResolvedValue(EDITOR_PERMISSION);
    mockLearningObjectiveFindUnique.mockResolvedValue({
      id: 'clo-1', text: 'Explain X', topic: { course: { institutionId: 'inst-OTHER' } },
    });
    const res = await POST(makeRequest({
      text: 'source material '.repeat(3), itemBankId: 'bank-1', learningObjectiveId: 'clo-1',
    }));
    expect(res.status).toBe(400);
    expect(mockGenerationJobCreate).not.toHaveBeenCalled();
  });

  it('resolves a valid same-institution CLO and stores its text + id on the job (every item in the batch inherits it downstream)', async () => {
    mockGetCallerAndBankPermission.mockResolvedValue(EDITOR_PERMISSION);
    mockLearningObjectiveFindUnique.mockResolvedValue({
      id: 'clo-1', text: 'Explain photosynthesis', topic: { course: { institutionId: 'inst-a' } },
    });
    const res = await POST(makeRequest({
      text: 'source material '.repeat(3), itemBankId: 'bank-1', learningObjectiveId: 'clo-1',
    }));
    expect(res.status).toBe(202);
    const createCall = mockGenerationJobCreate.mock.calls[0][0];
    expect(createCall.data.learningObjectiveId).toBe('clo-1');
    expect(createCall.data.promptParams.cloText).toBe('Explain photosynthesis');
  });
});
