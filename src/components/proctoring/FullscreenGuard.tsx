'use client';
import { useEffect } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import type { ProctoringEventBuffer } from '@/lib/proctoring/event-buffer';

interface FullscreenGuardProps {
  buffer: ProctoringEventBuffer;
}

export function FullscreenGuard({ buffer }: FullscreenGuardProps) {
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
        const now = new Date().toISOString();
        addViolation({ type: 'fullscreen_exit', timestamp: now, description: 'Fullscreen exited' });
        buffer.emit({
          type: 'fullscreen_exit',
          severity: 'high',
          confidence: 1,
          timestamp: now,
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
  }, [buffer, addViolation]);

  return null;
}
