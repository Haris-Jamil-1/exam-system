import { describe, it, expect } from 'vitest';
import { isStudentEligibleForExam, studentVisibleExamWhere } from '@/lib/exam-eligibility';

const INSTITUTION_A = 'inst-a';
const INSTITUTION_B = 'inst-b';
const TEACHER = 'teacher-1';
const CLASS_A = 'class-a';
const CLASS_B = 'class-b';

describe('isStudentEligibleForExam (Task 5 — exam-to-class scoping)', () => {
  it('a student in Class A cannot see/access an exam assigned only to Class B, even same institution and teacher', () => {
    const exam = { institutionId: INSTITUTION_A, classId: CLASS_B, teacherId: TEACHER };
    const student = { institutionId: INSTITUTION_A, teacherIds: [TEACHER], enrolledClassIds: [CLASS_A] };
    expect(isStudentEligibleForExam(exam, student)).toBe(false);
  });

  it('a student in Class A CAN see/access an exam assigned to Class A', () => {
    const exam = { institutionId: INSTITUTION_A, classId: CLASS_A, teacherId: TEACHER };
    const student = { institutionId: INSTITUTION_A, teacherIds: [TEACHER], enrolledClassIds: [CLASS_A] };
    expect(isStudentEligibleForExam(exam, student)).toBe(true);
  });

  it('an unscoped exam (no classId) is visible to any student linked to that teacher — pre-existing behavior preserved', () => {
    const exam = { institutionId: INSTITUTION_A, classId: null, teacherId: TEACHER };
    const student = { institutionId: INSTITUTION_A, teacherIds: [TEACHER], enrolledClassIds: [] };
    expect(isStudentEligibleForExam(exam, student)).toBe(true);
  });

  it('an unscoped exam is NOT visible to a student with no TeacherStudent link to that teacher', () => {
    const exam = { institutionId: INSTITUTION_A, classId: null, teacherId: TEACHER };
    const student = { institutionId: INSTITUTION_A, teacherIds: ['some-other-teacher'], enrolledClassIds: [] };
    expect(isStudentEligibleForExam(exam, student)).toBe(false);
  });

  it('blocks a student from a different institution regardless of class/teacher match', () => {
    const exam = { institutionId: INSTITUTION_A, classId: CLASS_A, teacherId: TEACHER };
    const student = { institutionId: INSTITUTION_B, teacherIds: [TEACHER], enrolledClassIds: [CLASS_A] };
    expect(isStudentEligibleForExam(exam, student)).toBe(false);
  });

  it('a class-scoped exam does not require a TeacherStudent link — ClassEnrollment alone is sufficient', () => {
    const exam = { institutionId: INSTITUTION_A, classId: CLASS_A, teacherId: TEACHER };
    const student = { institutionId: INSTITUTION_A, teacherIds: [], enrolledClassIds: [CLASS_A] };
    expect(isStudentEligibleForExam(exam, student)).toBe(true);
  });
});

// Regression guard for the student-dashboard "Upcoming Exams is always empty" bug: the WHERE
// fragment must express the same rule as the predicate above, so the dashboard and the
// /student/exams list can never diverge again.
describe('studentVisibleExamWhere — the query-side twin of isStudentEligibleForExam', () => {
  it('always includes a ClassEnrollment branch, so a class-only student is not filtered to nothing', () => {
    const where = studentVisibleExamWhere({
      institutionId: INSTITUTION_A,
      teacherIds: [], // class-invite student: ClassEnrollment row only, no TeacherStudent row
      enrolledClassIds: [CLASS_A],
    });

    expect(where.OR).toEqual([
      { classId: null, teacherId: { in: [] } },
      { classId: { in: [CLASS_A] } },
    ]);
    // The exact shape of the old bug: an OR collapsed to teacherId-only would make this
    // student match nothing at all, since Prisma treats { in: [] } as matching no row.
    expect(where.OR.some(branch => 'classId' in branch && typeof branch.classId === 'object')).toBe(true);
  });

  it('scopes to the student\'s own institution and only approved, non-draft exams', () => {
    const where = studentVisibleExamWhere({
      institutionId: INSTITUTION_A,
      teacherIds: [TEACHER],
      enrolledClassIds: [],
    });
    expect(where.institutionId).toBe(INSTITUTION_A);
    expect(where.approvalStatus).toBe('approved');
    expect(where.status.in).toEqual(['scheduled', 'live', 'completed']);
    expect(where.status.in).not.toContain('draft');
  });

  it('agrees with isStudentEligibleForExam on every exam shape (predicate ⇄ query parity)', () => {
    const student = { institutionId: INSTITUTION_A, teacherIds: [TEACHER], enrolledClassIds: [CLASS_A] };
    const where = studentVisibleExamWhere(student);

    // A hand-run of the OR fragment against candidate exams, mirroring what Postgres would do.
    const matchesWhere = (exam: { institutionId: string; classId: string | null; teacherId: string }) =>
      exam.institutionId === where.institutionId &&
      where.OR.some(branch =>
        'teacherId' in branch
          ? exam.classId === null && branch.teacherId.in.includes(exam.teacherId)
          : exam.classId !== null && branch.classId.in.includes(exam.classId),
      );

    const candidates = [
      { institutionId: INSTITUTION_A, classId: null, teacherId: TEACHER },
      { institutionId: INSTITUTION_A, classId: null, teacherId: 'other-teacher' },
      { institutionId: INSTITUTION_A, classId: CLASS_A, teacherId: TEACHER },
      { institutionId: INSTITUTION_A, classId: CLASS_B, teacherId: TEACHER },
      { institutionId: INSTITUTION_A, classId: CLASS_A, teacherId: 'other-teacher' },
      { institutionId: INSTITUTION_B, classId: CLASS_A, teacherId: TEACHER },
    ];

    for (const exam of candidates) {
      expect(matchesWhere(exam)).toBe(isStudentEligibleForExam(exam, student));
    }
  });
});
