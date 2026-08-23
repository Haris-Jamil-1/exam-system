// Pure permission logic for Curriculum (Course/Topic/CLO) — mirrors item-bank-permissions.ts's
// resolveBankPermission exactly (see that file for the full rationale). Deliberately NOT a
// 'use server' module for the same reason: these are synchronous pure functions, and every
// export of a 'use server' file must be an async Server Action.

export interface CallerContext {
  id: string;
  institutionId: string;
  role: 'admin' | 'teacher' | 'student';
}

export type CoursePermissionRole = 'owner' | 'editor' | 'viewer';

export type PrismaCourseForPermission = {
  id: string;
  courseLevel: string;
  ownerId: string | null;
  institutionId: string;
};

// Single source of truth for "what can this caller do with this course tree". Cross-tenant is a
// hard, unconditional deny before any ownership/role logic runs. Institution admins get full
// (owner) oversight over every course in their own institution, institutional or personal —
// matches the exact admin-authority precedent already established for Item Banks and Classes.
export function resolveCoursePermission(
  course: PrismaCourseForPermission,
  caller: CallerContext,
  accessRole: CoursePermissionRole | null,
): CoursePermissionRole | null {
  if (course.institutionId !== caller.institutionId) return null;
  if (caller.role === 'admin') return 'owner';

  if (course.courseLevel === 'institutional') {
    // Every teacher in the institution can at least read an institutional course — matches
    // pre-migration behavior (courses had zero access control at all before this RBAC model
    // shipped; see getCourses()'s history). An explicit CourseAccess grant upgrades this to
    // editor/owner-equivalent. This must be the single place that decision is made — every
    // consumer (getCourseById, getTopics, getCLOs, collaborators, ...) routes through this
    // function via getCoursePermission, so a local fallback in just the listing queries would
    // leave those other reads out of sync (as it previously did).
    return accessRole ?? 'viewer';
  }

  // Personal course: the creator is always owner (falls back to institutionId matching nothing
  // for a real user id, so this branch is simply false for any pre-migration row that somehow
  // still has a null ownerId — the backfill at migration time set every row's ownerId for real).
  if (course.ownerId === caller.id) return 'owner';
  return accessRole;
}

export function canReadCourse(role: CoursePermissionRole | null): boolean {
  return role !== null;
}
export function canEditCourse(role: CoursePermissionRole | null): boolean {
  return role === 'owner' || role === 'editor';
}
export function canManageCourse(role: CoursePermissionRole | null): boolean {
  return role === 'owner';
}
