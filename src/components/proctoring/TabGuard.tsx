'use client';
// Tab/window focus tracking + keyboard shortcut blocking (Ctrl+C/V/P/S/A/U,
// PrintScreen, F12, DevTools combos, right-click).
// A tab-hide is emitted IMMEDIATELY, not on return: the previous "wait for the student to come
// back, then emit with duration" design meant a student who left and never returned before the
// exam ended (timeout, force-submit, tab/browser closed) produced zero server-side record at
// all — the violation was silently and permanently lost, not merely delayed. If the absence
// continues past the server's high-severity duration threshold (see deriveSeverity in
// src/lib/proctoring/severity.ts), a second escalation event is emitted so a long absence
// surfaces on the teacher's monitor while it's still happening, not only in hindsight.
import { useEffect } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import type { ProctoringEventBuffer } from '@/lib/proctoring/event-buffer';

interface TabGuardProps {
  buffer: ProctoringEventBuffer;
}

const BLOCKED_KEYS = new Set(['F12', 'PrintScreen']);
const BLOCKED_CTRL_KEYS = new Set(['c', 'v', 'p', 's', 'a', 'u']);
// Matches severity.ts's tab_switch high-severity cutoff (duration > 15s) — escalating right
// after that threshold means the "high" event's own duration is already correctly classified
// server-side without needing to guess a client-side severity.
const HIGH_SEVERITY_MS = 16_000;

export function TabGuard({ buffer }: TabGuardProps) {
  const { addViolation } = useProctoringStore();

  useEffect(() => {
    let hiddenAt: string | null = null;
    let blurredAt: string | null = null;
    let escalateTimer: ReturnType<typeof setTimeout> | null = null;

    function emitTabSwitch(startedAt: string, description: string) {
      buffer.emit({
        type: 'tab_switch',
        severity: 'medium',
        confidence: 1,
        timestamp: startedAt,
        endedAt: new Date().toISOString(),
        description,
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = new Date().toISOString();
        addViolation({ type: 'tab_switch', timestamp: hiddenAt, description: 'Tab switch detected' });
        emitTabSwitch(hiddenAt, 'Student switched browser tab or minimized window');
        escalateTimer = setTimeout(() => {
          if (hiddenAt) emitTabSwitch(hiddenAt, 'Student has been away from the exam tab for an extended period');
        }, HIGH_SEVERITY_MS);
      } else {
        if (escalateTimer !== null) {
          clearTimeout(escalateTimer);
          escalateTimer = null;
        }
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
      if (escalateTimer !== null) clearTimeout(escalateTimer);
    };
  }, [buffer, addViolation]);

  return null;
}
