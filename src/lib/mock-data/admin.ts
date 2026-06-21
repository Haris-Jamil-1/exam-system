export type PendingExam = {
  id: string;
  title: string;
  subject: string;
  teacher: string;
  teacherId: string;
  questions: number;
  duration: number;
  students: number;
  submittedAt: string;
  proctoringLevel: 'basic' | 'standard' | 'strict';
};

export const mockPendingExams: PendingExam[] = [
  { id: 'pe-1', title: 'Linear Algebra Midterm', subject: 'Mathematics', teacher: 'Dr. Sarah Mitchell', teacherId: 'teacher-1', questions: 30, duration: 90, students: 45, submittedAt: '2026-06-20T14:00:00Z', proctoringLevel: 'standard' },
  { id: 'pe-2', title: 'Thermodynamics Quiz 2', subject: 'Physics', teacher: 'Prof. James Chen', teacherId: 'teacher-2', questions: 20, duration: 45, students: 32, submittedAt: '2026-06-19T10:00:00Z', proctoringLevel: 'basic' },
  { id: 'pe-3', title: 'Database Systems Final', subject: 'Computer Science', teacher: 'Dr. Amira Hassan', teacherId: 'teacher-3', questions: 40, duration: 120, students: 28, submittedAt: '2026-06-18T09:00:00Z', proctoringLevel: 'strict' },
];

export const mockApprovedExams = [
  { id: 'ae-1', title: 'Data Structures Midterm', subject: 'Computer Science', teacher: 'Dr. Sarah Mitchell', status: 'live' as const, date: '2026-06-21T09:00:00Z', students: 42 },
  { id: 'ae-2', title: 'Algorithms Final', subject: 'Computer Science', teacher: 'Dr. Sarah Mitchell', status: 'scheduled' as const, date: '2026-06-25T10:00:00Z', students: 35 },
  { id: 'ae-3', title: 'Calculus II Final', subject: 'Mathematics', teacher: 'Prof. James Chen', status: 'completed' as const, date: '2026-06-14T09:00:00Z', students: 38 },
  { id: 'ae-4', title: 'Organic Chemistry Midterm', subject: 'Chemistry', teacher: 'Dr. Amira Hassan', status: 'completed' as const, date: '2026-06-10T14:00:00Z', students: 29 },
];

export const mockTeachersList = [
  { id: 't1', name: 'Dr. Sarah Mitchell', email: 's.mitchell@university.edu', department: 'Computer Science', exams: 14, students: 312, status: 'active' as const },
  { id: 't2', name: 'Prof. James Chen', email: 'j.chen@university.edu', department: 'Mathematics', exams: 9, students: 248, status: 'active' as const },
  { id: 't3', name: 'Dr. Amira Hassan', email: 'a.hassan@university.edu', department: 'Physics', exams: 11, students: 190, status: 'active' as const },
  { id: 't4', name: 'Prof. David Kim', email: 'd.kim@university.edu', department: 'Chemistry', exams: 7, students: 421, status: 'active' as const },
  { id: 't5', name: 'Dr. Emily Stone', email: 'e.stone@university.edu', department: 'History', exams: 5, students: 133, status: 'invited' as const },
];
