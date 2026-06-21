// Phase 2: replace each function body with Supabase/Prisma aggregation queries.
import type { StatValue } from '@/types';
import {
  dashboardStats,
  adminStats,
  studentStats,
  analyticsKpis,
  scoreDistribution,
  trustTrend,
  questionDifficultyData,
  recentExamsData,
  recentAlertsData,
  studentExamsData,
} from '@/lib/mock-data/analytics';
import { mockTeachersList, mockPendingExams, mockApprovedExams } from '@/lib/mock-data/admin';

export async function getDashboardStats(): Promise<StatValue[]> {
  // Phase 2: aggregate from exams, enrollments, violations tables
  return dashboardStats;
}

export async function getAnalyticsKpis(): Promise<StatValue[]> {
  // Phase 2: aggregate KPIs per teacher's institutionId
  return analyticsKpis;
}

export async function getScoreDistribution(examId?: string): Promise<{ range: string; count: number }[]> {
  // Phase 2: SELECT score_bucket, COUNT(*) FROM exam_attempts WHERE examId = ? GROUP BY score_bucket
  void examId;
  return scoreDistribution;
}

export async function getTrustTrend(examId?: string): Promise<{ week: string; avgTrust: number }[]> {
  // Phase 2: weekly avg trust_score from exam_attempts grouped by week
  void examId;
  return trustTrend;
}

export async function getQuestionDifficulty(examId?: string): Promise<{ difficulty: string; correct: number; incorrect: number }[]> {
  // Phase 2: join questions + answers; group by difficulty; count correct/incorrect
  void examId;
  return questionDifficultyData;
}

export async function getAdminStats(): Promise<StatValue[]> {
  // Phase 2: platform-wide aggregation using service_role key
  return adminStats;
}

export async function getStudentStats(): Promise<StatValue[]> {
  // Phase 2: fetch from student's exam_attempts + enrollments
  return studentStats;
}

// ── Dashboard display functions ────────────────────────────────────────────────
// Phase 2: replace with SWR hooks or server-component fetches.

export async function getRecentExams() {
  // Phase 2: SELECT id, title, subject as course, status, _count.enrollments FROM exams
  //          WHERE teacherId = session.userId ORDER BY updatedAt DESC LIMIT 5
  return recentExamsData;
}

export async function getRecentAlerts() {
  // Phase 2: SELECT violations JOIN users ON violations.studentId = users.id
  //          ORDER BY timestamp DESC LIMIT 5
  return recentAlertsData;
}

export async function getStudentExams() {
  // Phase 2: SELECT exams JOIN enrollments ON enrollments.examId = exams.id
  //          WHERE enrollments.studentId = session.userId
  return studentExamsData;
}

export async function getTeachersList() {
  // Phase 2: SELECT users JOIN departments WHERE institutionId = session.institutionId
  //          AND role = 'teacher'
  return mockTeachersList;
}

export async function getPendingExams() {
  // Phase 2: SELECT exams WHERE institutionId = session.institutionId AND approvalStatus = 'pending'
  return mockPendingExams;
}

export async function getApprovedExams() {
  // Phase 2: SELECT exams WHERE institutionId = session.institutionId AND approvalStatus = 'approved'
  return mockApprovedExams;
}
