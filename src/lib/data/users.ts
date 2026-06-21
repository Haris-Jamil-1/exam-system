// Phase 2: replace each function body with Supabase/Prisma query.
import type { CurrentUser } from '@/types';
import { mockUsers } from '@/lib/mock-data/users';

export async function getCurrentUser(): Promise<CurrentUser> {
  // Phase 2: decode JWT from Supabase session; return prisma.user.findUnique({ where: { id: session.user.id } })
  return mockUsers.find(u => u.role === 'teacher')!;
}

export async function getUserById(id: string): Promise<CurrentUser | undefined> {
  // Phase 2: prisma.user.findUnique({ where: { id } }) ?? undefined
  return mockUsers.find(u => u.id === id);
}

export async function getAllUsers(): Promise<CurrentUser[]> {
  // Phase 2: prisma.user.findMany() scoped by institution_id via RLS
  return mockUsers;
}
