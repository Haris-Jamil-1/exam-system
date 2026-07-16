import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 6 Task 3 required test: "every item in a generated batch has correct
// learningObjectiveId" — this exercises the actual persistence step in runGenerationJob
// (src/lib/ai/generation-job.ts:92-121), not just the route's request validation
// (covered separately in generate-questions-route.test.ts).

const { mockGenerateItems, mockPrisma } = vi.hoisted(() => {
  const job = {
    id: 'job-1', requestedById: 'teacher-1', institutionId: 'inst-a', itemBankId: 'bank-1',
    learningObjectiveId: 'clo-1', requestedCount: 3, status: 'queued',
    promptParams: { text: 'source', count: 3, difficulty: 'medium', type: 'mcq' },
    bank: { id: 'bank-1', bankLevel: 'personal', ownerId: 'teacher-1', institutionId: 'inst-a' },
  };
  return {
    mockGenerateItems: vi.fn(),
    mockPrisma: {
      generationJob: {
        findUnique: vi.fn().mockResolvedValue(job),
        update: vi.fn().mockResolvedValue({}),
      },
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'teacher-1', institutionId: 'inst-a', role: 'teacher' }) },
      itemBankAccess: { findFirst: vi.fn().mockResolvedValue({ permissionRole: 'owner' }) },
      item: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({ id: `item-${Math.random()}`, ...args.data })),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/ai/claude-generator', () => ({ generateItems: mockGenerateItems }));

import { runGenerationJob } from '@/lib/ai/generation-job';

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.generationJob.findUnique.mockResolvedValue({
    id: 'job-1', requestedById: 'teacher-1', institutionId: 'inst-a', itemBankId: 'bank-1',
    learningObjectiveId: 'clo-1', requestedCount: 3, status: 'queued',
    promptParams: { text: 'source', count: 3, difficulty: 'medium', type: 'mcq' },
    bank: { id: 'bank-1', bankLevel: 'personal', ownerId: 'teacher-1', institutionId: 'inst-a' },
  });
  mockPrisma.user.findUnique.mockResolvedValue({ id: 'teacher-1', institutionId: 'inst-a', role: 'teacher' });
  mockPrisma.itemBankAccess.findFirst.mockResolvedValue({ permissionRole: 'owner' });
  mockPrisma.item.findMany.mockResolvedValue([]);
  mockPrisma.$queryRaw.mockResolvedValue([]);
});

describe('runGenerationJob — every item in the batch gets learningObjectiveId stamped', () => {
  it('stamps the job-level CLO id onto every created item, none null', async () => {
    mockGenerateItems.mockResolvedValue({
      items: [
        { type: 'mcq', stem: 'Q1', marks: 1, difficulty: 'medium', correctAnswer: 'A', options: ['A', 'B'] },
        { type: 'mcq', stem: 'Q2', marks: 1, difficulty: 'medium', correctAnswer: 'A', options: ['A', 'B'] },
        { type: 'mcq', stem: 'Q3', marks: 1, difficulty: 'medium', correctAnswer: 'A', options: ['A', 'B'] },
      ],
      model: 'mock', inputTokens: 0, outputTokens: 0,
    });

    await runGenerationJob('job-1');

    expect(mockPrisma.item.create).toHaveBeenCalledTimes(3);
    const createCalls = mockPrisma.item.create.mock.calls as [{ data: { learningObjectiveId: string | null } }][];
    const createdWithClo = createCalls.filter(c => c[0].data.learningObjectiveId === 'clo-1');
    expect(createdWithClo).toHaveLength(3);
    const anyNull = createCalls.some(c => c[0].data.learningObjectiveId == null);
    expect(anyNull).toBe(false);

    const updateCalls = mockPrisma.generationJob.update.mock.calls as [{ data: { status?: string } }][];
    const updateCall = updateCalls.find(c => c[0].data.status === 'succeeded');
    expect(updateCall).toBeTruthy();
  });

  it('when no CLO was specified on the job, items are created with a null learningObjectiveId (not silently defaulted)', async () => {
    mockPrisma.generationJob.findUnique.mockResolvedValue({
      id: 'job-2', requestedById: 'teacher-1', institutionId: 'inst-a', itemBankId: 'bank-1',
      learningObjectiveId: null, requestedCount: 1, status: 'queued',
      promptParams: { text: 'source', count: 1, difficulty: 'medium', type: 'mcq' },
      bank: { id: 'bank-1', bankLevel: 'personal', ownerId: 'teacher-1', institutionId: 'inst-a' },
    });
    mockGenerateItems.mockResolvedValue({
      items: [{ type: 'mcq', stem: 'Q1', marks: 1, difficulty: 'medium', correctAnswer: 'A', options: ['A', 'B'] }],
      model: 'mock', inputTokens: 0, outputTokens: 0,
    });

    await runGenerationJob('job-2');

    expect(mockPrisma.item.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.item.create.mock.calls[0][0].data.learningObjectiveId).toBeNull();
  });
});
