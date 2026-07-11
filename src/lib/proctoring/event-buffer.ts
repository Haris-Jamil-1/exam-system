// Client-side proctoring event pipeline (Phase 3, doc 01).
// Detectors emit events into this buffer; the buffer batches them to
// POST /api/violations every FLUSH_INTERVAL_MS, at MAX_BATCH events, or
// immediately on a high-severity event. Pending events and the clientSeq
// counter are mirrored to sessionStorage so a mid-exam refresh loses nothing.
// The buffer never computes trust — it only produces evidence (server authority).
import type { ViolationType } from '@/types';

export interface ProctoringClientEvent {
  type: ViolationType | 'heartbeat';
  severity?: 'low' | 'medium' | 'high';
  confidence?: number;
  timestamp: string;
  endedAt?: string | null;
  description?: string;
  screenshotUrl?: string;
  metadata?: Record<string, unknown>;
}

interface QueuedEvent extends ProctoringClientEvent {
  clientSeq: number;
}

const FLUSH_INTERVAL_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_BATCH = 20;
// Hard cap on queued events (network down): oldest low-priority events drop first.
const MAX_QUEUE = 200;

export class ProctoringEventBuffer {
  private examId: string;
  private attemptId: string | null;
  private queue: QueuedEvent[] = [];
  private seq = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private disposed = false;

  constructor(examId: string, attemptId: string | null) {
    this.examId = examId;
    this.attemptId = attemptId && attemptId !== 'attempt-loading' ? attemptId : null;
    this.restore();
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
    this.heartbeatTimer = setInterval(() => {
      this.emit({ type: 'heartbeat', timestamp: new Date().toISOString() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** The attempt may not exist yet when the overlay first mounts. */
  setAttemptId(attemptId: string) {
    if (attemptId && attemptId !== 'attempt-loading') {
      this.attemptId = attemptId;
      this.restore();
    }
  }

  emit(event: ProctoringClientEvent) {
    if (this.disposed) return;
    const queued: QueuedEvent = { ...event, clientSeq: ++this.seq };
    this.queue.push(queued);
    if (this.queue.length > MAX_QUEUE) {
      const dropIdx = this.queue.findIndex(e => e.severity !== 'high');
      this.queue.splice(dropIdx === -1 ? 0 : dropIdx, 1);
    }
    this.persist();
    if (event.severity === 'high' || this.queue.length >= MAX_BATCH) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.attemptId || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.slice(0, MAX_BATCH * 2);
    try {
      const res = await fetch('/api/violations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          attemptId: this.attemptId,
          examId: this.examId,
          events: batch.map(e => ({ severity: 'low', description: '', ...e })),
        }),
      });
      if (res.ok) {
        this.queue = this.queue.slice(batch.length);
        this.persist();
      }
      // Non-2xx: keep events queued; the next tick retries.
    } catch {
      // Network failure: keep events queued for retry.
    } finally {
      this.flushing = false;
    }
  }

  dispose() {
    this.disposed = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    void this.flush();
  }

  private storageKey() {
    return `proctoring-buffer:${this.attemptId ?? this.examId}`;
  }

  private persist() {
    try {
      sessionStorage.setItem(
        this.storageKey(),
        JSON.stringify({ seq: this.seq, queue: this.queue.filter(e => e.type !== 'heartbeat') }),
      );
    } catch {
      // Storage full/unavailable — in-memory queue still works for this page life.
    }
  }

  private restore() {
    try {
      const raw = sessionStorage.getItem(this.storageKey());
      if (!raw) return;
      const saved = JSON.parse(raw) as { seq: number; queue: QueuedEvent[] };
      this.seq = Math.max(this.seq, saved.seq ?? 0);
      if (Array.isArray(saved.queue) && saved.queue.length > 0) {
        const have = new Set(this.queue.map(e => e.clientSeq));
        this.queue = [...saved.queue.filter(e => !have.has(e.clientSeq)), ...this.queue];
      }
    } catch {
      // Corrupt saved state — start clean.
    }
  }
}
