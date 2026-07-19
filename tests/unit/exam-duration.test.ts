import { describe, it, expect } from 'vitest';
import { computeExamDurationMinutes, MIN_EXAM_DURATION_MINUTES } from '@/lib/exam-duration';

describe('computeExamDurationMinutes', () => {
  it('derives whole minutes from a simple window', () => {
    expect(computeExamDurationMinutes('2026-07-20T09:00:00.000Z', '2026-07-20T10:00:00.000Z')).toBe(60);
  });

  it('accepts Date objects as well as ISO strings', () => {
    const start = new Date('2026-07-20T09:00:00.000Z');
    const end = new Date('2026-07-20T09:45:00.000Z');
    expect(computeExamDurationMinutes(start, end)).toBe(45);
  });

  it('rounds sub-minute windows to the nearest minute', () => {
    expect(computeExamDurationMinutes('2026-07-20T09:00:00.000Z', '2026-07-20T09:30:29.000Z')).toBe(30);
    expect(computeExamDurationMinutes('2026-07-20T09:00:00.000Z', '2026-07-20T09:30:31.000Z')).toBe(31);
  });

  it('spans day boundaries (multi-day availability window)', () => {
    expect(computeExamDurationMinutes('2026-07-20T23:00:00.000Z', '2026-07-21T01:00:00.000Z')).toBe(120);
  });

  it('returns null for a zero or negative window', () => {
    expect(computeExamDurationMinutes('2026-07-20T10:00:00.000Z', '2026-07-20T10:00:00.000Z')).toBeNull();
    expect(computeExamDurationMinutes('2026-07-20T10:00:00.000Z', '2026-07-20T09:00:00.000Z')).toBeNull();
  });

  it('returns null for unparsable inputs', () => {
    expect(computeExamDurationMinutes('not-a-date', '2026-07-20T10:00:00.000Z')).toBeNull();
    expect(computeExamDurationMinutes('2026-07-20T10:00:00.000Z', '')).toBeNull();
  });

  it('exposes a sane minimum-duration constant for validation call sites', () => {
    expect(MIN_EXAM_DURATION_MINUTES).toBeGreaterThan(0);
  });
});
