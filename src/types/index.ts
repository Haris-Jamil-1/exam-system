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
  // Phase 2: persisted in exam_settings table, enforced server-side
  navigationMode?: 'free' | 'sequential';
  forwardOnly?: boolean;
  autoAdvance?: boolean;
  allowPause?: boolean;
  resultsVisibility?: 'instant' | 'held';
  // Stratified dynamic pooling: at attempt creation, draw dynamicPoolingBlueprint[cloId] items
  // per CLO (randomly, from dynamicPoolingBankIds only), materialized as private per-attempt
  // Question rows. Absent/empty blueprint = normal fixed exam-wide question set (unchanged).
  dynamicPoolingBankIds?: string[];
  dynamicPoolingBlueprint?: Record<string, number>;
  // Multi-section exams only (Exam.sections.length > 0):
  // locks a section from further access once the student submits it
  isSectionSequential?: boolean;
  // locks a question within the active section once the student answers it (auto-advances,
  // hides Previous) — independent of isSectionSequential
  isItemSequential?: boolean;
  // Phase 2: CAT engine — adjusts next question difficulty based on attempt.lastResponseCorrect
  adaptiveTesting?: boolean;
}

export type ApprovalStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';

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

export interface Exam {
  id: string;
  title: string;
  subject: string;
  duration: number;
  totalMarks: number;
  passingMarks: number;
  status: ExamStatus;
  approvalStatus?: ApprovalStatus;
  startTime: string;
  endTime: string;
  institutionId: string;
  teacherId: string;
  maxViolations: number;
  settings: ExamSettings;
  createdAt: string;
  resultsPublishedAt?: string | null;
  instructions?: string;
  isProctoringEnabled: boolean;
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
  | 'ordering'
  | 'coding'
  | 'file_upload';

export interface Option {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface TestCase {
  input: string;
  expectedOutput: string;
  isHidden?: boolean;
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
  // Phase 2: FK → learning_objectives.id; JOIN replaces storing bloomsLevel/domain strings
  learningObjectiveId?: string;
  required?: boolean;
  // coding type
  codeLanguage?: string;
  starterCode?: string;
  testCases?: TestCase[];
  // file_upload type
  allowedFileTypes?: string[];
  maxFileSizeMB?: number;
  // Optional per-question countdown; on expiry, response auto-saves and the student auto-advances
  timeLimitSeconds?: number;
  // Set only for a stratified-pooled question drawn privately for one attempt; undefined for
  // the normal fixed/shared question every student of a non-pooled exam sees identically.
  attemptId?: string;
  // Set only when the exam uses multi-section architecture; undefined for a normal flat exam.
  sectionId?: string;
}

export interface ExamSection {
  id: string;
  examId: string;
  title: string;
  instructions?: string;
  durationMinutes?: number;
  orderIndex: number;
  sectionWeight: number;
  passingThreshold?: number;
  createdAt: string;
  questionCount?: number;
}

export type SectionAttemptStatus = AttemptStatus;

export interface SectionAttempt {
  id: string;
  attemptId: string;
  sectionId: string;
  status: SectionAttemptStatus;
  startedAt?: string;
  submittedAt?: string;
  score?: number;
  totalMarks?: number;
  scorePercentage?: number;
  passed?: boolean;
}

export type ItemStatus = 'draft' | 'review' | 'approved' | 'archived';

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
  // Phase 2: FK → learning_objectives.id (replaces free-text topic/bloom fields)
  learningObjectiveId?: string;
  required?: boolean;
  // coding type
  codeLanguage?: string;
  starterCode?: string;
  testCases?: TestCase[];
  // file_upload type
  allowedFileTypes?: string[];
  maxFileSizeMB?: number;
  timeLimitSeconds?: number;
  // Phase 2: computed from exam_answers aggregate — facility_index = correct_count / attempt_count
  facilityIndex?: number;
  // Phase 2: point-biserial correlation between item score and total score
  discriminationIndex?: number;
  // Phase 2: version control — archived original when approved item is edited
  version?: number;
  previousVersionId?: string;
  bankId?: string;
}

export type ItemBankLevel = 'institutional' | 'personal';
export type ItemBankPermissionRole = 'owner' | 'editor' | 'viewer';

export interface ItemBank {
  id: string;
  name: string;
  description?: string;
  bankLevel: ItemBankLevel;
  ownerId: string;
  institutionId: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  // The caller's own permission on this bank — resolved server-side, never trust a client value.
  myRole?: ItemBankPermissionRole;
}

export interface ItemBankCollaborator {
  id: string;
  bankId: string;
  userId: string;
  userName: string;
  userEmail: string;
  permissionRole: ItemBankPermissionRole;
  assignedById: string;
  createdAt: string;
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
  /**
   * Matching questions only. Shuffled right-column labels sent to the student.
   * The correct pairing (which right label belongs to which left option) is
   * NOT included — that stays on the server in `correctAnswer`.
   */
  matchingChoices?: string[];
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

// ── Curriculum Hierarchy ──────────────────────────────────────────────────────
// Phase 2: 3 Prisma models — Course, Topic, LearningObjective
// Questions link via learning_objective_id FK (not string tags)
// Bloom's Level and Learning Domain are inherited from the CLO — never stored on questions

export type LearningDomain = 'Knowledge' | 'Skill' | 'Values';

export type BloomsLevel =
  | 'Remember'
  | 'Understand'
  | 'Apply'
  | 'Analyze'
  | 'Evaluate'
  | 'Create';

export interface Course {
  id: string;
  code: string;           // e.g. CS101
  title: string;          // e.g. Introduction to Computer Science
  institutionId: string;
  createdAt: string;
}

export interface Topic {
  id: string;
  courseId: string;       // FK → courses.id
  title: string;          // e.g. Chapter 3: Asymmetric Cryptography
  order: number;
  createdAt: string;
}

export interface LearningObjective {
  id: string;
  topicId: string;        // FK → topics.id
  code?: string;          // e.g. CS101-3-CLO2 (for accreditation reports)
  text: string;           // e.g. Students will be able to generate public and private keys
  bloomsLevel: BloomsLevel;
  learningDomain: LearningDomain;
  createdAt: string;
}
