import { describe, it, expect } from 'vitest';
import { isStudentEligibleForExam } from '@/lib/exam-eligibility';

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
