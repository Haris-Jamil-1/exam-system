'use client';
import { useState, useEffect } from 'react';
import type { Violation } from '@/types';
import { getMonitorFeed, logViolation } from '@/lib/data';

export function useViolations(examId: string) {
  const [violations, setViolations] = useState<Violation[]>([]);

  useEffect(() => {
    getMonitorFeed(examId).then(setViolations);
    // Phase 2: subscribe to Supabase Realtime here
  }, [examId]);

  async function addViolation(data: Omit<Violation, 'id'>) {
    const newViolation = await logViolation(data);
    setViolations(prev => [newViolation, ...prev]);
    return newViolation;
  }

  return { violations, addViolation };
}
