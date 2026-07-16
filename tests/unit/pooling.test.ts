import { describe, it, expect, vi } from 'vitest';
import { materializePooledQuestions } from '@/lib/data/pooling';
import { InsufficientPoolError } from '@/lib/data/pooling-errors';

// Phase 6 Task 4's flagged highest-risk gap: materializePooledQuestions previously drew
// `ORDER BY RANDOM() LIMIT count` with no check that `count` approved items actually existed —
// a shrunk pool (item deleted/unapproved after the blueprint was saved) silently produced a
// shorter exam with zero signal to anyone. These tests exercise the fix directly against a
// fake transaction-shaped Prisma client (the real thing is exercised via the attempts-route
// concurrency test in attempts-pooling-concurrency.test.ts).

function fakeDb(opts: {
  banks: { id: string }[];
  approvedCounts: Record<string, number>; // cloId -> available approved count
  drawnIdsByClo: Record<string, string[]>; // cloId -> item ids the ORDER BY RANDOM() query "returns"
  items: { id: string; learningObjectiveId: string; options: unknown[] }[];
  cloText?: Record<string, string>;
}) {
  const questionCreates: unknown[] = [];
  return {
    db: {
      itemBank: { findMany: vi.fn().mockResolvedValue(opts.banks) },
      item: {
        groupBy: vi.fn().mockImplementation(async ({ where }: { where: { learningObjectiveId: { in: string[] } } }) => {
          return where.learningObjectiveId.in
            .filter(cloId => (opts.approvedCounts[cloId] ?? 0) > 0)
            .map(cloId => ({ learningObjectiveId: cloId, _count: { _all: opts.approvedCounts[cloId] ?? 0 } }));
        }),
        findMany: vi.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => {
          return opts.items.filter(i => where.id.in.includes(i.id));
        }),
      },
      learningObjective: {
        findMany: vi.fn().mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => {
          return where.id.in.map((id: string) => ({ id, text: opts.cloText?.[id] ?? id }));
        }),
      },
      $queryRaw: vi.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
        // values[1] is the cloId interpolated into the query (values[0] is verifiedBankIds, values[2] is count)
        const cloId = values[1] as string;
        const count = values[2] as number;
        const ids = (opts.drawnIdsByClo[cloId] ?? []).slice(0, count);
        return Promise.resolve(ids.map(id => ({ id })));
      }),
      question: {
        create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => {
          questionCreates.push(data);
          return data;
        }),
      },
    },
    questionCreates,
  };
}

describe('materializePooledQuestions — draw count matches blueprint exactly', () => {
  it('draws exactly the blueprint count per CLO and persists that many Question rows total', async () => {
    const { db, questionCreates } = fakeDb({
      banks: [{ id: 'bank-1' }],
      approvedCounts: { 'clo-1': 10, 'clo-2': 10 },
      drawnIdsByClo: {
        'clo-1': ['item-1', 'item-2', 'item-3'],
        'clo-2': ['item-4', 'item-5'],
      },
      items: [
        { id: 'item-1', learningObjectiveId: 'clo-1', options: [] },
        { id: 'item-2', learningObjectiveId: 'clo-1', options: [] },
        { id: 'item-3', learningObjectiveId: 'clo-1', options: [] },
        { id: 'item-4', learningObjectiveId: 'clo-2', options: [] },
        { id: 'item-5', learningObjectiveId: 'clo-2', options: [] },
      ],
    });

    await materializePooledQuestions(db as never, {
      examId: 'exam-1', institutionId: 'inst-a', attemptId: 'attempt-1',
      bankIds: ['bank-1'], blueprint: { 'clo-1': 3, 'clo-2': 2 },
    });

    expect(questionCreates).toHaveLength(5);
    const bySource = new Set(questionCreates.map((q) => (q as { sourceItemId: string }).sourceItemId));
    expect(bySource.size).toBe(5);
  });
});

describe('materializePooledQuestions — insufficient pool at exam-start fails gracefully', () => {
  it('throws InsufficientPoolError (not a crash, not a silent under-draw) when the approved pool for a CLO has shrunk below the blueprint target', async () => {
    const { db, questionCreates } = fakeDb({
      banks: [{ id: 'bank-1' }],
      approvedCounts: { 'clo-1': 2 }, // blueprint wants 5, only 2 approved remain
      drawnIdsByClo: { 'clo-1': ['item-1', 'item-2'] },
      items: [
        { id: 'item-1', learningObjectiveId: 'clo-1', options: [] },
        { id: 'item-2', learningObjectiveId: 'clo-1', options: [] },
      ],
      cloText: { 'clo-1': 'Explain photosynthesis' },
    });

    await expect(materializePooledQuestions(db as never, {
      examId: 'exam-1', institutionId: 'inst-a', attemptId: 'attempt-1',
      bankIds: ['bank-1'], blueprint: { 'clo-1': 5 },
    })).rejects.toBeInstanceOf(InsufficientPoolError);

    // No partial draw/insert happened — the check runs before any Question row is created.
    expect(questionCreates).toHaveLength(0);
  });

  it('reports every short CLO, not just the first one found', async () => {
    const { db } = fakeDb({
      banks: [{ id: 'bank-1' }],
      approvedCounts: { 'clo-1': 1, 'clo-2': 10 },
      drawnIdsByClo: {},
      items: [],
      cloText: { 'clo-1': 'CLO One', 'clo-2': 'CLO Two' },
    });

    try {
      await materializePooledQuestions(db as never, {
        examId: 'exam-1', institutionId: 'inst-a', attemptId: 'attempt-1',
        bankIds: ['bank-1'], blueprint: { 'clo-1': 4, 'clo-2': 3 },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientPoolError);
      const shortfalls = (err as InsufficientPoolError).shortfalls;
      expect(shortfalls).toHaveLength(1);
      expect(shortfalls[0]).toMatchObject({ cloId: 'clo-1', needed: 4, available: 1 });
    }
  });
});

describe('materializePooledQuestions — cross-institution bank guard still holds', () => {
  it('does nothing if none of the given bankIds actually belong to the exam institution', async () => {
    const { db, questionCreates } = fakeDb({
      banks: [], // simulates: verifiedBanks query found zero matches for this institution
      approvedCounts: {},
      drawnIdsByClo: {},
      items: [],
    });

    await materializePooledQuestions(db as never, {
      examId: 'exam-1', institutionId: 'inst-a', attemptId: 'attempt-1',
      bankIds: ['bank-from-other-institution'], blueprint: { 'clo-1': 3 },
    });

    expect(questionCreates).toHaveLength(0);
  });
});
