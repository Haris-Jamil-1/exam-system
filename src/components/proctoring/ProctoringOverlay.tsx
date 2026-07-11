'use client';
import { useEffect, useState } from 'react';
import { ProctoringEventBuffer } from '@/lib/proctoring/event-buffer';
import { TabGuard } from './TabGuard';
import { FullscreenGuard } from './FullscreenGuard';
import { AudioMonitor } from './AudioMonitor';
import { FaceDetector } from './FaceDetector';
import { ViolationAlert } from './ViolationAlert';

interface ProctoringOverlayProps {
  examId: string;
  attemptId: string;
}

export function ProctoringOverlay({ examId, attemptId }: ProctoringOverlayProps) {
  // One buffer per exam page life — all detectors emit through it, it batches
  // to POST /api/violations and carries the 30s heartbeat. Lazy state, not a
  // ref: this repo's React Compiler rules forbid ref access during render.
  const [buffer] = useState(() => new ProctoringEventBuffer(examId, attemptId));

  useEffect(() => {
    buffer.setAttemptId(attemptId);
  }, [buffer, attemptId]);

  useEffect(() => {
    const flushOnHide = () => void buffer.flush();
    // pagehide fires on tab close/navigation — last chance to flush (keepalive fetch).
    window.addEventListener('pagehide', flushOnHide);
    return () => {
      window.removeEventListener('pagehide', flushOnHide);
      buffer.dispose();
    };
  }, [buffer]);

  return (
    <>
      <TabGuard buffer={buffer} />
      <FullscreenGuard buffer={buffer} />
      <AudioMonitor buffer={buffer} />
      <FaceDetector buffer={buffer} />
      <ViolationAlert />
    </>
  );
}
