import { describe, it, expect, vi, beforeEach } from 'vitest';

// Task 5: the teacher dashboard's "Total Students" card silently read 0 (looked "not displayed")
// for any teacher whose whole roster joined via the class-invite flow, because the underlying
// count only checked TeacherStudent, never ClassEnrollment. This confirms the fixed query shape
// includes both relations, and that "Active Exams" is now time-aware (a scheduled exam whose
// startTime has passed counts as active without needing its DB status manually flipped).

const { mockUser, mockExam, mockViolation, mockExamAttempt } = vi.hoisted(() => ({
  mockUser: { findUnique: vi.fn(), count: vi.fn() },
  mockExam: { count: vi.fn(), findMany: vi.fn() },
  mockViolation: { count: vi.fn(), findMany: vi.fn() },
  mockExamAttempt: { aggregate: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: mockUser, exam: mockExam, violation: mockViolation, examAttempt: mockExamAttempt },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'supabase-teacher', user_metadata: { institutionId: 'inst-a', role: 'teacher' } } } }) },
  }),
}));

import { getTeacherDashboardData } from '@/lib/data/analytics';

const TEACHER_ID = 'teacher-1';

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.findUnique.mockResolvedValue({ id: TEACHER_ID });
  mockUser.count.mockResolvedValue(0);
  mockExam.count.mockResolvedValue(0);
  mockExam.findMany.mockResolvedValue([]);
  mockViolation.count.mockResolvedValue(0);
  mockViolation.findMany.mockResolvedValue([]);
  mockExamAttempt.aggregate.mockResolvedValue({ _avg: { trustScore: null } });
});

describe('getTeacherDashboardData — student count and active-exam fixes (Task 5)', () => {
  it('counts students via the union of TeacherStudent AND ClassEnrollment, not TeacherStudent alone', async () => {
    await getTeacherDashboardData();

    expect(mockUser.count).toHaveBeenCalledWith({
      where: {
        role: 'student',
        OR: [
          { studentTeachers: { some: { teacherId: TEACHER_ID } } },
          { classEnrollments: { some: { class: { teacherId: TEACHER_ID } } } },
        ],
      },
    });
  });

  it('counts active exams as an OR of not-yet-ended-live and scheduled-but-past-startTime', async () => {
    await getTeacherDashboardData();

    const call = mockExam.count.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { status: 'live', endTime: { gt: expect.any(Date) } },
      { status: 'scheduled', startTime: { lte: expect.any(Date) }, endTime: { gt: expect.any(Date) } },
    ]);
  });
});
