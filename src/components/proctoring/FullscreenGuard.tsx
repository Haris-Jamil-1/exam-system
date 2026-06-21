'use client';
import { useEffect } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import { logViolation } from '@/lib/data';

interface FullscreenGuardProps {
  examId: string;
  attemptId: string;
  studentId: string;
}

export function FullscreenGuard({ examId, attemptId, studentId }: FullscreenGuardProps) {
  const { addViolation } = useProctoringStore();

  useEffect(() => {
    // Request fullscreen on mount
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // User denied — log as violation
        addViolation({ type: 'fullscreen_exit', timestamp: new Date().toISOString(), description: 'Fullscreen denied' });
      });
    }

    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        addViolation({ type: 'fullscreen_exit', timestamp: new Date().toISOString(), description: 'Fullscreen exited' });
        logViolation({
          attemptId,
          studentId,
          examId,
          type: 'fullscreen_exit',
          severity: 'high',
          timestamp: new Date().toISOString(),
          description: 'Student exited fullscreen mode',
        });
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [examId, attemptId, studentId, addViolation]);

  return null;
}
