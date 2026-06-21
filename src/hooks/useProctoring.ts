'use client';
import { useEffect } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import { useCurrentUser } from './useCurrentUser';
import { logViolation } from '@/lib/data';

interface UseProctoringProps {
  examId: string;
  attemptId: string;
}

export function useProctoring({ examId, attemptId }: UseProctoringProps) {
  const user = useCurrentUser();
  const { violationCount, trustScore, addViolation, isWarningVisible } = useProctoringStore();

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        addViolation();
        logViolation({
          attemptId,
          studentId: user?.id ?? 'unknown',
          examId,
          type: 'tab_switch',
          severity: 'medium',
          timestamp: new Date().toISOString(),
          description: 'Student switched to another tab or minimized browser',
        });
      }
    }

    function handleBlur() {
      addViolation();
      logViolation({
        attemptId,
        studentId: user?.id ?? 'unknown',
        examId,
        type: 'window_blur',
        severity: 'low',
        timestamp: new Date().toISOString(),
        description: 'Browser window lost focus',
      });
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [examId, attemptId, user?.id, addViolation]);

  return {
    isActive: true,
    violationCount,
    trustScore,
    isWarningVisible,
  };
}
