import { describe, it, expect } from 'vitest';
import { computeEffectiveExamStatus } from '@/lib/exam-status';

const NOW = new Date('2026-07-17T12:00:00Z');
const PAST = new Date('2026-07-17T11:00:00Z');
const FUTURE = new Date('2026-07-17T13:00:00Z');

describe('computeEffectiveExamStatus (Task 1 — exam does not auto-start on the teacher side)', () => {
  it('a scheduled exam whose startTime has passed reads as live', () => {
    expect(computeEffectiveExamStatus('scheduled', PAST, NOW)).toBe('live');
  });

  it('a scheduled exam whose startTime has not arrived yet stays scheduled', () => {
    expect(computeEffectiveExamStatus('scheduled', FUTURE, NOW)).toBe('scheduled');
  });

  it('a scheduled exam starting exactly now reads as live (inclusive boundary)', () => {
    expect(computeEffectiveExamStatus('scheduled', NOW, NOW)).toBe('live');
  });

  it('an already-live exam stays live regardless of startTime', () => {
    expect(computeEffectiveExamStatus('live', FUTURE, NOW)).toBe('live');
  });

  it('a completed exam is never resurrected to live', () => {
    expect(computeEffectiveExamStatus('completed', PAST, NOW)).toBe('completed');
  });

  it('a draft exam never auto-starts even if its startTime has passed — draft is an explicit teacher action, not a scheduling state', () => {
    expect(computeEffectiveExamStatus('draft', PAST, NOW)).toBe('draft');
  });
});

describe('computeEffectiveExamStatus (exam does not auto-complete on the teacher side when closing time is reached)', () => {
  it('a live exam whose endTime has passed reads as completed', () => {
    expect(computeEffectiveExamStatus('live', PAST, NOW, PAST)).toBe('completed');
  });

  it('a live exam whose endTime has not arrived yet stays live', () => {
    expect(computeEffectiveExamStatus('live', PAST, NOW, FUTURE)).toBe('live');
  });

  it('a live exam ending exactly now reads as completed (inclusive boundary)', () => {
    expect(computeEffectiveExamStatus('live', PAST, NOW, NOW)).toBe('completed');
  });

  it('a scheduled exam whose endTime has already passed reads as completed, not live, even though startTime has also passed', () => {
    expect(computeEffectiveExamStatus('scheduled', PAST, NOW, PAST)).toBe('completed');
  });

  it('an already-completed exam stays completed regardless of endTime', () => {
    expect(computeEffectiveExamStatus('completed', PAST, NOW, FUTURE)).toBe('completed');
  });

  it('a draft exam never auto-completes even if endTime has passed — draft has no student-facing availability window', () => {
    expect(computeEffectiveExamStatus('draft', PAST, NOW, PAST)).toBe('draft');
  });

  it('omitting endTime (backward compatible) never auto-completes a live exam', () => {
    expect(computeEffectiveExamStatus('live', PAST, NOW)).toBe('live');
  });
});
