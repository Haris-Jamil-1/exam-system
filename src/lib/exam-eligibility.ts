// Pure eligibility predicate for "can this student see/take this exam" — the single source of
// truth for the rule getStudentExams' Prisma query filters by, expressed here so the exact same
// rule can gate POST /api/attempts (attempt creation) without duplicating the logic by hand.
// Before this existed, attempt creation had NO eligibility check at all — not even institution
// matching — so a student who merely knew/guessed an examId could start an attempt on any exam
// regardless of class, teacher, or even institution.
export type ExamEligibilityInput = {
  institutionId: string;
  // null = not scoped to a class (pre-existing "visible to any of my teachers" behavior).
  classId: string | null;
  teacherId: string;
  // Feature 2: profile-tag targeting. Empty targetTags = no tag restriction at all (the two
  // fields below are simply ignored) — fully backward compatible with every exam created before
  // this existed.
  targetTags: string[];
  targetTagsOperator: 'AND' | 'OR';
};

export type StudentEligibilityInput = {
  institutionId: string;
  // TeacherStudent-linked teacher ids (the older, non-class direct-invite roster).
  teacherIds: string[];
  // ClassEnrollment-linked class ids.
  enrolledClassIds: string[];
  // Feature 2: the student's own profile tags.
  tags: string[];
};

// Class/teacher-only eligibility — the rule as it existed before tag targeting. Kept as its own
// function since it's exactly what tag targeting composes with, not replaced by it.
function isBaseEligible(exam: Pick<ExamEligibilityInput, 'classId' | 'teacherId'>, student: Pick<StudentEligibilityInput, 'teacherIds' | 'enrolledClassIds'>): boolean {
  if (exam.classId) return student.enrolledClassIds.includes(exam.classId);
  return student.teacherIds.includes(exam.teacherId);
}

export function isStudentEligibleForExam(exam: ExamEligibilityInput, student: StudentEligibilityInput): boolean {
  if (exam.institutionId !== student.institutionId) return false;
  const baseEligible = isBaseEligible(exam, student);

  if (exam.targetTags.length === 0) return baseEligible; // no tag targeting configured

  const hasTag = exam.targetTags.some(t => student.tags.includes(t));
  // AND narrows the base eligibility (e.g. "Section 101 students who are ALSO tagged
  // Special Accommodations"); OR widens it (tag alone can qualify, institution-wide, even for a
  // student outside the class/teacher scope — "anyone in the Group OR anyone globally
  // possessing that profile tag").
  return exam.targetTagsOperator === 'AND' ? (baseEligible && hasTag) : (baseEligible || hasTag);
}

// The Prisma WHERE fragment equivalent of isStudentEligibleForExam, so every read path that
// lists "the exams this student can see" filters by one rule instead of hand-rolling its own.
//
// This exists because they DID drift: getStudentExams (the /student/exams page) matched
// `{classId: null, teacherId in myTeachers} OR {classId in myClasses}`, while
// getStudentDashboardData (the /student dashboard) filtered on `teacherId in myTeachers` alone
// with no ClassEnrollment branch at all. A student who joined through the per-class invite flow
// has a ClassEnrollment row but NO TeacherStudent row, so their teacherIds list was empty,
// Prisma's `{ in: [] }` matched nothing, and the dashboard's "Upcoming Exams" panel was empty
// for them permanently — while the very same exams listed correctly one click away under
// "All exams". The same divergence also leaked class-scoped exams to every one of the teacher's
// students on the dashboard, since it never checked classId at all.
//
// Returns only the visibility predicate — callers add their own ordering/includes. Tag
// AND-narrowing can't be expressed as a Prisma array-subset WHERE clause (Postgres array
// operators check overlap/superset, not "is this array a subset of that one"), so an
// AND-targeted exam still needs isStudentEligibleForExam applied as a post-query filter — see
// filterExamsByTagTargeting below, which every caller of this WHERE MUST also apply for tag
// targeting to be correctly enforced (OR-widening is baked into the WHERE itself; AND-narrowing
// is not, since it only narrows results the WHERE already returned via the base branches).
export type StudentVisibleExamWhere = {
  institutionId: string;
  approvalStatus: 'approved';
  status: { in: Array<'scheduled' | 'live' | 'completed'> };
  OR: Array<
    | { classId: null; teacherId: { in: string[] } }
    | { classId: { in: string[] } }
    | { targetTags: { hasSome: string[] }; targetTagsOperator: 'OR' }
  >;
};

export function studentVisibleExamWhere(student: StudentEligibilityInput): StudentVisibleExamWhere {
  const or: StudentVisibleExamWhere['OR'] = [
    // A class-scoped exam (classId set) is visible only to that class's own enrolled students —
    // not to every student of the teacher who created it. An unscoped exam (classId null) keeps
    // the pre-existing "any of my teachers" behavior, since making class scoping mandatory would
    // silently hide every pre-existing exam and every exam from a teacher who hasn't adopted
    // Classes yet.
    { classId: null, teacherId: { in: student.teacherIds } },
    { classId: { in: student.enrolledClassIds } },
  ];
  // OR-tag widening: an exam whose own targetTagsOperator is 'OR' is visible to any tag-matching
  // student institution-wide, even outside the base class/teacher branches above — matches
  // isStudentEligibleForExam's OR semantics. AND-targeted exams are deliberately NOT added here:
  // AND only narrows the base branches, it never grants visibility beyond them, so widening the
  // WHERE for AND exams would incorrectly show them to tag-matching students who aren't actually
  // eligible (the post-query filterExamsByTagTargeting call handles AND-narrowing instead).
  if (student.tags.length > 0) {
    or.push({ targetTags: { hasSome: student.tags }, targetTagsOperator: 'OR' });
  }
  return {
    institutionId: student.institutionId,
    approvalStatus: 'approved',
    // A draft or not-yet-approved exam is never visible to a student; 'completed' stays visible
    // so a finished exam still shows in their history.
    status: { in: ['scheduled', 'live', 'completed'] },
    OR: or,
  };
}

// Applies the AND-narrowing half of tag targeting to a list of exams already fetched via
// studentVisibleExamWhere (see that function's doc comment for why the WHERE alone isn't
// sufficient). Every exam in `exams` is guaranteed to already satisfy the base class/teacher
// branches OR the OR-tag branch — this only ever removes AND-targeted exams whose tag
// requirement isn't met; it never adds anything back.
export function filterExamsByTagTargeting<T extends { targetTags: string[]; targetTagsOperator: 'AND' | 'OR' }>(
  exams: T[],
  studentTags: string[],
): T[] {
  return exams.filter(exam => {
    if (exam.targetTags.length === 0 || exam.targetTagsOperator === 'OR') return true;
    return exam.targetTags.some(t => studentTags.includes(t));
  });
}
