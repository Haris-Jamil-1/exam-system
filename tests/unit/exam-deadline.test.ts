import { describe, it, expect } from 'vitest';
import { computeSubmissionDeadline, isPastDeadline } from '@/lib/exam-deadline';

describe('computeSubmissionDeadline', () => {
  it('resolves to the duration limit when it is sooner than the availability close', () => {
    // Exam closes far in the future; a 60-minute duration should win.
    const startedAt = new Date('2026-07-16T09:00:00.000Z');
    const endTime = new Date('2026-07-16T18:00:00.000Z');
    const deadline = computeSubmissionDeadline(startedAt, 60, endTime);
    expect(deadline.toISOString()).toBe('2026-07-16T10:00:00.000Z');
  });

  it('resolves to the availability close when it is sooner than the duration limit — spec example: 60-min duration, closes 12:00, starts 11:30 → deadline 12:00 (30 min in)', () => {
    const startedAt = new Date('2026-07-16T11:30:00.000Z');
    const endTime = new Date('2026-07-16T12:00:00.000Z');
    const deadline = computeSubmissionDeadline(startedAt, 60, endTime);
    expect(deadline.toISOString()).toBe('2026-07-16T12:00:00.000Z');
    expect(deadline.getTime() - startedAt.getTime()).toBe(30 * 60_000);
  });

  it('treats an exact tie as the shared deadline', () => {
    const startedAt = new Date('2026-07-16T11:00:00.000Z');
    const endTime = new Date('2026-07-16T12:00:00.000Z');
    const deadline = computeSubmissionDeadline(startedAt, 60, endTime);
    expect(deadline.toISOString()).toBe('2026-07-16T12:00:00.000Z');
  });
});

describe('isPastDeadline', () => {
  const deadline = new Date('2026-07-16T12:00:00.000Z');

  it('is false before the deadline', () => {
    expect(isPastDeadline(deadline, new Date('2026-07-16T11:59:59.000Z'))).toBe(false);
  });

  it('is false within the grace window just after the deadline', () => {
    expect(isPastDeadline(deadline, new Date('2026-07-16T12:00:03.000Z'))).toBe(false);
  });

  it('is true once the grace window has elapsed', () => {
    expect(isPastDeadline(deadline, new Date('2026-07-16T12:00:06.000Z'))).toBe(true);
  });

  it('is true well past the deadline', () => {
    expect(isPastDeadline(deadline, new Date('2026-07-16T13:00:00.000Z'))).toBe(true);
  });
});
