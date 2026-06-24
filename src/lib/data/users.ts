'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { CurrentUser } from '@/types';

function mapUser(u: {
  id: string; name: string; email: string; role: string;
  institutionId: string; avatarUrl: string | null;
}): CurrentUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as CurrentUser['role'],
    institutionId: u.institutionId,
    avatarUrl: u.avatarUrl ?? undefined,
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
