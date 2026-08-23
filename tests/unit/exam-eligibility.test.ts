import { describe, it, expect } from 'vitest';
import { isStudentEligibleForExam, studentVisibleExamWhere, filterExamsByTagTargeting } from '@/lib/exam-eligibility';

const INSTITUTION_A = 'inst-a';
const INSTITUTION_B = 'inst-b';
const TEACHER = 'teacher-1';
const CLASS_A = 'class-a';
const CLASS_B = 'class-b';

// Every exam fixture below carries no tag targeting (targetTags: []) unless a test is
// specifically exercising that dimension — isStudentEligibleForExam must reduce to exactly the
// pre-existing class/teacher-only rule when targetTags is empty.
function exam(overrides: Partial<Parameters<typeof isStudentEligibleForExam>[0]> = {}) {
  return { institutionId: INSTITUTION_A, classId: CLASS_A, teacherId: TEACHER, targetTags: [], targetTagsOperator: 'OR' as const, ...overrides };
}
function student(overrides: Partial<Parameters<typeof isStudentEligibleForExam>[1]> = {}) {
  return { institutionId: INSTITUTION_A, teacherIds: [TEACHER], enrolledClassIds: [CLASS_A], tags: [] as string[], ...overrides };
}

describe('isStudentEligibleForExam (Task 5 — exam-to-class scoping)', () => {
  it('a student in Class A cannot see/access an exam assigned only to Class B, even same institution and teacher', () => {
    expect(isStudentEligibleForExam(exam({ classId: CLASS_B }), student())).toBe(false);
  });

  it('a student in Class A CAN see/access an exam assigned to Class A', () => {
    expect(isStudentEligibleForExam(exam({ classId: CLASS_A }), student())).toBe(true);
  });

  it('an unscoped exam (no classId) is visible to any student linked to that teacher — pre-existing behavior preserved', () => {
    expect(isStudentEligibleForExam(exam({ classId: null }), student({ enrolledClassIds: [] }))).toBe(true);
  });

  it('an unscoped exam is NOT visible to a student with no TeacherStudent link to that teacher', () => {
    expect(isStudentEligibleForExam(exam({ classId: null }), student({ teacherIds: ['some-other-teacher'], enrolledClassIds: [] }))).toBe(false);
  });

  it('blocks a student from a different institution regardless of class/teacher match', () => {
    expect(isStudentEligibleForExam(exam({ classId: CLASS_A }), student({ institutionId: INSTITUTION_B }))).toBe(false);
  });

  it('a class-scoped exam does not require a TeacherStudent link — ClassEnrollment alone is sufficient', () => {
    expect(isStudentEligibleForExam(exam({ classId: CLASS_A }), student({ teacherIds: [] }))).toBe(true);
  });
});

describe('isStudentEligibleForExam — Feature 2 tag targeting', () => {
  it('empty targetTags reduces to plain class/teacher eligibility, unaffected by the student\'s own tags', () => {
    expect(isStudentEligibleForExam(exam({ classId: CLASS_B }), student({ tags: ['Postgraduate'] }))).toBe(false);
  });

  it('AND narrows: base-eligible but missing the tag is denied', () => {
    const e = exam({ classId: CLASS_A, targetTags: ['Extra_Time'], targetTagsOperator: 'AND' });
    expect(isStudentEligibleForExam(e, student({ tags: [] }))).toBe(false);
  });

  it('AND narrows: base-eligible AND holding the tag is allowed', () => {
    const e = exam({ classId: CLASS_A, targetTags: ['Extra_Time'], targetTagsOperator: 'AND' });
    expect(isStudentEligibleForExam(e, student({ tags: ['Extra_Time'] }))).toBe(true);
  });

  it('AND narrows: holding the tag alone, without base eligibility, is still denied', () => {
    const e = exam({ classId: CLASS_B, targetTags: ['Extra_Time'], targetTagsOperator: 'AND' });
    expect(isStudentEligibleForExam(e, student({ tags: ['Extra_Time'] }))).toBe(false);
  });

  it('OR widens: the tag alone grants access even outside class/teacher scope', () => {
    const e = exam({ classId: CLASS_B, targetTags: ['Extra_Time'], targetTagsOperator: 'OR' });
    expect(isStudentEligibleForExam(e, student({ tags: ['Extra_Time'] }))).toBe(true);
  });

  it('OR widens: base eligibility alone (no matching tag) is still sufficient', () => {
    const e = exam({ classId: CLASS_A, targetTags: ['Extra_Time'], targetTagsOperator: 'OR' });
    expect(isStudentEligibleForExam(e, student({ tags: [] }))).toBe(true);
  });

  it('OR/AND: any one matching tag out of several is enough, not all of them', () => {
    const e = exam({ classId: CLASS_B, targetTags: ['Extra_Time', 'Scholarship'], targetTagsOperator: 'OR' });
    expect(isStudentEligibleForExam(e, student({ tags: ['Scholarship'] }))).toBe(true);
  });

  it('cross-institution is still a hard deny even with a matching OR tag', () => {
    const e = exam({ classId: CLASS_A, targetTags: ['Extra_Time'], targetTagsOperator: 'OR' });
    expect(isStudentEligibleForExam(e, student({ institutionId: INSTITUTION_B, tags: ['Extra_Time'] }))).toBe(false);
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
      tags: [],
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
      tags: [],
    });
    expect(where.institutionId).toBe(INSTITUTION_A);
    expect(where.approvalStatus).toBe('approved');
    expect(where.status.in).toEqual(['scheduled', 'live', 'completed']);
    expect(where.status.in).not.toContain('draft');
  });

  it('adds a third OR branch for tag-widening only when the student actually has tags', () => {
    const withoutTags = studentVisibleExamWhere({ institutionId: INSTITUTION_A, teacherIds: [], enrolledClassIds: [], tags: [] });
    expect(withoutTags.OR).toHaveLength(2);

    const withTags = studentVisibleExamWhere({ institutionId: INSTITUTION_A, teacherIds: [], enrolledClassIds: [], tags: ['Extra_Time'] });
    expect(withTags.OR).toHaveLength(3);
    expect(withTags.OR).toContainEqual({ targetTags: { hasSome: ['Extra_Time'] }, targetTagsOperator: 'OR' });
  });

  it('agrees with isStudentEligibleForExam on every exam shape (predicate ⇄ query parity), ignoring tag targeting', () => {
    const s = { institutionId: INSTITUTION_A, teacherIds: [TEACHER], enrolledClassIds: [CLASS_A], tags: [] as string[] };
    const where = studentVisibleExamWhere(s);

    // A hand-run of the OR fragment against candidate exams, mirroring what Postgres would do.
    const matchesWhere = (e: { institutionId: string; classId: string | null; teacherId: string }) =>
      e.institutionId === where.institutionId &&
      where.OR.some(branch =>
        'teacherId' in branch
          ? e.classId === null && branch.teacherId.in.includes(e.teacherId)
          : 'classId' in branch && e.classId !== null && branch.classId.in.includes(e.classId),
      );

    const candidates = [
      { institutionId: INSTITUTION_A, classId: null, teacherId: TEACHER },
      { institutionId: INSTITUTION_A, classId: null, teacherId: 'other-teacher' },
      { institutionId: INSTITUTION_A, classId: CLASS_A, teacherId: TEACHER },
      { institutionId: INSTITUTION_A, classId: CLASS_B, teacherId: TEACHER },
      { institutionId: INSTITUTION_A, classId: CLASS_A, teacherId: 'other-teacher' },
      { institutionId: INSTITUTION_B, classId: CLASS_A, teacherId: TEACHER },
    ];

    for (const c of candidates) {
      expect(matchesWhere(c)).toBe(isStudentEligibleForExam({ ...c, targetTags: [], targetTagsOperator: 'OR' }, s));
    }
  });
});

describe('filterExamsByTagTargeting — the AND-narrowing half the WHERE clause cannot express', () => {
  it('passes through every exam with no tag targeting configured', () => {
    const exams = [{ id: '1', targetTags: [] as string[], targetTagsOperator: 'AND' as const }];
    expect(filterExamsByTagTargeting(exams, [])).toEqual(exams);
  });

  it('passes through every OR-targeted exam untouched — the WHERE already handled OR-widening', () => {
    const exams = [{ id: '1', targetTags: ['Extra_Time'], targetTagsOperator: 'OR' as const }];
    expect(filterExamsByTagTargeting(exams, [])).toEqual(exams);
  });

  it('drops an AND-targeted exam when the student lacks every one of its tags', () => {
    const exams = [{ id: '1', targetTags: ['Extra_Time'], targetTagsOperator: 'AND' as const }];
    expect(filterExamsByTagTargeting(exams, [])).toEqual([]);
  });

  it('keeps an AND-targeted exam when the student holds at least one of its tags', () => {
    const exams = [{ id: '1', targetTags: ['Extra_Time', 'Scholarship'], targetTagsOperator: 'AND' as const }];
    expect(filterExamsByTagTargeting(exams, ['Scholarship'])).toEqual(exams);
  });
});
