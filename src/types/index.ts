export type Role = 'admin' | 'teacher' | 'student';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  institutionId: string;
  avatarUrl?: string;
}

export interface Institution {
  id: string;
  name: string;
  domain: string;
  joinCode: string;
  createdAt: string;
}

export type ExamStatus = 'draft' | 'scheduled' | 'live' | 'completed';

export interface ExamSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResultsAfter: boolean;
  allowedViolations: number;
  proctoringLevel: 'basic' | 'standard' | 'strict';
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  status: ExamStatus;
  startTime: string;
  endTime: string;
  institutionId: string;
  teacherId: string;
  maxViolations: number;
  settings: ExamSettings;
  createdAt: string;
  _count?: {
    questions: number;
    enrollments: number;
  };
}

export type QuestionType =
  | 'mcq'
  | 'mrq'
  | 'true_false'
  | 'short_answer'
  | 'essay'
  | 'fill_blank'
  | 'matching'
  | 'ordering';

export interface Option {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  examId: string;
  type: QuestionType;
  stem: string;
  options?: Option[];
  correctAnswer?: string | string[];
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard';
  order: number;
  explanation?: string;
}

export type ItemStatus = 'draft' | 'review' | 'approved';

export interface Item {
  id: string;
  examId?: string;
  type: QuestionType;
  stem: string;
  options?: Option[];
  correctAnswer?: string | string[];
  marks: number;
  difficulty: 'easy' | 'medium' | 'hard';
  order: number;
  explanation?: string;
  status: ItemStatus;
  usageCount: number;
  tags: string[];
  createdAt: string;
  authorId: string;
}

export type AttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted';

export interface ExamAttempt {
  id: string;
  examId: string;
  studentId: string;
  status: AttemptStatus;
  startedAt: string;
  submittedAt?: string;
  score?: number;
  trustScore: number;
  violationCount: number;
}

export interface Answer {
  id: string;
  attemptId: string;
  questionId: string;
  response: string | string[];
  isCorrect?: boolean;
  marksAwarded?: number;
}

export type ViolationType =
  | 'tab_switch'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'no_face'
  | 'multiple_faces'
  | 'audio_detected'
  | 'phone_detected';

export interface Violation {
  id: string;
  attemptId: string;
  studentId: string;
  examId: string;
  type: ViolationType;
  severity: 'low' | 'medium' | 'high';
  timestamp: string;
  description: string;
  screenshotUrl?: string;
}

export interface MonitorStudent {
  id: string;
  name: string;
  avatarUrl?: string;
  status: 'active' | 'warning' | 'flagged' | 'submitted';
  violationCount: number;
  trustScore: number;
  lastSeen: string;
}

export interface StatValue {
  key?: string;       // machine key for STAT_META lookup (new dashboard pattern)
  value: string | number;
  delta?: string;     // display delta string e.g. "+3 this week"
  label?: string;     // legacy label field
  change?: number;
  trend?: 'up' | 'down';
}

export interface GeneratedQuestion {
  stem: string;
  type: QuestionType;
  options?: string[];
  correctAnswer: string | string[];
  difficulty: 'easy' | 'medium' | 'hard';
  explanation?: string;
  marks: number;
}

// Safe question type sent to students during exams — no answer keys
export type PublicOption = Omit<Option, 'isCorrect'>;

export type PublicQuestion = Omit<Question, 'correctAnswer' | 'explanation' | 'options'> & {
  options?: PublicOption[];
};

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  institutionId: string;
  token: string;
  expiresAt: string;
  invitedBy: string;
  acceptedAt?: string;
}
