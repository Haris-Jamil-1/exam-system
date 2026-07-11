'use client';
// Tab/window focus tracking + keyboard shortcut blocking (Ctrl+C/V/P/S/A/U,
// PrintScreen, F12, DevTools combos, right-click).
// Phase 3: absences are tracked as episodes — one event per episode, emitted on
// return with its duration, so the server can derive severity from time away.
import { useEffect } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import type { ProctoringEventBuffer } from '@/lib/proctoring/event-buffer';

interface TabGuardProps {
  buffer: ProctoringEventBuffer;
}

const BLOCKED_KEYS = new Set(['F12', 'PrintScreen']);
const BLOCKED_CTRL_KEYS = new Set(['c', 'v', 'p', 's', 'a', 'u']);

export function TabGuard({ buffer }: TabGuardProps) {
  const { addViolation } = useProctoringStore();

  useEffect(() => {
    let hiddenAt: string | null = null;
    let blurredAt: string | null = null;

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = new Date().toISOString();
        addViolation({ type: 'tab_switch', timestamp: hiddenAt, description: 'Tab switch detected' });
      } else if (hiddenAt) {
        buffer.emit({
          type: 'tab_switch',
          severity: 'medium',
          confidence: 1,
          timestamp: hiddenAt,
          endedAt: new Date().toISOString(),
          description: 'Student switched browser tab or minimized window',
        });
        hiddenAt = null;
      }
    }

    function handleBlur() {
      blurredAt = new Date().toISOString();
    }

    function handleFocus() {
      // Ignore blur caused by tab-hide — the visibility episode already covers it.
      if (blurredAt && document.visibilityState === 'visible' && !hiddenAt) {
        addViolation({ type: 'window_blur', timestamp: blurredAt, description: 'Window blur detected' });
        buffer.emit({
          type: 'window_blur',
          severity: 'low',
          confidence: 1,
          timestamp: blurredAt,
          endedAt: new Date().toISOString(),
          description: 'Browser window lost focus',
        });
      }
      blurredAt = null;
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (BLOCKED_KEYS.has(e.key)) {
        e.preventDefault();
        addViolation({ type: 'tab_switch', timestamp: new Date().toISOString(), description: `Blocked key: ${e.key}` });
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

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
    window.addEventListener('focus', handleFocus);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [buffer, addViolation]);

  return null;
}
