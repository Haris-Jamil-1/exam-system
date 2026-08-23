'use server';
import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/session';
import {
  deriveInviteStatus, resolveClassPermission, canReadClass, canEditClassRoster, canManageClassAccess,
  type CallerContext,
} from '@/lib/class-permissions';
import { isEmailActiveElsewhere } from './invite-guards';
import { getResend } from '@/lib/resend-client';
import type { ClassSummary, ClassEnrollmentSummary, ClassInviteSummary, ClassLevel, ClassPermissionRole, ClassCollaborator } from '@/types';

const CLASS_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Hard cap on one bulk-invite request, same rationale as MAX_BATCH_SIZE for AI generation —
// keeps a single request bounded regardless of what the textarea parser produces.
const MAX_BULK_INVITES = 50;

// ── Caller resolution ──────────────────────────────────────────────────────────

async function getCaller(): Promise<CallerContext | null> {
  const row = await getSessionUser();
  if (!row) return null;
  return { id: row.id, institutionId: row.institutionId, role: row.role as CallerContext['role'], isSuperAdmin: row.isSuperAdmin };
}

type PrismaClassRow = {
  id: string; name: string; teacherId: string; institutionId: string;
  classLevel: string; ownerId: string | null;
  createdAt: Date; archivedAt: Date | null; _count?: { enrollments: number };
};

function mapClass(c: PrismaClassRow, myRole?: ClassPermissionRole | null): ClassSummary {
  return {
    id: c.id,
    name: c.name,
    teacherId: c.teacherId,
    institutionId: c.institutionId,
    classLevel: c.classLevel as ClassLevel,
    ownerId: c.ownerId ?? c.teacherId,
    createdAt: c.createdAt.toISOString(),
    archivedAt: c.archivedAt?.toISOString(),
    studentCount: c._count?.enrollments ?? 0,
    myRole: myRole ?? undefined,
  };
}

const CLASS_SELECT = { id: true, name: true, teacherId: true, institutionId: true, classLevel: true, ownerId: true } as const;

async function getClassForPermission(classId: string) {
  return prisma.class.findUnique({ where: { id: classId }, select: CLASS_SELECT });
}

/** Resolves the caller's role on one class, including any explicit ClassAccess grant. */
async function getClassPermission(classId: string, caller: CallerContext): Promise<{
  cls: NonNullable<Awaited<ReturnType<typeof getClassForPermission>>>;
  role: ClassPermissionRole | null;
} | null> {
  const cls = await getClassForPermission(classId);
  if (!cls) return null;
  const access = cls.institutionId === caller.institutionId
    ? await prisma.classAccess.findUnique({
        where: { classId_userId: { classId, userId: caller.id } },
        select: { permissionRole: true },
      })
    : null;
  const role = resolveClassPermission(cls, caller, (access?.permissionRole as ClassPermissionRole | undefined) ?? null);
  return { cls, role };
}

// ── Class CRUD ───────────────────────────────────────────────────────────────

export async function createClass(name: string, classLevel: ClassLevel = 'personal'): Promise<ClassSummary | null> {
  const caller = await getCaller();
  if (!caller || (caller.role !== 'teacher' && caller.role !== 'admin')) return null;
  if (classLevel === 'institutional' && caller.role !== 'admin') return null; // mirrors createItemBank's gate
  const trimmed = name.trim();
  if (!trimmed) return null;

  const ownerId = classLevel === 'institutional' ? caller.institutionId : caller.id;
  const cls = await prisma.class.create({
    data: { name: trimmed, teacherId: caller.id, institutionId: caller.institutionId, classLevel, ownerId },
    include: { _count: { select: { enrollments: true } } },
  });
  return mapClass(cls, 'owner');
}

/** Every class the caller can at least read — union of owned personal classes, classes shared
 * with them, and (for admins) every institutional class in their institution. Used by the exam
 * wizard's class picker, which needs "every class this teacher could assign an exam to" and
 * doesn't care about the 3-tab distinction the dashboard page shows. */
export async function getMyClasses(): Promise<ClassSummary[]> {
  const caller = await getCaller();
  if (!caller) return [];

  if (caller.role === 'admin') {
    const rows = await prisma.class.findMany({
      where: { institutionId: caller.institutionId },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(r => mapClass(r, 'owner'));
  }

  const [ownedRows, accessRows] = await Promise.all([
    prisma.class.findMany({
      where: { institutionId: caller.institutionId, classLevel: 'personal', ownerId: caller.id },
      include: { _count: { select: { enrollments: true } } },
    }),
    prisma.classAccess.findMany({ where: { userId: caller.id }, select: { classId: true, permissionRole: true } }),
  ]);
  const roleByClass = new Map(accessRows.map(a => [a.classId, a.permissionRole as ClassPermissionRole]));
  const grantedRows = accessRows.length
    ? await prisma.class.findMany({
        where: { id: { in: accessRows.map(a => a.classId) }, institutionId: caller.institutionId },
        include: { _count: { select: { enrollments: true } } },
      })
    : [];

  const seen = new Set(ownedRows.map(r => r.id));
  const combined = [
    ...ownedRows.map(r => mapClass(r, 'owner')),
    ...grantedRows.filter(r => !seen.has(r.id)).map(r => mapClass(r, roleByClass.get(r.id) ?? null)),
  ];
  return combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Institution-level classes visible to the caller: every institutional class in their own institution. */
export async function getInstitutionClasses(): Promise<ClassSummary[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const rows = await prisma.class.findMany({
    where: { institutionId: caller.institutionId, classLevel: 'institutional' },
    include: { _count: { select: { enrollments: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const accessRows = await prisma.classAccess.findMany({
    where: { userId: caller.id, classId: { in: rows.map(r => r.id) } },
    select: { classId: true, permissionRole: true },
  });
  const roleByClass = new Map(accessRows.map(a => [a.classId, a.permissionRole as ClassPermissionRole]));
  return rows
    .map(r => {
      const role = resolveClassPermission(r, caller, roleByClass.get(r.id) ?? null);
      return canReadClass(role) ? mapClass(r, role) : null;
    })
    .filter((c): c is ClassSummary => c !== null);
}

/** Personal classes the caller owns. */
export async function getMyPrivateClasses(): Promise<ClassSummary[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const rows = await prisma.class.findMany({
    where: { institutionId: caller.institutionId, classLevel: 'personal', ownerId: caller.id },
    include: { _count: { select: { enrollments: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(r => mapClass(r, 'owner'));
}

/** Personal classes owned by someone else, shared with the caller via ClassAccess. */
export async function getSharedWithMeClasses(): Promise<ClassSummary[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const accessRows = await prisma.classAccess.findMany({ where: { userId: caller.id }, select: { classId: true, permissionRole: true } });
  if (accessRows.length === 0) return [];
  const roleByClass = new Map(accessRows.map(a => [a.classId, a.permissionRole as ClassPermissionRole]));
  const rows = await prisma.class.findMany({
    where: {
      id: { in: accessRows.map(a => a.classId) },
      institutionId: caller.institutionId, // cross-tenant guard even if an access row somehow existed
      classLevel: 'personal',
      ownerId: { not: caller.id }, // don't duplicate "my private classes"
    },
    include: { _count: { select: { enrollments: true } } },
  });
  return rows.map(r => mapClass(r, roleByClass.get(r.id) ?? null));
}

export async function getClassById(classId: string): Promise<ClassSummary | null> {
  const caller = await getCaller();
  if (!caller) return null;
  const result = await getClassPermission(classId, caller);
  if (!result || !canReadClass(result.role)) return null;
  const cls = await prisma.class.findUnique({ where: { id: classId }, include: { _count: { select: { enrollments: true } } } });
  return cls ? mapClass(cls, result.role) : null;
}

export async function updateClass(classId: string, name: string): Promise<ClassSummary | null> {
  const caller = await getCaller();
  if (!caller) return null;
  const result = await getClassPermission(classId, caller);
  if (!result || !canManageClassAccess(result.role)) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const updated = await prisma.class.update({
    where: { id: classId },
    data: { name: trimmed },
    include: { _count: { select: { enrollments: true } } },
  });
  return mapClass(updated, result.role);
}

export async function archiveClass(classId: string, archived: boolean): Promise<ClassSummary | null> {
  const caller = await getCaller();
  if (!caller) return null;
  const result = await getClassPermission(classId, caller);
  if (!result || !canManageClassAccess(result.role)) return null;

  const updated = await prisma.class.update({
    where: { id: classId },
    data: { archivedAt: archived ? new Date() : null },
    include: { _count: { select: { enrollments: true } } },
  });
  return mapClass(updated, result.role);
}

// ── Enrollment (editor+ — matches Item Bank's "assigned instructors can add/edit items" tier) ──

export async function getEnrollments(classId: string): Promise<ClassEnrollmentSummary[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const result = await getClassPermission(classId, caller);
  if (!result || !canEditClassRoster(result.role)) return [];

  const rows = await prisma.classEnrollment.findMany({
    where: { classId },
    include: { student: true },
    orderBy: { joinedAt: 'asc' },
  });
  return rows.map(e => ({
    id: e.id,
    studentId: e.studentId,
    studentName: e.student.name,
    studentEmail: e.student.email,
    studentAvatarUrl: e.student.avatarUrl ?? undefined,
    joinedAt: e.joinedAt.toISOString(),
  }));
}

// Removes the ClassEnrollment row only — never touches the student's User account.
export async function removeEnrollment(classId: string, studentId: string): Promise<boolean> {
  const caller = await getCaller();
  if (!caller) return false;
  const result = await getClassPermission(classId, caller);
  if (!result || !canEditClassRoster(result.role)) return false;

  await prisma.classEnrollment.deleteMany({ where: { classId, studentId } });
  return true;
}

// ── Invites (editor+) ────────────────────────────────────────────────────────

export async function getClassInvites(classId: string): Promise<ClassInviteSummary[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const result = await getClassPermission(classId, caller);
  if (!result || !canEditClassRoster(result.role)) return [];

  const rows = await prisma.classInvite.findMany({ where: { classId }, orderBy: { createdAt: 'desc' } });
  const now = new Date();

  return Promise.all(rows.map(async (inv) => {
    const status = deriveInviteStatus(inv, now);
    if (status !== inv.status) {
      await prisma.classInvite.update({ where: { id: inv.id }, data: { status } }).catch(() => {});
    }
    return {
      id: inv.id,
      classId: inv.classId,
      email: inv.email,
      status,
      invitedById: inv.invitedById,
      expiresAt: inv.expiresAt.toISOString(),
      acceptedAt: inv.acceptedAt?.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    };
  }));
}

export type BulkInviteResult = { email: string; outcome: 'invited' | 'already_enrolled' | 'already_invited' | 'cross_institution' | 'failed' };

export async function createClassInvites(classId: string, emails: string[]): Promise<BulkInviteResult[] | null> {
  const caller = await getCaller();
  if (!caller) return null;
  const result = await getClassPermission(classId, caller);
  if (!result || !canEditClassRoster(result.role)) return null;
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true, teacherId: true, institutionId: true } });
  if (!cls) return null;

  const uniqueEmails = [...new Set(emails.map(e => e.trim().toLowerCase()))].slice(0, MAX_BULK_INVITES);
  const results: BulkInviteResult[] = [];

  for (const email of uniqueEmails) {
    if (await isEmailActiveElsewhere(email, cls.institutionId)) {
      results.push({ email, outcome: 'cross_institution' });
      continue;
    }

    const existingStudent = await prisma.user.findFirst({
      where: { email, role: 'student', institutionId: cls.institutionId },
      select: { id: true, name: true },
    });

    if (existingStudent) {
      const alreadyEnrolled = await prisma.classEnrollment.findUnique({
        where: { classId_studentId: { classId, studentId: existingStudent.id } },
      });
      if (alreadyEnrolled) {
        results.push({ email, outcome: 'already_enrolled' });
        continue;
      }
    }

    const pendingInvite = await prisma.classInvite.findFirst({
      where: { classId, email, status: 'pending', expiresAt: { gt: new Date() } },
    });
    if (pendingInvite) {
      results.push({ email, outcome: 'already_invited' });
      continue;
    }

    const invite = await prisma.classInvite.create({
      data: {
        classId,
        email,
        invitedById: caller.id,
        expiresAt: new Date(Date.now() + CLASS_INVITE_TTL_MS),
      },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const joinUrl = `${appUrl}/classes/join/${invite.token}`;

    const { error: emailError } = await getResend().emails.send({
      from: 'Evalix <noreply@aurixy.store>',
      to: email,
      subject: `You're invited to join "${cls.name}" on Evalix`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff">
          <div style="margin-bottom:24px">
            <div style="display:inline-flex;width:44px;height:44px;background:#1E88E5;border-radius:10px;align-items:center;justify-content:center">
              <span style="color:#fff;font-size:20px;font-weight:700">E</span>
            </div>
            <span style="margin-left:10px;font-size:18px;font-weight:700;color:#1A1D23;vertical-align:middle">Evalix</span>
          </div>
          <h2 style="font-size:22px;font-weight:700;color:#1A1D23;margin:0 0 8px">You've been invited to a class</h2>
          <p style="color:#6B7280;font-size:15px;margin:0 0 24px">
            You've been invited to join <strong>${cls.name}</strong> on Evalix.
            Click the button below to accept.
          </p>
          <a href="${joinUrl}" style="display:inline-block;background:#1E88E5;color:#fff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none">
            Join Class
          </a>
          <p style="color:#9CA3AF;font-size:13px;margin:24px 0 0">
            This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error('[class-invites] Resend error:', emailError);
      await prisma.classInvite.delete({ where: { id: invite.id } }).catch(() => {});
      results.push({ email, outcome: 'failed' });
      continue;
    }

    results.push({ email, outcome: 'invited' });
  }

  return results;
}

// ── Collaborators (owner-only to manage — mirrors item-banks.ts's addCollaborator/removeCollaborator) ──

export async function getClassCollaborators(classId: string): Promise<ClassCollaborator[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const result = await getClassPermission(classId, caller);
  if (!result || !canReadClass(result.role)) return [];
  const rows = await prisma.classAccess.findMany({
    where: { classId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(r => ({
    id: r.id,
    classId: r.classId,
    userId: r.userId,
    userName: r.user.name,
    userEmail: r.user.email,
    permissionRole: r.permissionRole as ClassPermissionRole,
    assignedById: r.assignedById,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addClassCollaborator(
  classId: string,
  userId: string,
  permissionRole: Exclude<ClassPermissionRole, 'owner'>,
): Promise<ClassCollaborator> {
  const caller = await getCaller();
  if (!caller) throw new Error('Unauthorized');
  const result = await getClassPermission(classId, caller);
  if (!result) throw new Error('Not found');
  if (!canManageClassAccess(result.role)) throw new Error('Forbidden');

  // Same cross-tenant guard as Item Bank's addCollaborator — the target user must belong to the
  // SAME institution as the class.
  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { institutionId: true, name: true, email: true } });
  if (!targetUser || targetUser.institutionId !== result.cls.institutionId) {
    throw new Error('Forbidden: user is not in this institution');
  }
  if (userId === (result.cls.ownerId ?? result.cls.teacherId)) {
    throw new Error('That user already owns this class');
  }

  const row = await prisma.classAccess.upsert({
    where: { classId_userId: { classId, userId } },
    create: { classId, userId, permissionRole, assignedById: caller.id },
    update: { permissionRole, assignedById: caller.id },
  });
  return {
    id: row.id, classId: row.classId, userId: row.userId,
    userName: targetUser.name, userEmail: targetUser.email,
    permissionRole: row.permissionRole as ClassPermissionRole,
    assignedById: row.assignedById, createdAt: row.createdAt.toISOString(),
  };
}

export async function removeClassCollaborator(classId: string, userId: string): Promise<boolean> {
  const caller = await getCaller();
  if (!caller) throw new Error('Unauthorized');
  const result = await getClassPermission(classId, caller);
  if (!result) return false;
  if (!canManageClassAccess(result.role)) throw new Error('Forbidden');
  await prisma.classAccess.deleteMany({ where: { classId, userId } });
  return true;
}
