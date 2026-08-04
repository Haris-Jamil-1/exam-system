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
};

export type StudentEligibilityInput = {
  institutionId: string;
  // TeacherStudent-linked teacher ids (the older, non-class direct-invite roster).
  teacherIds: string[];
  // ClassEnrollment-linked class ids.
  enrolledClassIds: string[];
};

export function isStudentEligibleForExam(exam: ExamEligibilityInput, student: StudentEligibilityInput): boolean {
  if (exam.institutionId !== student.institutionId) return false;
  if (exam.classId) return student.enrolledClassIds.includes(exam.classId);
  return student.teacherIds.includes(exam.teacherId);
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
// Returns only the visibility predicate — callers add their own ordering/includes.
export type StudentVisibleExamWhere = {
  institutionId: string;
  approvalStatus: 'approved';
  status: { in: Array<'scheduled' | 'live' | 'completed'> };
  OR: Array<{ classId: null; teacherId: { in: string[] } } | { classId: { in: string[] } }>;
};

export function studentVisibleExamWhere(student: StudentEligibilityInput): StudentVisibleExamWhere {
  return {
    institutionId: student.institutionId,
    approvalStatus: 'approved',
    // A draft or not-yet-approved exam is never visible to a student; 'completed' stays visible
    // so a finished exam still shows in their history.
    status: { in: ['scheduled', 'live', 'completed'] },
    // A class-scoped exam (classId set) is visible only to that class's own enrolled students —
    // not to every student of the teacher who created it. An unscoped exam (classId null) keeps
    // the pre-existing "any of my teachers" behavior, since making class scoping mandatory would
    // silently hide every pre-existing exam and every exam from a teacher who hasn't adopted
    // Classes yet.
    OR: [
      { classId: null, teacherId: { in: student.teacherIds } },
      { classId: { in: student.enrolledClassIds } },
    ],
  };
}
