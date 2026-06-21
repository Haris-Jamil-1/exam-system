'use client';
import { useState } from 'react';
import type { CurrentUser } from '@/types';

export function useCurrentUser(): CurrentUser | null | undefined {
  const [user] = useState<CurrentUser | null | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    try {
      const raw = localStorage.getItem('exam_user');
      return raw ? (JSON.parse(raw) as CurrentUser) : null;
    } catch {
      return null;
    }
  });

  return user;
}
