import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regression tests for "upcoming exams do not show on the student dashboard".
//
// Two real defects, both in getStudentDashboardData (the /student dashboard's only data source):
//  1. It resolved the student's roster from TeacherStudent (studentTeachers) ONLY and filtered
//     exams with `teacherId: { in: teacherIds }` — no ClassEnrollment branch at all. A student
//     who joined through the per-class invite flow has a ClassEnrollment row but NO
//     TeacherStudent row, so teacherIds was [], Prisma's `{ in: [] }` matched nothing, and the
//     dashboard's Upcoming Exams panel was permanently empty — while the exact same exams
//     listed fine on /student/exams (getStudentExams), which had the correct OR clause.
//     It also never checked classId, leaking class-scoped exams to the teacher's other students.
//  2. The "Upcoming Exams" stat card counted ExamEnrollment rows with a future startTime, but
//     ExamEnrollment is only ever created by POST /api/attempts (when a student STARTS an exam),
//     and that route rejects starting before startTime — so the count was structurally always 0.

const { mockUser, mockExam, mockExamAttempt, mockExamEnrollment } = vi.hoisted(() => ({
  mockUser: vi.fn(),
  mockExam: { findMany: vi.fn() },
  mockExamAttempt: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), findFirst: vi.fn() },
  mockExamEnrollment: { count: vi.fn() },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mockUser },
    exam: mockExam,
    examAttempt: mockExamAttempt,
    examEnrollment: mockExamEnrollment,
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'supabase-student', user_metadata: {} } } }),
      // Identity now resolves via getClaims() (local ES256 JWT verification, see lib/session.ts).
      getClaims: async () => ({ data: { claims: { sub: 'supabase-student', user_metadata: {} } }, error: null }),
    },
  }),
}));

import { getStudentDashboardData } from '@/lib/data/analytics';

const TEACHER = 'teacher-1';
const CLASS_A = 'class-a';

const HOUR = 60 * 60 * 1000;

function examRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'exam-1',
    title: 'Midterm',
    subject: 'Physics',
    status: 'scheduled',
    startTime: new Date(Date.now() + 24 * HOUR), // still upcoming
    duration: 60,
    settings: null,
    resultsPublishedAt: null,
    _count: { questions: 10 },
    targetTags: [],
    targetTagsOperator: 'OR',
    ...over,
  };
}

// getSession() runs first and does its own prisma.user.findUnique for prismaUserId; the richer
// visibility lookup is the second call on the same mocked fn.
function mockStudent(opts: { teacherIds: string[]; classIds: string[] }) {
  mockUser
    .mockResolvedValueOnce({ id: 'student-1' })
    .mockResolvedValueOnce({
      id: 'student-1',
      institutionId: 'inst-a',
      studentTeachers: opts.teacherIds.map(teacherId => ({ teacherId })),
      classEnrollments: opts.classIds.map(classId => ({ classId })),
      tags: [],
    });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExam.findMany.mockResolvedValue([]);
  mockExamAttempt.findMany.mockResolvedValue([]);
  mockExamAttempt.count.mockResolvedValue(0);
  mockExamAttempt.aggregate.mockResolvedValue({ _avg: { scorePercentage: null, trustScore: null } });
  mockExamAttempt.findFirst.mockResolvedValue(null);
  mockExamEnrollment.count.mockResolvedValue(0);
});

describe('getStudentDashboardData — exam visibility (the dashboard "no upcoming exams" bug)', () => {
  it('includes the ClassEnrollment branch, so a class-invite-only student still gets their exams', async () => {
    mockStudent({ teacherIds: [], classIds: [CLASS_A] });
    mockExam.findMany.mockResolvedValue([examRow({ classId: CLASS_A })]);

    const { exams } = await getStudentDashboardData();

    const where = mockExam.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { classId: null, teacherId: { in: [] } },
      { classId: { in: [CLASS_A] } },
    ]);
    // Before the fix this student's query was `teacherId: { in: [] }` with no OR at all,
    // which returns zero rows no matter what exams exist.
    expect(exams).toHaveLength(1);
    expect(exams[0].status).toBe('upcoming');
  });

  it('queries the same class-scoping rule the /student/exams list uses', async () => {
    mockStudent({ teacherIds: [TEACHER], classIds: [CLASS_A] });

    await getStudentDashboardData();

    const where = mockExam.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      institutionId: 'inst-a',
      approvalStatus: 'approved',
      status: { in: ['scheduled', 'live', 'completed'] },
      OR: [
        { classId: null, teacherId: { in: [TEACHER] } },
        { classId: { in: [CLASS_A] } },
      ],
    });
    // The old query filtered on a bare teacherId at the top level, ignoring classId entirely.
    expect(where.teacherId).toBeUndefined();
  });

  it('does not silently return nothing when the student has neither roster relation', async () => {
    mockStudent({ teacherIds: [], classIds: [] });

    const { exams } = await getStudentDashboardData();

    expect(exams).toEqual([]);
    expect(mockExam.findMany.mock.calls[0][0].where.OR).toEqual([
      { classId: null, teacherId: { in: [] } },
      { classId: { in: [] } },
    ]);
  });
});

describe('getStudentDashboardData — "Upcoming Exams" stat card', () => {
  it('counts the exams actually listed as upcoming, not ExamEnrollment rows', async () => {
    mockStudent({ teacherIds: [TEACHER], classIds: [] });
    mockExam.findMany.mockResolvedValue([
      examRow({ id: 'e1', startTime: new Date(Date.now() + 24 * HOUR) }),   // upcoming
      examRow({ id: 'e2', startTime: new Date(Date.now() + 48 * HOUR) }),   // upcoming
      examRow({ id: 'e3', startTime: new Date(Date.now() - 1 * HOUR) }),    // started -> available
      examRow({ id: 'e4', status: 'completed' }),                            // completed
    ]);

    const { stats, exams } = await getStudentDashboardData();

    const upcoming = stats.find(s => s.key === 'upcoming');
    expect(upcoming?.value).toBe(2);
    // The card and the panel underneath it must agree — they are derived from one list now.
    expect(exams.filter(e => e.status === 'upcoming')).toHaveLength(2);
    // The structurally-always-zero ExamEnrollment count is gone entirely.
    expect(mockExamEnrollment.count).not.toHaveBeenCalled();
  });

  it('reports a real count for a class-only student (previously always 0 twice over)', async () => {
    mockStudent({ teacherIds: [], classIds: [CLASS_A] });
    mockExam.findMany.mockResolvedValue([
      examRow({ id: 'e1', classId: CLASS_A }),
      examRow({ id: 'e2', classId: CLASS_A }),
      examRow({ id: 'e3', classId: CLASS_A }),
    ]);

    const { stats } = await getStudentDashboardData();

    expect(stats.find(s => s.key === 'upcoming')?.value).toBe(3);
  });
});
