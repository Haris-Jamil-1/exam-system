'use client';
// Keyboard shortcut blocking: Ctrl+C/V/P/S/A, PrintScreen, F12, DevTools combos
// Right-click context menu blocked to prevent inspect/copy during exam
import { useEffect } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import { logViolation } from '@/lib/data';

interface TabGuardProps {
  examId: string;
  attemptId: string;
  studentId: string;
}

const BLOCKED_KEYS = new Set(['F12', 'PrintScreen']);
const BLOCKED_CTRL_KEYS = new Set(['c', 'v', 'p', 's', 'a', 'u']);

export function TabGuard({ examId, attemptId, studentId }: TabGuardProps) {
  const { addViolation } = useProctoringStore();

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        addViolation({ type: 'tab_switch', timestamp: new Date().toISOString(), description: 'Tab switch detected' });
        logViolation({
          attemptId, studentId, examId,
          type: 'tab_switch', severity: 'medium',
          timestamp: new Date().toISOString(),
          description: 'Student switched browser tab or minimized window',
        });
      }
    }

    function handleBlur() {
      addViolation({ type: 'window_blur', timestamp: new Date().toISOString(), description: 'Window blur detected' });
      logViolation({
        attemptId, studentId, examId,
        type: 'window_blur', severity: 'low',
        timestamp: new Date().toISOString(),
        description: 'Browser window lost focus',
      });
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Block PrintScreen and F12
      if (BLOCKED_KEYS.has(e.key)) {
        e.preventDefault();
        addViolation({ type: 'tab_switch', timestamp: new Date().toISOString(), description: `Blocked key: ${e.key}` });
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      // Block Ctrl+C/V/P/S/A/U and Ctrl+Shift+I/J/C (DevTools)
      if (ctrl && BLOCKED_CTRL_KEYS.has(e.key.toLowerCase())) {
        e.preventDefault();
        return;
      }

      if (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        addViolation({ type: 'tab_switch', timestamp: new Date().toISOString(), description: 'DevTools shortcut blocked' });
        return;
      }
    }

    function handleContextMenu(e: MouseEvent) {
      e.preventDefault();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [examId, attemptId, studentId, addViolation]);

  return null;
}
