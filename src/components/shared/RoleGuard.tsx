'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@/types';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface RoleGuardProps {
  allowedRoles: Role[];
  children: React.ReactNode;
  redirectTo?: string;
}

export function RoleGuard({ allowedRoles, children, redirectTo = '/login' }: RoleGuardProps) {
  const user = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (user !== undefined && (!user || !allowedRoles.includes(user.role))) {
      router.replace(redirectTo);
    }
  }, [user, allowedRoles, redirectTo, router]);

  if (!user) return null;
  if (!allowedRoles.includes(user.role)) return null;

  return <>{children}</>;
}
