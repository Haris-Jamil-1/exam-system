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
