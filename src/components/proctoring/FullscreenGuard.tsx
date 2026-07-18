'use client';
// Fullscreen enforcement (not just logging): the exam is expected to run fullscreen the whole
// time. Leaving fullscreen emits a violation AND raises a blocking overlay that covers the
// exam UI until the student re-enters. The overlay's button call runs inside a real user
// gesture, which is the only context browsers allow requestFullscreen() from — the old
// mount-time request ran outside transient activation, so it was routinely rejected by the
// browser and logged a false "Fullscreen denied" violation the student never caused, after
// which nothing was ever enforced.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize2 } from 'lucide-react';
import { useProctoringStore } from '@/store/proctoringStore';
import type { ProctoringEventBuffer } from '@/lib/proctoring/event-buffer';

interface FullscreenGuardProps {
  buffer: ProctoringEventBuffer;
}

export function FullscreenGuard({ buffer }: FullscreenGuardProps) {
  const { addViolation } = useProctoringStore();
  // Browsers without the Fullscreen API (or with it disallowed) can't be enforced — the guard
  // stays inert rather than bricking the exam behind an overlay that can never be dismissed.
  const [supported] = useState(
    () => typeof document !== 'undefined'
      && !!document.documentElement.requestFullscreen
      && document.fullscreenEnabled !== false,
  );
  const [needsFullscreen, setNeedsFullscreen] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let everFullscreen = false;

    // Best-effort initial entry: the click that started the exam usually still counts as
    // transient activation for a moment. If the browser rejects it (activation expired),
    // that is NOT a student action — no violation; the blocking overlay prompts instead.
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        setNeedsFullscreen(true);
      });
    }

    function handleFullscreenChange() {
      if (document.fullscreenElement) {
        everFullscreen = true;
        setNeedsFullscreen(false);
        return;
      }
      setNeedsFullscreen(true);
      // Only an exit from a previously-entered fullscreen is a student action worth a
      // violation — the initial not-yet-entered state is handled by the overlay alone.
      if (everFullscreen) {
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
  }, [buffer, addViolation, supported]);

  if (!supported || !needsFullscreen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/95 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-red-500/15 border-2 border-red-500 flex items-center justify-center mx-auto">
          <Maximize2 className="h-7 w-7 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-white">Fullscreen Required</h2>
        <p className="text-sm text-slate-400">
          This exam must be taken in fullscreen mode. Leaving fullscreen is recorded as a
          violation and reported to your instructor. Return to fullscreen to continue.
        </p>
        <Button
          className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
          onClick={() => {
            document.documentElement.requestFullscreen().catch(() => {
              // Rejected even inside a gesture (rare) — keep the overlay up; clicking again retries.
            });
          }}
        >
          <Maximize2 className="h-4 w-4" /> Return to Fullscreen
        </Button>
      </div>
    </div>
  );
}
