'use client';
// Student-side receiver for teacher monitor actions (Phase 3, doc 04).
// Primary transport: Supabase Realtime INSERTs on MonitorDirective, scoped to
// this attempt by filter + RLS. Fallback: 20s polling of the same list — the
// monitor must keep working on networks that kill websockets.
//
// - snapshot: captures a frame via the shared captureRef (FaceDetector's
//   camera), uploads it, marks the directive fulfilled. The capture indicator
//   in the camera widget fires as part of capture (decision 3).
// - warning: shows a dismissible banner with the teacher's message.
// - force_submit: acknowledges, then triggers the exam page's submit flow.
// - time_extended: the teacher changed Exam.endTime mid-exam (2026-08-12). `message` carries
//   JSON {oldEndTime, newEndTime}; onEndTimeChanged lets the exam page resync its local `exam`
//   state and countdown. Only ever created for an in_progress attempt (see the server route),
//   so an already-submitted student never receives one.
import { useEffect, useState, type RefObject } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertTriangle } from 'lucide-react';

interface Directive {
  id: string;
  kind: 'snapshot' | 'warning' | 'force_submit' | 'time_extended';
  message: string | null;
  status: string;
}

interface DirectiveListenerProps {
  attemptId: string;
  captureRef: RefObject<(() => Promise<string | null>) | null>;
  onForceSubmit: () => void;
  onEndTimeChanged?: (newEndTimeIso: string) => void;
}

const POLL_MS = 20_000;

export function DirectiveListener({ attemptId, captureRef, onForceSubmit, onEndTimeChanged }: DirectiveListenerProps) {
  const [warning, setWarning] = useState<string | null>(null);
  const [timeChangeNotice, setTimeChangeNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!attemptId || attemptId === 'attempt-loading') return;
    const handled = new Set<string>();
    let cancelled = false;

    async function resolve(directiveId: string, status: 'fulfilled' | 'failed', resultPath?: string) {
      try {
        await fetch(`/api/monitor/directives/${directiveId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, ...(resultPath ? { resultPath } : {}) }),
        });
      } catch {
        // Lost acknowledgement — teacher-side polling will show it as pending; harmless.
      }
    }

    async function handleDirective(d: Directive) {
      if (cancelled || handled.has(d.id) || d.status !== 'pending') return;
      handled.add(d.id);

      if (d.kind === 'snapshot') {
        const capture = captureRef.current;
        const path = capture ? await capture() : null;
        await resolve(d.id, path ? 'fulfilled' : 'failed', path ?? undefined);
      } else if (d.kind === 'warning') {
        setWarning(d.message ?? 'Please follow the exam rules.');
        await resolve(d.id, 'fulfilled');
      } else if (d.kind === 'force_submit') {
        await resolve(d.id, 'fulfilled');
        onForceSubmit();
      } else if (d.kind === 'time_extended') {
        await resolve(d.id, 'fulfilled');
        try {
          const payload = JSON.parse(d.message ?? '{}') as { oldEndTime?: string; newEndTime?: string };
          if (payload.newEndTime) {
            onEndTimeChanged?.(payload.newEndTime);
            const deltaMin = payload.oldEndTime
              ? Math.round((new Date(payload.newEndTime).getTime() - new Date(payload.oldEndTime).getTime()) / 60000)
              : null;
            setTimeChangeNotice(
              deltaMin === null ? 'Your teacher changed the exam end time.'
              : deltaMin > 0 ? `Your teacher extended the exam by ${deltaMin} minute${deltaMin === 1 ? '' : 's'}.`
              : deltaMin < 0 ? `Your teacher reduced the exam time by ${Math.abs(deltaMin)} minute${Math.abs(deltaMin) === 1 ? '' : 's'}.`
              : 'Your teacher updated the exam end time.'
            );
          }
        } catch {
          // Malformed payload — nothing to apply; the directive is still marked fulfilled above
          // so it isn't retried forever.
        }
      }
    }

    async function poll() {
      try {
        const res = await fetch(`/api/monitor/directives?attemptId=${attemptId}`);
        if (!res.ok) return;
        const list = (await res.json()) as Directive[];
        for (const d of list) await handleDirective(d);
      } catch {
        // Offline — next poll retries.
      }
    }

    const supabase = createClient();
    const channel = supabase
      .channel(`directives:${attemptId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'MonitorDirective', filter: `attemptId=eq.${attemptId}` },
        payload => { void handleDirective(payload.new as Directive); },
      )
      .subscribe();

    void poll();
    const pollTimer = setInterval(() => void poll(), POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, [attemptId, captureRef, onForceSubmit, onEndTimeChanged]);

  if (!warning && !timeChangeNotice) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[60] flex flex-col">
      {timeChangeNotice && (
        <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-center gap-3 shadow-lg">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{timeChangeNotice}</p>
          <button
            onClick={() => setTimeChangeNotice(null)}
            className="ms-4 text-xs underline underline-offset-2 opacity-90 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}
      {warning && (
        <div className="bg-amber-500 text-white px-4 py-3 flex items-center justify-center gap-3 shadow-lg">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">Proctor warning: {warning}</p>
          <button
            onClick={() => setWarning(null)}
            className="ms-4 text-xs underline underline-offset-2 opacity-90 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
