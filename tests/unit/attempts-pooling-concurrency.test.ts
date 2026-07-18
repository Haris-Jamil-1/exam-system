import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { InsufficientPoolError } from '@/lib/data/pooling-errors';

// Phase 6 Task 4's single highest-risk requirement: "simulate concurrent exam-starts" for a
// pooled exam and confirm no inconsistent question counts / duplicate materialization. The
// pre-fix code read `existing` via a separate query, then called `examAttempt.upsert` and
// conditionally materialized pooled questions `if (!existing)` — two near-simultaneous
// requests for the same student+exam could both observe `existing === null` and both
// materialize a private question set for the same attempt. The fix replaces the upsert with
// `create` inside a transaction and only lets the caller whose `create` actually wins the
// unique-constraint race run materialization; the loser catches P2002 and just returns the
// winner's row.

const { mockGetAuthUser, mockPrismaExam, mockAttemptStore, mockMaterializePooledQuestions } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockPrismaExam: { findUnique: vi.fn() },
  mockAttemptStore: new Map<string, { id: string; examId: string; studentId: string; status: string; startedAt: Date }>(),
  mockMaterializePooledQuestions: vi.fn(),
}));

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth');
  return { ...actual, getAuthUser: mockGetAuthUser };
});

vi.mock('@/lib/data/pooling', () => ({
  materializePooledQuestions: mockMaterializePooledQuestions,
}));

let attemptIdCounter = 0;

vi.mock('@/lib/prisma', () => ({
  prisma: {
    exam: mockPrismaExam,
    // Eligibility gate (Task 5): student-1 is TeacherStudent-linked to teacher-1, matching the
    // unscoped (classId: null) exams this file uses throughout — same pre-existing behavior.
    user: {
      findUnique: vi.fn().mockResolvedValue({
        studentTeachers: [{ teacherId: 'teacher-1' }],
        classEnrollments: [],
      }),
    },
    examAttempt: {
      findUnique: vi.fn(async ({ where }: { where: { examId_studentId: { examId: string; studentId: string } } }) => {
        const key = `${where.examId_studentId.examId}:${where.examId_studentId.studentId}`;
        return mockAttemptStore.get(key) ?? null;
      }),
      // The P2002 loser reads the winner's committed row OUTSIDE the transaction (a query
      // inside an aborted Postgres transaction would itself fail with 25P02).
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { examId_studentId: { examId: string; studentId: string } } }) => {
        const key = `${where.examId_studentId.examId}:${where.examId_studentId.studentId}`;
        const row = mockAttemptStore.get(key);
        if (!row) throw new Error('not found');
        return row;
      }),
    },
    examEnrollment: { upsert: vi.fn().mockResolvedValue({}) },
    // Mirrors real transaction semantics: create() reserves the row immediately (like a live
    // unique-index entry does in Postgres, visible to concurrent inserts right away, before
    // commit), and a thrown error inside fn() rolls the reservation back — so a materialize
    // failure (InsufficientPoolError) never leaves an orphaned attempt row behind.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      let uncommittedKey: string | null = null;
      const tx = {
        examAttempt: {
          // No interior `await` before the check-and-set — this mirrors a real unique
          // constraint's atomicity: whichever concurrent call's synchronous microtask
          // reaches this first "wins" and every later call throws P2002, exactly like
          // Postgres would for two overlapping inserts on (examId, studentId).
          create: vi.fn(async ({ data }: { data: { examId: string; studentId: string; status: string } }) => {
            const key = `${data.examId}:${data.studentId}`;
            if (mockAttemptStore.has(key)) {
              throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
                code: 'P2002', clientVersion: 'test',
              });
            }
            attemptIdCounter += 1;
            const row = { id: `attempt-${attemptIdCounter}`, examId: data.examId, studentId: data.studentId, status: data.status, startedAt: new Date() };
            mockAttemptStore.set(key, row);
            uncommittedKey = key;
            return row;
          }),
          findUniqueOrThrow: vi.fn(async ({ where }: { where: { examId_studentId: { examId: string; studentId: string } } }) => {
            const key = `${where.examId_studentId.examId}:${where.examId_studentId.studentId}`;
            const row = mockAttemptStore.get(key);
            if (!row) throw new Error('not found');
            return row;
          }),
        },
      };
      try {
        return await fn(tx);
      } catch (err) {
        if (uncommittedKey) mockAttemptStore.delete(uncommittedKey);
        throw err;
      }
    }),
  },
}));

import { POST } from '@/app/api/attempts/route';

function makeRequest(examId: string): Request {
  return new Request('http://localhost/api/attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAttemptStore.clear();
  attemptIdCounter = 0;
  mockGetAuthUser.mockResolvedValue({ id: 'student-1', institutionId: 'inst-a', role: 'student' });
  mockPrismaExam.findUnique.mockResolvedValue({
    startTime: new Date(Date.now() - 60_000),
    endTime: new Date(Date.now() + 60_000),
    status: 'live',
    institutionId: 'inst-a',
    classId: null,
    teacherId: 'teacher-1',
    approvalStatus: 'approved',
    sections: [],
    settings: {
      dynamicPoolingBankIds: ['bank-1'],
      dynamicPoolingBlueprint: { 'clo-1': 5 },
    },
  });
  mockMaterializePooledQuestions.mockResolvedValue(undefined);
});

describe('POST /api/attempts — concurrent exam-start does not double-materialize a pooled exam', () => {
  it('two near-simultaneous requests for the same student+exam result in exactly one materialization call and one attempt id', async () => {
    const [res1, res2] = await Promise.all([
      POST(makeRequest('exam-1')),
      POST(makeRequest('exam-1')),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    const body1 = await res1.json();
    const body2 = await res2.json();

    // Both requests must resolve to the SAME attempt — no duplicate ExamAttempt rows.
    expect(body1.id).toBe(body2.id);
    // Materialization ran exactly once — the losing racer never draws its own question set.
    expect(mockMaterializePooledQuestions).toHaveBeenCalledTimes(1);
  });

  it('a sequential resume (real second request, after the first fully completed) also does not re-materialize', async () => {
    const first = await POST(makeRequest('exam-2'));
    expect(first.status).toBe(201);
    expect(mockMaterializePooledQuestions).toHaveBeenCalledTimes(1);

    const second = await POST(makeRequest('exam-2'));
    expect(second.status).toBe(201);
    expect(mockMaterializePooledQuestions).toHaveBeenCalledTimes(1); // unchanged — still 1, not 2

    const b1 = await first.json();
    const b2 = await second.json();
    expect(b1.id).toBe(b2.id);
  });
});

describe('POST /api/attempts — insufficient pool fails the exam-start gracefully', () => {
  it('returns 409 with a clear message instead of a raw crash, and creates no attempt at all', async () => {
    mockMaterializePooledQuestions.mockRejectedValue(
      new InsufficientPoolError([{ cloId: 'clo-1', cloText: 'CLO One', needed: 5, available: 2 }]),
    );

    const res = await POST(makeRequest('exam-3'));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('insufficient_pool');
    expect(body.shortfalls).toHaveLength(1);
    // The attempt row must have rolled back with the rest of the transaction — a later request
    // should get a fresh attempt, not find nothing / a half-created one from that PA.
    expect(mockAttemptStore.has('exam-3:student-1')).toBe(false);
  });
});
