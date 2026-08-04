'use server';
/**
 * Page-level combined fetchers — one server action per page.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * These pages are `'use client'` and fetch through `'use server'` functions from
 * a `useEffect`. A Server Action invoked from the client is an HTTP POST back to
 * the page's own route, and **React queues those POSTs one at a time**: wrapping
 * four of them in `Promise.all` does not parallelise anything, it just enqueues
 * four sequential round trips. Measured against a production build with the real
 * database, `/teacher/analytics`' four-call `Promise.all` produced four strictly
 * non-overlapping requests (each starting the millisecond the previous finished)
 * for ~4.2s of the page's ~5.9s load.
 *
 * Each round trip also re-pays the whole per-request stack — middleware auth, the
 * action's own session resolution, the Prisma user lookup — none of which can be
 * shared across separate requests no matter how well each one is memoised.
 *
 * So the fix is structural: one page fetches once. This extends the pattern the
 * repo already established with `getTeacherDashboardData` / `getStudentDashboardData`
 * / `getAdminDashboardData` in `analytics.ts` ("replacing N separate server-action
 * round-trips") to every remaining multi-call page. Inside a single action the
 * queries genuinely do run in parallel, and `lib/session.ts`'s `cache()` means the
 * identity is resolved exactly once for the whole batch.
 */
import {
  getAnalyticsKpis, getScoreDistribution, getTrustTrend, getQuestionDifficulty,
  getAdminStats, getTeachersList, getPendingExams, getApprovedExams,
} from './analytics';
import { getAllUsers, getMyInstitution } from './users';
import { getExams, getExamById } from './exams';
import { getItems } from './items';
import { getInstitutionBanks, getMyPrivateBanks, getSharedWithMeBanks, getItemBankById } from './item-banks';
import { getQuestions } from './questions';
import { getSections } from './sections';
import { getStudentResults, getMonitorStudents } from './students';
import { getMonitorFeed } from './violations';
import { getClassById, getEnrollments, getClassInvites } from './classes';

// ── Teacher ───────────────────────────────────────────────────────────────────

export async function getTeacherAnalyticsData() {
  const [kpis, scoreDistribution, trustTrend, questionDifficulty] = await Promise.all([
    getAnalyticsKpis(),
    getScoreDistribution(),
    getTrustTrend(),
    getQuestionDifficulty(),
  ]);
  return { kpis, scoreDistribution, trustTrend, questionDifficulty };
}

export async function getExamEditPageData(examId: string) {
  const [exam, questions, sections] = await Promise.all([
    getExamById(examId),
    getQuestions(examId),
    getSections(examId),
  ]);
  return { exam: exam ?? null, questions, sections };
}

export async function getExamResultsPageData(examId: string) {
  const [exam, results, scoreDistribution, questionDifficulty] = await Promise.all([
    getExamById(examId),
    getStudentResults(examId),
    getScoreDistribution(examId),
    getQuestionDifficulty(examId),
  ]);
  return { exam: exam ?? null, results, scoreDistribution, questionDifficulty };
}

export async function getMonitorPageData(examId: string) {
  const [students, feed] = await Promise.all([
    getMonitorStudents(examId),
    getMonitorFeed(examId),
  ]);
  return { students, feed };
}

/** Class detail — was three sequential `.then()` chains. */
export async function getClassPageData(classId: string) {
  const [cls, enrollments, invites] = await Promise.all([
    getClassById(classId),
    getEnrollments(classId),
    getClassInvites(classId),
  ]);
  return { cls: cls ?? null, enrollments, invites };
}

/** The three-tab bank dashboard — was three sequential `.then()` chains. */
export async function getItemBanksPageData() {
  const [institutionBanks, privateBanks, sharedBanks] = await Promise.all([
    getInstitutionBanks(),
    getMyPrivateBanks(),
    getSharedWithMeBanks(),
  ]);
  return { institutionBanks, privateBanks, sharedBanks };
}

export async function getItemBankPageData(bankId: string) {
  const [bank, items] = await Promise.all([getItemBankById(bankId), getItems({ bankId })]);
  return { bank: bank ?? null, items };
}

// ── Admin ─────────────────────────────────────────────────────────────────────

/**
 * Sidebar badge counts for the admin shell. This runs on EVERY admin page, so it
 * was previously adding two serialized server-action round trips to all of them.
 * Counts only — the pages themselves already fetch the rows they render.
 */
export async function getAdminNavCounts() {
  const [reviewItems, pendingExams] = await Promise.all([
    getItems({ status: 'review' }),
    getPendingExams(),
  ]);
  return { itemsPending: reviewItems.length, examsPending: pendingExams.length };
}

export async function getAdminAnalyticsData() {
  const [stats, teachers] = await Promise.all([getAdminStats(), getTeachersList()]);
  return { stats, teachers };
}

export async function getAdminExamsPageData() {
  const [pendingExams, approvedExams] = await Promise.all([getPendingExams(), getApprovedExams()]);
  return { pendingExams, approvedExams };
}

export async function getAdminTeachersPageData() {
  const [teachers, institution] = await Promise.all([getTeachersList(), getMyInstitution()]);
  return { teachers, institution };
}

export async function getAdminUsersPageData() {
  const [users, institution] = await Promise.all([getAllUsers(), getMyInstitution()]);
  return { users, institution };
}

export async function getAdminInstitutionsPageData() {
  const [users, exams, institution] = await Promise.all([getAllUsers(), getExams(), getMyInstitution()]);
  return { users, exams, institution };
}

export async function getAdminItemsPageData() {
  const [items, teachers] = await Promise.all([getItems(), getTeachersList()]);
  return { items, teachers };
}
