'use client';
// Supabase Realtime subscription for the teacher monitor (Phase 3, doc 04).
// Replaces blind 10s polling: postgres_changes on the RLS-gated tables act as
// refresh triggers (the page refetches through its existing server actions, so
// there is exactly one row-shape source of truth). Falls back to the caller's
// polling when the websocket can't connect — `live` tells the page which mode
// it's in. Refreshes are debounced: 60 students' heartbeats must not turn into
// 60 refetches.
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UseMonitorRealtimeOptions {
  examId: string;
  onRefresh: () => void;
  /** Fired for each incoming high-severity violation (alerting, decision 12). */
  onHighSeverity?: (violation: { type: string; description: string; studentId: string }) => void;
}

const DEBOUNCE_MS = 2_000;

export function useMonitorRealtime({ examId, onRefresh, onHighSeverity }: UseMonitorRealtimeOptions) {
  const [live, setLive] = useState(false);
  // Keep latest callbacks without resubscribing the channel on each render.
  const refreshRef = useRef(onRefresh);
  const highRef = useRef(onHighSeverity);
  useEffect(() => {
    refreshRef.current = onRefresh;
    highRef.current = onHighSeverity;
  }, [onRefresh, onHighSeverity]);

  useEffect(() => {
    const supabase = createClient();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        refreshRef.current();
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`monitor:${examId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Violation', filter: `examId=eq.${examId}` },
        payload => {
          const row = payload.new as { severity: string; type: string; description: string; studentId: string };
          if (row.severity === 'high') {
            highRef.current?.(row);
          }
          scheduleRefresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ExamAttempt', filter: `examId=eq.${examId}` },
        scheduleRefresh,
      )
      // Heartbeats/directives carry no examId column to filter on; RLS scopes
      // them to the caller's institution and they only ever trigger a refetch.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ProctoringHeartbeat' },
        scheduleRefresh,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'MonitorDirective' },
        scheduleRefresh,
      )
      .subscribe(status => {
        setLive(status === 'SUBSCRIBED');
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
      setLive(false);
    };
  }, [examId]);

  return { live };
}
