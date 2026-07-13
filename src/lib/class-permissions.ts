// Pure permission logic for Classes — deliberately NOT a 'use server' module (Next.js requires
// every export of a 'use server' file to be an async Server Action, and these are synchronous
// pure functions). src/lib/data/classes.ts and src/lib/data/users.ts import from here so there
// is exactly one place this logic is written — same convention as src/lib/item-bank-permissions.ts.

export interface CallerContext {
  id: string;
  institutionId: string;
  role: 'admin' | 'teacher' | 'student';
  isSuperAdmin?: boolean;
}

export type PrismaClassForPermission = {
  teacherId: string;
  institutionId: string;
};

// A teacher manages only their own classes; an institution admin manages every class in their
// own institution (matches the admin-authority pattern already established for exams/questions/
// item banks elsewhere in this app). Cross-tenant is always denied first.
export function canManageClass(cls: PrismaClassForPermission, caller: CallerContext): boolean {
  if (cls.institutionId !== caller.institutionId) return false;
  if (caller.role === 'admin') return true;
  return caller.id === cls.teacherId;
}

// Removing a student from a class roster follows the same ownership rule as managing the
// class itself — there is no separate "remove-only" role.
export const canRemoveEnrollment = canManageClass;

export type UserForDeactivation = {
  id: string;
  institutionId: string;
  role: 'admin' | 'teacher' | 'student';
  isSuperAdmin: boolean;
};

// Institution admins may deactivate teacher/student accounts in their own institution only —
// never another admin, never a super admin (that tier is only reachable via the platform Super
// Admin panel's own suspend flow, see api/super/suspend), and never themselves.
export function canDeactivateUser(caller: UserForDeactivation, target: UserForDeactivation): boolean {
  if (caller.role !== 'admin') return false;
  if (caller.institutionId !== target.institutionId) return false;
  if (target.role === 'admin') return false;
  if (target.isSuperAdmin) return false;
  if (caller.id === target.id) return false;
  return true;
}

export type InviteForStatus = {
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: Date;
};

// Lazy status derivation — a 'pending' invite whose expiresAt has passed reads as 'expired'
// without needing a cron sweep. Callers that persist this (getClassInvites) write the flip back
// opportunistically; this function itself has no side effects.
export function deriveInviteStatus(invite: InviteForStatus, now: Date): 'pending' | 'accepted' | 'expired' {
  if (invite.status === 'pending' && invite.expiresAt < now) return 'expired';
  return invite.status;
}

export interface RateLimitOptions {
  max: number;
  windowMs: number;
}

const DEFAULT_RATE_LIMIT: RateLimitOptions = { max: 3, windowMs: 15 * 60_000 };

// Pure sliding-window check: true if `attempts` already contains `max` or more entries within
// `windowMs` of `now`. Caller is responsible for fetching `attempts` (e.g. PasswordResetAttempt
// rows for one email) and for recording the new attempt if this returns false.
export function isRateLimited(attempts: Date[], now: Date, options: RateLimitOptions = DEFAULT_RATE_LIMIT): boolean {
  const windowStart = now.getTime() - options.windowMs;
  const recentCount = attempts.filter(a => a.getTime() > windowStart).length;
  return recentCount >= options.max;
}

// Splits bulk textarea input (comma and/or newline separated) into a deduped, lowercased list
// of syntactically valid email addresses — invalid entries are silently dropped, matching the
// existing bulk-upload parser's behavior in teacher/students/page.tsx.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseBulkEmails(text: string): string[] {
  const candidates = text.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const valid = candidates.filter(c => EMAIL_RE.test(c));
  return [...new Set(valid)];
}
