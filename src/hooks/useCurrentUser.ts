'use client';
import { useState, useEffect } from 'react';
import type { CurrentUser } from '@/types';

function persistSession(user: CurrentUser) {
  localStorage.setItem('exam_user', JSON.stringify(user));
  document.cookie = `exam_role=${user.role}; path=/; max-age=86400`;
}

function getStored(): CurrentUser | null {
  try {
    const raw = localStorage.getItem('exam_user');
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

export function useCurrentUser(): CurrentUser | null | undefined {
  const [user, setUser] = useState<CurrentUser | null | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    return getStored();
  });

  // When localStorage is empty (e.g. after invite-link callback), fetch from API
  useEffect(() => {
    if (getStored()) return;
    fetch('/api/users/me')
      .then(r => (r.ok ? r.json() : null))
      .then((u: CurrentUser | null) => {
        if (u) {
          persistSession(u);
          setUser(u);
        }
      })
      .catch(() => {});
  }, []);

  return user;
}
