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

// ── Institution/Private/Shared tenancy (mirrors item-bank-permissions.ts's
// resolveBankPermission exactly — see that file for the full rationale) ──────────────────────

export type ClassPermissionRole = 'owner' | 'editor' | 'viewer';

export type PrismaClassForTenancy = {
  id: string;
  classLevel: string;
  ownerId: string | null;
  teacherId: string;
  institutionId: string;
};

// Single source of truth for "what can this caller do with this class" under the sharing model.
// Cross-tenant is a hard, unconditional deny before any ownership/role logic runs. Institution
// admins get full (owner) oversight over every class in their own institution, institutional or
// personal — same admin-authority precedent as resolveBankPermission (SEC-01..04, Item Banks).
export function resolveClassPermission(
  cls: PrismaClassForTenancy,
  caller: CallerContext,
  accessRole: ClassPermissionRole | null,
): ClassPermissionRole | null {
  if (cls.institutionId !== caller.institutionId) return null;
  if (caller.role === 'admin') return 'owner';

  if (cls.classLevel === 'institutional') {
    return accessRole; // teachers only get whatever role was explicitly granted — no implicit access
  }

  // Personal class: the owner (falls back to teacherId for rows predating this column — every
  // pre-existing class was backfilled at migration time, but the fallback costs nothing and
  // guards against any row the backfill somehow missed) is always owner.
  if ((cls.ownerId ?? cls.teacherId) === caller.id) return 'owner';
  return accessRole;
}

export function canReadClass(role: ClassPermissionRole | null): boolean {
  return role !== null;
}
// Roster/invite management (add/remove students, send invites) — editor and owner both.
export function canEditClassRoster(role: ClassPermissionRole | null): boolean {
  return role === 'owner' || role === 'editor';
}
// Rename/archive/share the class itself — owner only (mirrors ItemBank: editors "cannot delete
// the bank or alter its core settings").
export function canManageClassAccess(role: ClassPermissionRole | null): boolean {
  return role === 'owner';
}

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
