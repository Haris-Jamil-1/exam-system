import { describe, it, expect, vi, beforeEach } from 'vitest';

// Task 5's other half of "should not see/access": getStudentExams is what powers the student's
// "my exams" list. This confirms a Class-B-scoped exam is excluded from a Class-A student's
// list even though both share the same institution and teacher.

const { mockUser, mockExam, mockExamAttempt } = vi.hoisted(() => ({
  mockUser: vi.fn(),
  mockExam: { findMany: vi.fn() },
  mockExamAttempt: { findMany: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mockUser },
    exam: mockExam,
    examAttempt: mockExamAttempt,
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'supabase-student', user_metadata: {} } } }) },
  }),
}));

import { getStudentExams } from '@/lib/data/analytics';

const TEACHER = 'teacher-1';
const CLASS_A = 'class-a';

beforeEach(() => {
  vi.clearAllMocks();
  mockExam.findMany.mockResolvedValue([]);
  mockExamAttempt.findMany.mockResolvedValue([]);
});

describe('getStudentExams — class-scoped visibility (Task 5)', () => {
  it('queries with an OR clause scoping class-restricted exams to the student\'s own enrolled classes', async () => {
    // getSession() (called first, inside getStudentExams) does its own separate
    // prisma.user.findUnique lookup for prismaUserId before getStudentExams' own richer query —
    // both share this same mocked fn, so the first resolved value is consumed by getSession.
    mockUser
      .mockResolvedValueOnce({ id: 'student-1' })
      .mockResolvedValueOnce({
        id: 'student-1',
        institutionId: 'inst-a',
        studentTeachers: [{ teacherId: TEACHER }],
        classEnrollments: [{ classId: CLASS_A }],
      });

    await getStudentExams();

    expect(mockExam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          institutionId: 'inst-a',
          OR: [
            { classId: null, teacherId: { in: [TEACHER] } },
            { classId: { in: [CLASS_A] } },
          ],
        }),
      }),
    );
  });

  it('a student with no class enrollments only matches unscoped exams from their own teachers', async () => {
    mockUser
      .mockResolvedValueOnce({ id: 'student-1' })
      .mockResolvedValueOnce({
        id: 'student-1',
        institutionId: 'inst-a',
        studentTeachers: [{ teacherId: TEACHER }],
        classEnrollments: [],
      });

    await getStudentExams();

    const where = mockExam.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { classId: null, teacherId: { in: [TEACHER] } },
      { classId: { in: [] } },
    ]);
  });
});
