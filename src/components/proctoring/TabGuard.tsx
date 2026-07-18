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
    let blurEmitted = false;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
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
        // A tab-hide always fires blur first — the tab_switch episode owns it entirely.
        // Clearing the pending blur here (not checking hiddenAt on focus) is what prevents
        // the duplicate: on return, visibilitychange(visible) fires BEFORE focus and used to
        // reset hiddenAt, so the old `!hiddenAt` guard in handleFocus passed and every single
        // tab switch also produced a bogus window_blur violation.
        blurredAt = null;
        blurEmitted = false;
        if (blurTimer !== null) { clearTimeout(blurTimer); blurTimer = null; }
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

    function emitWindowBlur(startedAt: string, endedAt: string | null) {
      addViolation({ type: 'window_blur', timestamp: startedAt, description: 'Window blur detected' });
      buffer.emit({
        type: 'window_blur',
        severity: 'low',
        confidence: 1,
        timestamp: startedAt,
        endedAt,
        description: 'Browser window lost focus',
      });
    }

    function handleBlur() {
      blurredAt = new Date().toISOString();
      blurEmitted = false;
      // Blur fires before visibilitychange on a tab-hide, so we can't yet tell a genuine
      // focus-loss (another window/monitor, DevTools) from the start of a tab switch. Wait a
      // beat: if the document is still visible, it's a real window_blur — emit it now rather
      // than only on refocus, so a student who never refocuses before the exam ends still
      // produces a record (the same lost-forever bug TabGuard's own tab-hide path once had).
      if (blurTimer !== null) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (blurredAt && document.visibilityState === 'visible' && !hiddenAt) {
          blurEmitted = true;
          emitWindowBlur(blurredAt, null);
        }
      }, 1_000);
    }

    function handleFocus() {
      if (blurTimer !== null) { clearTimeout(blurTimer); blurTimer = null; }
      // A sub-second blur that ended before the timer fired: still a real (brief) focus loss —
      // emit once with its duration. If the timer already emitted, don't emit a duplicate.
      if (blurredAt && !blurEmitted && document.visibilityState === 'visible' && !hiddenAt) {
        emitWindowBlur(blurredAt, new Date().toISOString());
      }
      blurredAt = null;
      blurEmitted = false;
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
      if (blurTimer !== null) clearTimeout(blurTimer);
    };
  }, [buffer, addViolation]);

  return null;
}
