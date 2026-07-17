import { describe, it, expect, vi, beforeEach } from 'vitest';

// Task 5's explicit test ask: a student in Class A must not see/access an exam assigned only to
// Class B, even within the same institution and teacher. POST /api/attempts previously had NO
// eligibility check at all (not even institution matching) — this is the actual enforcement
// point, since hiding an exam from a list is not real access control on its own.

const { mockGetAuthUser, mockExam, mockExamAttempt, mockExamEnrollment, mockUser, mockTransaction } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockExam: { findUnique: vi.fn() },
  mockExamAttempt: { findUnique: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
  mockExamEnrollment: { upsert: vi.fn() },
  mockUser: { findUnique: vi.fn() },
  mockTransaction: vi.fn(),
}));

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth');
  return { ...actual, getAuthUser: mockGetAuthUser };
});
vi.mock('@/lib/prisma', () => ({
  prisma: {
    exam: mockExam,
    examAttempt: mockExamAttempt,
    examEnrollment: mockExamEnrollment,
    user: mockUser,
    $transaction: mockTransaction,
  },
}));
vi.mock('@/lib/data/pooling', () => ({ materializePooledQuestions: vi.fn() }));

import { POST } from '@/app/api/attempts/route';

const INSTITUTION_A = 'inst-a';
const INSTITUTION_B = 'inst-b';
const TEACHER = 'teacher-1';
const CLASS_A = 'class-a';
const CLASS_B = 'class-b';
const STUDENT_ID = 'student-1';

function makeRequest(examId = 'exam-1'): Request {
  return new Request('http://localhost/api/attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ examId }),
  });
}

function baseExam(overrides: Partial<{ classId: string | null; teacherId: string; institutionId: string }> = {}) {
  const now = new Date();
  return {
    startTime: new Date(now.getTime() - 60_000),
    endTime: new Date(now.getTime() + 60_000),
    status: 'live',
    institutionId: INSTITUTION_A,
    settings: {},
    classId: null,
    teacherId: TEACHER,
    approvalStatus: 'approved',
    sections: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue({ id: STUDENT_ID, role: 'student', institutionId: INSTITUTION_A });
  mockExamAttempt.findUnique.mockResolvedValue(null); // brand-new attempt in every test unless overridden
  mockExamEnrollment.upsert.mockResolvedValue({});
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({
    examAttempt: {
      create: async () => ({ id: 'attempt-1', examId: 'exam-1', studentId: STUDENT_ID, status: 'in_progress', startedAt: new Date(), trustScore: 100, violationCount: 0 }),
      findUniqueOrThrow: mockExamAttempt.findUniqueOrThrow,
    },
  }));
});

describe('POST /api/attempts — eligibility gate (Task 5)', () => {
  it('blocks a student in Class A from starting an attempt on an exam scoped to Class B, same institution and teacher', async () => {
    mockExam.findUnique.mockResolvedValue(baseExam({ classId: CLASS_B, teacherId: TEACHER }));
    mockUser.findUnique.mockResolvedValue({
      studentTeachers: [{ teacherId: TEACHER }],
      classEnrollments: [{ classId: CLASS_A }],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it('allows a student enrolled in the exact class the exam is scoped to', async () => {
    mockExam.findUnique.mockResolvedValue(baseExam({ classId: CLASS_A, teacherId: TEACHER }));
    mockUser.findUnique.mockResolvedValue({
      studentTeachers: [],
      classEnrollments: [{ classId: CLASS_A }],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
  });

  it('blocks a student from a different institution entirely, even with a matching class id', async () => {
    mockGetAuthUser.mockResolvedValue({ id: STUDENT_ID, role: 'student', institutionId: INSTITUTION_B });
    mockExam.findUnique.mockResolvedValue(baseExam({ classId: CLASS_A, teacherId: TEACHER, institutionId: INSTITUTION_A }));
    mockUser.findUnique.mockResolvedValue({
      studentTeachers: [],
      classEnrollments: [{ classId: CLASS_A }],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it('preserves pre-existing behavior for an unscoped exam (no classId): visible to any TeacherStudent-linked student', async () => {
    mockExam.findUnique.mockResolvedValue(baseExam({ classId: null, teacherId: TEACHER }));
    mockUser.findUnique.mockResolvedValue({
      studentTeachers: [{ teacherId: TEACHER }],
      classEnrollments: [],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
  });

  it('blocks an unscoped exam for a student with no TeacherStudent link to that teacher', async () => {
    mockExam.findUnique.mockResolvedValue(baseExam({ classId: null, teacherId: TEACHER }));
    mockUser.findUnique.mockResolvedValue({
      studentTeachers: [{ teacherId: 'some-other-teacher' }],
      classEnrollments: [],
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });

  it('resuming an existing attempt skips the eligibility gate (only brand-new attempts are gated)', async () => {
    mockExamAttempt.findUnique.mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', studentId: STUDENT_ID });
    mockExam.findUnique.mockResolvedValue(baseExam({ classId: CLASS_B, teacherId: TEACHER }));
    // mockUser.findUnique deliberately not stubbed with matching class — should never be consulted
    mockUser.findUnique.mockResolvedValue({ studentTeachers: [], classEnrollments: [] });

    const res = await POST(makeRequest());
    expect(res.status).toBe(201);
  });
});
