'use client';
import { useEffect } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import { logViolation } from '@/lib/data';

interface TabGuardProps {
  examId: string;
  attemptId: string;
  studentId: string;
}

export function TabGuard({ examId, attemptId, studentId }: TabGuardProps) {
  const { addViolation } = useProctoringStore();

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        addViolation({ type: 'tab_switch', timestamp: new Date().toISOString(), description: 'Tab switch detected' });
        logViolation({
          attemptId,
          studentId,
          examId,
          type: 'tab_switch',
          severity: 'medium',
          timestamp: new Date().toISOString(),
          description: 'Student switched browser tab or minimized window',
        });
      }
    }

    function handleBlur() {
      addViolation({ type: 'window_blur', timestamp: new Date().toISOString(), description: 'Window blur detected' });
      logViolation({
        attemptId,
        studentId,
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
  }, [examId, attemptId, studentId, addViolation]);

  return null;
}
