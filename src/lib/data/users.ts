'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { canDeactivateUser, type UserForDeactivation } from '@/lib/class-permissions';
import type { CurrentUser } from '@/types';

function mapUser(u: {
  id: string; name: string; email: string; role: string;
  institutionId: string; avatarUrl: string | null; suspendedAt?: Date | null;
}): CurrentUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as CurrentUser['role'],
    institutionId: u.institutionId,
    avatarUrl: u.avatarUrl ?? undefined,
    suspendedAt: u.suspendedAt?.toISOString(),
  };
}

export async function getCurrentUser(): Promise<CurrentUser | undefined> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;
  const row = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  return row ? mapUser(row) : undefined;
}

export async function getUserById(id: string): Promise<CurrentUser | undefined> {
  const row = await prisma.user.findUnique({ where: { id } });
  return row ? mapUser(row) : undefined;
}

export async function getMyInstitution() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const institutionId = user?.user_metadata?.institutionId as string | undefined;
  if (!institutionId) return null;
  return prisma.institution.findUnique({ where: { id: institutionId } });
}

export async function getAllUsers(): Promise<CurrentUser[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const institutionId = user?.user_metadata?.institutionId as string | undefined;
  if (!institutionId) return [];
  const rows = await prisma.user.findMany({ where: { institutionId }, orderBy: { createdAt: 'asc' } });
  return rows.map(mapUser);
}

// Institution-admin account deactivation (distinct from the platform Super Admin's own
// suspend flow at /api/super/suspend — same suspendedAt flag, narrower authority: an
// institution admin may only reach teacher/student accounts within their own institution.
// See canDeactivateUser in class-permissions.ts for the exact rule.
export async function setUserSuspension(userId: string, suspend: boolean): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const caller = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  if (!caller) return null;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return null;

  const callerCtx: UserForDeactivation = {
    id: caller.id, institutionId: caller.institutionId, role: caller.role, isSuperAdmin: caller.isSuperAdmin,
  };
  const targetCtx: UserForDeactivation = {
    id: target.id, institutionId: target.institutionId, role: target.role, isSuperAdmin: target.isSuperAdmin,
  };
  if (!canDeactivateUser(callerCtx, targetCtx)) return null;

  const suspendedAt = suspend ? new Date() : null;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({ where: { id: userId }, data: { suspendedAt } });
    // Cascade-handle: deactivating a teacher archives their classes (their students' history
    // and existing exams are left untouched — only class visibility/activity is affected).
    if (suspend && target.role === 'teacher') {
      await tx.class.updateMany({
        where: { teacherId: userId, archivedAt: null },
        data: { archivedAt: new Date() },
      });
    }
    return u;
  });

  return mapUser(updated);
}
