'use server';
import { prisma } from '@/lib/prisma';
import { getSessionUser, getSessionContext } from '@/lib/session';
import {
  resolveCoursePermission, canReadCourse, canEditCourse, canManageCourse, type CallerContext,
} from '@/lib/curriculum-permissions';
import type {
  Course, Topic, LearningObjective, CourseLevel, CoursePermissionRole, CourseCollaborator,
  BloomsLevel, LearningDomain,
} from '@/types';

async function getCaller(): Promise<CallerContext | null> {
  const row = await getSessionUser();
  if (!row) return null;
  return { id: row.id, institutionId: row.institutionId, role: row.role as CallerContext['role'] };
}

type PrismaCourseRow = {
  id: string; code: string; title: string; institutionId: string;
  courseLevel: string; ownerId: string | null; createdAt: Date;
};

function mapCourse(c: PrismaCourseRow, myRole?: CoursePermissionRole | null): Course {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    institutionId: c.institutionId,
    courseLevel: c.courseLevel as CourseLevel,
    ownerId: c.ownerId ?? c.institutionId,
    createdAt: c.createdAt.toISOString(),
    myRole: myRole ?? undefined,
  };
}

function mapTopic(t: { id: string; courseId: string; title: string; order: number; createdAt: Date }): Topic {
  return { id: t.id, courseId: t.courseId, title: t.title, order: t.order, createdAt: t.createdAt.toISOString() };
}

function mapCLO(c: {
  id: string; topicId: string; code: string | null; text: string;
  bloomsLevel: string; learningDomain: string; createdAt: Date;
}): LearningObjective {
  return {
    id: c.id, topicId: c.topicId, code: c.code ?? undefined, text: c.text,
    bloomsLevel: c.bloomsLevel as LearningObjective['bloomsLevel'],
    learningDomain: c.learningDomain as LearningObjective['learningDomain'],
    createdAt: c.createdAt.toISOString(),
  };
}

const COURSE_SELECT = { id: true, code: true, title: true, institutionId: true, courseLevel: true, ownerId: true, createdAt: true } as const;

async function getCoursePermission(courseId: string, caller: CallerContext): Promise<{
  course: PrismaCourseRow;
  role: CoursePermissionRole | null;
} | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: COURSE_SELECT });
  if (!course) return null;
  const access = course.institutionId === caller.institutionId
    ? await prisma.courseAccess.findUnique({
        where: { courseId_userId: { courseId, userId: caller.id } },
        select: { permissionRole: true },
      })
    : null;
  const role = resolveCoursePermission(course, caller, (access?.permissionRole as CoursePermissionRole | undefined) ?? null);
  return { course, role };
}

// ── Courses ──────────────────────────────────────────────────────────────────

/** Every course the caller can at least read — used by CurriculumPicker and other cross-course
 * CLO selectors, which need "every course this teacher could reference" without the 3-tab
 * dashboard's distinction. Mirrors getMyClasses' equivalent union shape. */
export async function getCourses(): Promise<Course[]> {
  const caller = await getCaller();
  if (!caller) return [];

  if (caller.role === 'admin') {
    const rows = await prisma.course.findMany({ where: { institutionId: caller.institutionId }, orderBy: { createdAt: 'asc' } });
    return rows.map(r => mapCourse(r, 'owner'));
  }

  const [ownedRows, accessRows] = await Promise.all([
    prisma.course.findMany({ where: { institutionId: caller.institutionId, courseLevel: 'personal', ownerId: caller.id } }),
    prisma.courseAccess.findMany({ where: { userId: caller.id }, select: { courseId: true, permissionRole: true } }),
  ]);
  const roleByCourse = new Map(accessRows.map(a => [a.courseId, a.permissionRole as CoursePermissionRole]));
  const grantedRows = accessRows.length
    ? await prisma.course.findMany({ where: { id: { in: accessRows.map(a => a.courseId) }, institutionId: caller.institutionId } })
    : [];
  // Institutional courses are readable by every teacher via resolveCoursePermission's own
  // implicit-viewer rule for courseLevel === 'institutional' — the single source of truth every
  // other course read (getCourseById, getTopics, getCLOs, ...) also goes through, so this stays
  // in sync with them rather than re-deciding the same thing locally.
  const institutionalRows = await prisma.course.findMany({ where: { institutionId: caller.institutionId, courseLevel: 'institutional' } });

  const seen = new Set(ownedRows.map(r => r.id));
  const combined = [
    ...ownedRows.map(r => mapCourse(r, 'owner')),
    ...grantedRows.filter(r => !seen.has(r.id)).map(r => mapCourse(r, roleByCourse.get(r.id) ?? null)),
    ...institutionalRows
      .filter(r => !seen.has(r.id) && !accessRows.some(a => a.courseId === r.id))
      .map(r => mapCourse(r, resolveCoursePermission(r, caller, null))),
  ];
  return combined.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Institution-level courses visible to the caller: every institutional course in their own institution. */
export async function getInstitutionCourses(): Promise<Course[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const rows = await prisma.course.findMany({
    where: { institutionId: caller.institutionId, courseLevel: 'institutional' },
    orderBy: { createdAt: 'asc' },
  });
  const accessRows = await prisma.courseAccess.findMany({
    where: { userId: caller.id, courseId: { in: rows.map(r => r.id) } },
    select: { courseId: true, permissionRole: true },
  });
  const roleByCourse = new Map(accessRows.map(a => [a.courseId, a.permissionRole as CoursePermissionRole]));
  // Routed through resolveCoursePermission (admin -> owner, institutional -> at least viewer,
  // upgraded by an explicit grant) so this stays in sync with every other course read.
  return rows.map(r => mapCourse(r, resolveCoursePermission(r, caller, roleByCourse.get(r.id) ?? null)));
}

/** Personal course trees the caller owns. */
export async function getMyPrivateCourses(): Promise<Course[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const rows = await prisma.course.findMany({
    where: { institutionId: caller.institutionId, courseLevel: 'personal', ownerId: caller.id },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(r => mapCourse(r, 'owner'));
}

/** Personal course trees owned by someone else, shared with the caller via CourseAccess. */
export async function getSharedWithMeCourses(): Promise<Course[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const accessRows = await prisma.courseAccess.findMany({ where: { userId: caller.id }, select: { courseId: true, permissionRole: true } });
  if (accessRows.length === 0) return [];
  const roleByCourse = new Map(accessRows.map(a => [a.courseId, a.permissionRole as CoursePermissionRole]));
  const rows = await prisma.course.findMany({
    where: {
      id: { in: accessRows.map(a => a.courseId) },
      institutionId: caller.institutionId,
      courseLevel: 'personal',
      ownerId: { not: caller.id },
    },
  });
  return rows.map(r => mapCourse(r, roleByCourse.get(r.id) ?? null));
}

export async function getCourseById(id: string): Promise<Course | undefined> {
  const caller = await getCaller();
  if (!caller) return undefined;
  const result = await getCoursePermission(id, caller);
  if (!result || !canReadCourse(result.role)) return undefined;
  return mapCourse(result.course, result.role);
}

export async function createCourse(data: { code: string; title: string; courseLevel?: CourseLevel }): Promise<Course> {
  const caller = await getCaller();
  if (!caller) throw new Error('Not authenticated');
  const courseLevel = data.courseLevel ?? 'personal';
  if (courseLevel === 'institutional' && caller.role !== 'admin') {
    throw new Error('Forbidden: only institution admins can create institutional courses');
  }
  const ownerId = courseLevel === 'institutional' ? caller.institutionId : caller.id;
  try {
    const row = await prisma.course.create({
      data: { code: data.code, title: data.title, institutionId: caller.institutionId, courseLevel, ownerId },
    });
    return mapCourse(row, 'owner');
  } catch (err) {
    console.error('[createCourse] Prisma error:', err);
    throw err;
  }
}

// ── Topics / CLOs (permission inherited from the parent Course, same as Item Bank's
// Item/ItemOption inheriting from ItemBank rather than being individually access-controlled) ──

export async function getTopics(courseId: string): Promise<Topic[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const result = await getCoursePermission(courseId, caller);
  if (!result || !canReadCourse(result.role)) return [];
  const rows = await prisma.topic.findMany({ where: { courseId }, orderBy: { order: 'asc' } });
  return rows.map(mapTopic);
}

export async function getTopicById(id: string): Promise<Topic | undefined> {
  const row = await prisma.topic.findUnique({ where: { id } });
  return row ? mapTopic(row) : undefined;
}

export async function createTopic(data: Omit<Topic, 'id' | 'createdAt'>): Promise<Topic> {
  const caller = await getCaller();
  if (!caller) throw new Error('Not authenticated');
  const result = await getCoursePermission(data.courseId, caller);
  if (!result || !canEditCourse(result.role)) throw new Error('Forbidden');
  try {
    const row = await prisma.topic.create({ data });
    return mapTopic(row);
  } catch (err) {
    console.error('[createTopic] Prisma error:', err);
    throw err;
  }
}

export async function getCLOs(topicId: string): Promise<LearningObjective[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const topic = await prisma.topic.findUnique({ where: { id: topicId }, select: { courseId: true } });
  if (!topic) return [];
  const result = await getCoursePermission(topic.courseId, caller);
  if (!result || !canReadCourse(result.role)) return [];
  const rows = await prisma.learningObjective.findMany({ where: { topicId }, orderBy: { createdAt: 'asc' } });
  return rows.map(mapCLO);
}

export async function getCLOById(id: string): Promise<LearningObjective | undefined> {
  const row = await prisma.learningObjective.findUnique({ where: { id } });
  return row ? mapCLO(row) : undefined;
}

export async function createCLO(data: Omit<LearningObjective, 'id' | 'createdAt'>): Promise<LearningObjective> {
  const caller = await getCaller();
  if (!caller) throw new Error('Not authenticated');
  const topic = await prisma.topic.findUnique({ where: { id: data.topicId }, select: { courseId: true } });
  if (!topic) throw new Error('Topic not found');
  const result = await getCoursePermission(topic.courseId, caller);
  if (!result || !canEditCourse(result.role)) throw new Error('Forbidden');
  try {
    const row = await prisma.learningObjective.create({
      data: {
        topicId: data.topicId,
        code: data.code ?? null,
        text: data.text,
        bloomsLevel: data.bloomsLevel,
        learningDomain: data.learningDomain,
      },
    });
    return mapCLO(row);
  } catch (err) {
    console.error('[createCLO] Prisma error:', err);
    throw err;
  }
}

export async function updateCLO(id: string, data: Partial<LearningObjective>): Promise<LearningObjective | undefined> {
  const caller = await getCaller();
  if (!caller) return undefined;
  const clo = await prisma.learningObjective.findUnique({ where: { id }, select: { topic: { select: { courseId: true } } } });
  if (!clo) return undefined;
  const result = await getCoursePermission(clo.topic.courseId, caller);
  if (!result || !canEditCourse(result.role)) return undefined;
  const row = await prisma.learningObjective.update({
    where: { id },
    data: {
      ...(data.text && { text: data.text }),
      ...(data.bloomsLevel && { bloomsLevel: data.bloomsLevel }),
      ...(data.learningDomain && { learningDomain: data.learningDomain }),
      ...(data.code !== undefined && { code: data.code ?? null }),
    },
  });
  return mapCLO(row);
}

// Ancestor lookup for a CLO — used by the AI generation prompt to fold the CLO's course/topic
// text into the system prompt. Deliberately not permission-gated the same way as the CRUD above:
// callers of this (generation-job.ts) already independently verify the caller can use the CLO's
// bank/exam before reaching here, mirroring the pre-existing cross-tenant check that lived here
// before this migration (course institution === caller institution, checked by the caller).
export async function getCLOWithAncestors(cloId: string): Promise<{
  clo: LearningObjective; topic: Topic; course: Course;
} | undefined> {
  const clo = await prisma.learningObjective.findUnique({
    where: { id: cloId },
    include: { topic: { include: { course: true } } },
  });
  if (!clo) return undefined;
  return {
    clo: mapCLO(clo),
    topic: mapTopic(clo.topic),
    course: mapCourse(clo.topic.course),
  };
}

// ── CLO performance reporting (governance ask: aggregate approved grades by CLO_ID for
// sub-skill-level quality/accreditation reports) ──────────────────────────────────

export interface CloPerformance {
  cloId: string;
  code?: string;
  text: string;
  bloomsLevel: string;
  learningDomain: string;
  /** Average score as a 0-100 percentage across every graded answer tied to this CLO
   *  (marksAwarded / question.marks), or undefined below the insufficient-N floor. */
  averageScorePercent?: number;
  gradedAnswerCount: number;
}

// Same insufficient-N floor as the psychometrics service's own per-item stats (decision 10,
// 2026-07-11) — an average over fewer than 10 graded answers is noise, not a real signal, so it's
// reported honestly as "not enough data" rather than a misleadingly precise number.
const MIN_N_FOR_AVERAGE = 10;

/** Per-CLO performance rollup for every CLO in one course — the "granular, quantitative academic
 * quality report" the rubric-engine notes ask for. Scoped to graded answers only (marksAwarded
 * set — true for both deterministic questions and confirmed/overridden AI-graded ones, never for
 * an answer still pending review), so an in-progress exam never skews the numbers. */
export async function getCloPerformanceReport(courseId: string): Promise<CloPerformance[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const result = await getCoursePermission(courseId, caller);
  if (!result || !canReadCourse(result.role)) return [];

  const clos = await prisma.learningObjective.findMany({
    where: { topic: { courseId } },
    orderBy: { createdAt: 'asc' },
  });
  if (clos.length === 0) return [];

  const answers = await prisma.answer.findMany({
    where: {
      marksAwarded: { not: null },
      question: { learningObjectiveId: { in: clos.map(c => c.id) } },
    },
    select: { marksAwarded: true, question: { select: { learningObjectiveId: true, marks: true } } },
  });

  const byClo = new Map<string, { sum: number; count: number }>();
  for (const a of answers) {
    const cloId = a.question.learningObjectiveId;
    if (!cloId || a.marksAwarded === null || a.question.marks <= 0) continue;
    const pct = (a.marksAwarded / a.question.marks) * 100;
    const bucket = byClo.get(cloId) ?? { sum: 0, count: 0 };
    bucket.sum += pct;
    bucket.count += 1;
    byClo.set(cloId, bucket);
  }

  return clos.map(clo => {
    const bucket = byClo.get(clo.id);
    const count = bucket?.count ?? 0;
    return {
      cloId: clo.id,
      code: clo.code ?? undefined,
      text: clo.text,
      bloomsLevel: clo.bloomsLevel,
      learningDomain: clo.learningDomain,
      gradedAnswerCount: count,
      averageScorePercent: count >= MIN_N_FOR_AVERAGE ? Number(((bucket!.sum) / count).toFixed(1)) : undefined,
    };
  });
}

// ── Institution-wide curriculum analytics (admin analytics page) ──────────────
// Same marksAwarded/marks percentage math as getCloPerformanceReport above, but rolled up across
// every course in the institution and bucketed by learningDomain / bloomsLevel instead of by CLO.

export interface DomainPerformance {
  domain: LearningDomain;
  questionCount: number;
  averageScorePercent?: number;
}

export interface BloomsPerformance {
  level: BloomsLevel;
  questionCount: number;
  averageScorePercent?: number;
}

const DOMAIN_ORDER: LearningDomain[] = ['Knowledge', 'Skill', 'Values'];
const BLOOMS_ORDER: BloomsLevel[] = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

export async function getInstitutionCurriculumAnalytics(): Promise<{
  domainBreakdown: DomainPerformance[];
  bloomsPerformance: BloomsPerformance[];
}> {
  const { institutionId } = await getSessionContext();
  if (!institutionId) return { domainBreakdown: [], bloomsPerformance: [] };

  const questions = await prisma.question.findMany({
    where: { learningObjectiveId: { not: null }, exam: { institutionId } },
    select: {
      marks: true,
      learningObjective: { select: { bloomsLevel: true, learningDomain: true } },
      answers: { where: { marksAwarded: { not: null } }, select: { marksAwarded: true } },
    },
  });

  type Bucket = { sum: number; gradedCount: number; questionCount: number };
  const byDomain = new Map<LearningDomain, Bucket>();
  const byBlooms = new Map<BloomsLevel, Bucket>();

  for (const q of questions) {
    if (!q.learningObjective || q.marks <= 0) continue;
    const domain = q.learningObjective.learningDomain as LearningDomain;
    const level = q.learningObjective.bloomsLevel as BloomsLevel;

    const dBucket = byDomain.get(domain) ?? { sum: 0, gradedCount: 0, questionCount: 0 };
    const bBucket = byBlooms.get(level) ?? { sum: 0, gradedCount: 0, questionCount: 0 };
    dBucket.questionCount += 1;
    bBucket.questionCount += 1;

    for (const a of q.answers) {
      if (a.marksAwarded === null) continue;
      const pct = (a.marksAwarded / q.marks) * 100;
      dBucket.sum += pct; dBucket.gradedCount += 1;
      bBucket.sum += pct; bBucket.gradedCount += 1;
    }

    byDomain.set(domain, dBucket);
    byBlooms.set(level, bBucket);
  }

  const withAverage = (b: Bucket) => (b.gradedCount >= MIN_N_FOR_AVERAGE ? { averageScorePercent: Number((b.sum / b.gradedCount).toFixed(1)) } : {});

  const domainBreakdown: DomainPerformance[] = DOMAIN_ORDER
    .map(domain => {
      const b = byDomain.get(domain);
      return b ? { domain, questionCount: b.questionCount, ...withAverage(b) } : null;
    })
    .filter((x): x is DomainPerformance => x !== null);

  const bloomsPerformance: BloomsPerformance[] = BLOOMS_ORDER
    .map(level => {
      const b = byBlooms.get(level);
      return b ? { level, questionCount: b.questionCount, ...withAverage(b) } : null;
    })
    .filter((x): x is BloomsPerformance => x !== null);

  return { domainBreakdown, bloomsPerformance };
}

// ── Collaborators (owner-only to manage) ──────────────────────────────────────

export async function getCourseCollaborators(courseId: string): Promise<CourseCollaborator[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const result = await getCoursePermission(courseId, caller);
  if (!result || !canReadCourse(result.role)) return [];
  const rows = await prisma.courseAccess.findMany({
    where: { courseId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(r => ({
    id: r.id,
    courseId: r.courseId,
    userId: r.userId,
    userName: r.user.name,
    userEmail: r.user.email,
    permissionRole: r.permissionRole as CoursePermissionRole,
    assignedById: r.assignedById,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addCourseCollaborator(
  courseId: string,
  userId: string,
  permissionRole: Exclude<CoursePermissionRole, 'owner'>,
): Promise<CourseCollaborator> {
  const caller = await getCaller();
  if (!caller) throw new Error('Unauthorized');
  const result = await getCoursePermission(courseId, caller);
  if (!result) throw new Error('Not found');
  if (!canManageCourse(result.role)) throw new Error('Forbidden');

  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { institutionId: true, name: true, email: true } });
  if (!targetUser || targetUser.institutionId !== result.course.institutionId) {
    throw new Error('Forbidden: user is not in this institution');
  }
  if (userId === (result.course.ownerId ?? result.course.institutionId)) {
    throw new Error('That user already owns this course');
  }

  const row = await prisma.courseAccess.upsert({
    where: { courseId_userId: { courseId, userId } },
    create: { courseId, userId, permissionRole, assignedById: caller.id },
    update: { permissionRole, assignedById: caller.id },
  });
  return {
    id: row.id, courseId: row.courseId, userId: row.userId,
    userName: targetUser.name, userEmail: targetUser.email,
    permissionRole: row.permissionRole as CoursePermissionRole,
    assignedById: row.assignedById, createdAt: row.createdAt.toISOString(),
  };
}

export async function removeCourseCollaborator(courseId: string, userId: string): Promise<boolean> {
  const caller = await getCaller();
  if (!caller) throw new Error('Unauthorized');
  const result = await getCoursePermission(courseId, caller);
  if (!result) return false;
  if (!canManageCourse(result.role)) throw new Error('Forbidden');
  await prisma.courseAccess.deleteMany({ where: { courseId, userId } });
  return true;
}
