'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { canManageClass, deriveInviteStatus, type CallerContext } from '@/lib/class-permissions';
import { isEmailActiveElsewhere } from './invite-guards';
import { getResend } from '@/lib/resend-client';
import type { ClassSummary, ClassEnrollmentSummary, ClassInviteSummary } from '@/types';

const CLASS_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Hard cap on one bulk-invite request, same rationale as MAX_BATCH_SIZE for AI generation —
// keeps a single request bounded regardless of what the textarea parser produces.
const MAX_BULK_INVITES = 50;

// ── Caller resolution ──────────────────────────────────────────────────────────

async function getCaller(): Promise<CallerContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const row = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  if (!row) return null;
  return { id: row.id, institutionId: row.institutionId, role: row.role as CallerContext['role'], isSuperAdmin: row.isSuperAdmin };
}

type PrismaClassRow = {
  id: string; name: string; teacherId: string; institutionId: string;
  createdAt: Date; archivedAt: Date | null; _count?: { enrollments: number };
};

function mapClass(c: PrismaClassRow): ClassSummary {
  return {
    id: c.id,
    name: c.name,
    teacherId: c.teacherId,
    institutionId: c.institutionId,
    createdAt: c.createdAt.toISOString(),
    archivedAt: c.archivedAt?.toISOString(),
    studentCount: c._count?.enrollments ?? 0,
  };
}

async function getClassForPermission(classId: string) {
  return prisma.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, teacherId: true, institutionId: true },
  });
}

// ── Class CRUD ───────────────────────────────────────────────────────────────

export async function createClass(name: string): Promise<ClassSummary | null> {
  const caller = await getCaller();
  if (!caller || caller.role !== 'teacher') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const cls = await prisma.class.create({
    data: { name: trimmed, teacherId: caller.id, institutionId: caller.institutionId },
    include: { _count: { select: { enrollments: true } } },
  });
  return mapClass(cls);
}

export async function getMyClasses(): Promise<ClassSummary[]> {
  const caller = await getCaller();
  if (!caller) return [];
  // Admins get institution-wide oversight of every class, same authority pattern as exams/items.
  const where = caller.role === 'admin'
    ? { institutionId: caller.institutionId }
    : { teacherId: caller.id };

  const rows = await prisma.class.findMany({
    where,
    include: { _count: { select: { enrollments: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapClass);
}

export async function getClassById(classId: string): Promise<ClassSummary | null> {
  const caller = await getCaller();
  if (!caller) return null;
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: { _count: { select: { enrollments: true } } },
  });
  if (!cls || !canManageClass(cls, caller)) return null;
  return mapClass(cls);
}

export async function updateClass(classId: string, name: string): Promise<ClassSummary | null> {
  const caller = await getCaller();
  if (!caller) return null;
  const existing = await getClassForPermission(classId);
  if (!existing || !canManageClass(existing, caller)) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const updated = await prisma.class.update({
    where: { id: classId },
    data: { name: trimmed },
    include: { _count: { select: { enrollments: true } } },
  });
  return mapClass(updated);
}

export async function archiveClass(classId: string, archived: boolean): Promise<ClassSummary | null> {
  const caller = await getCaller();
  if (!caller) return null;
  const existing = await getClassForPermission(classId);
  if (!existing || !canManageClass(existing, caller)) return null;

  const updated = await prisma.class.update({
    where: { id: classId },
    data: { archivedAt: archived ? new Date() : null },
    include: { _count: { select: { enrollments: true } } },
  });
  return mapClass(updated);
}

// ── Enrollment ───────────────────────────────────────────────────────────────

export async function getEnrollments(classId: string): Promise<ClassEnrollmentSummary[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const cls = await getClassForPermission(classId);
  if (!cls || !canManageClass(cls, caller)) return [];

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
  const cls = await getClassForPermission(classId);
  if (!cls || !canManageClass(cls, caller)) return false;

  await prisma.classEnrollment.deleteMany({ where: { classId, studentId } });
  return true;
}

// ── Invites ──────────────────────────────────────────────────────────────────

export async function getClassInvites(classId: string): Promise<ClassInviteSummary[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const cls = await getClassForPermission(classId);
  if (!cls || !canManageClass(cls, caller)) return [];

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
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true, teacherId: true, institutionId: true } });
  if (!cls || !canManageClass(cls, caller)) return null;

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
