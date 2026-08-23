import { describe, it, expect } from 'vitest';
import { computeEssaySuggestedScore } from '@/lib/ai/essay-scoring';

describe('computeEssaySuggestedScore — normal scaling (no veto criteria)', () => {
  it('scales rubric points to the question\'s total marks', () => {
    const rubric = [
      { name: 'Content', maxPoints: 6 },
      { name: 'Structure', maxPoints: 4 },
    ];
    const scores = [
      { name: 'Content', points: 3 },
      { name: 'Structure', points: 4 },
    ];
    // 7/10 of rubricMax, scaled to maxMarks 20 -> 14
    expect(computeEssaySuggestedScore(rubric, scores, 20)).toEqual({ suggested: 14, vetoTriggered: false });
  });

  it('clamps an AI score above a criterion\'s own maxPoints instead of trusting it', () => {
    const rubric = [{ name: 'Content', maxPoints: 5 }];
    const scores = [{ name: 'Content', points: 999 }];
    expect(computeEssaySuggestedScore(rubric, scores, 10)).toEqual({ suggested: 10, vetoTriggered: false });
  });

  it('ignores a criterion score with no matching rubric entry', () => {
    const rubric = [{ name: 'Content', maxPoints: 10 }];
    const scores = [{ name: 'Content', points: 10 }, { name: 'Nonexistent', points: 100 }];
    expect(computeEssaySuggestedScore(rubric, scores, 10)).toEqual({ suggested: 10, vetoTriggered: false });
  });

  it('returns 0 for an empty rubric rather than dividing by zero', () => {
    expect(computeEssaySuggestedScore([], [], 10)).toEqual({ suggested: 0, vetoTriggered: false });
  });
});

describe('computeEssaySuggestedScore — Zero-Anchor / Veto criteria', () => {
  it('nullifies the whole score when a veto criterion is scored at exactly zero', () => {
    const rubric = [
      { name: 'Academic Integrity', maxPoints: 0, isVeto: true },
      { name: 'Content', maxPoints: 10 },
    ];
    const scores = [
      { name: 'Academic Integrity', points: 0 },
      { name: 'Content', points: 10 },
    ];
    expect(computeEssaySuggestedScore(rubric, scores, 20)).toEqual({ suggested: 0, vetoTriggered: true });
  });

  it('does not trigger when the veto criterion scores above zero', () => {
    const rubric = [
      { name: 'Academic Integrity', maxPoints: 0, isVeto: true },
      { name: 'Content', maxPoints: 10 },
    ];
    const scores = [
      { name: 'Academic Integrity', points: 1 },
      { name: 'Content', points: 10 },
    ];
    const result = computeEssaySuggestedScore(rubric, scores, 20);
    expect(result.vetoTriggered).toBe(false);
    expect(result.suggested).toBeGreaterThan(0);
  });

  it('a non-veto criterion scoring zero does not trigger the override', () => {
    const rubric = [
      { name: 'Content', maxPoints: 10 },
      { name: 'Structure', maxPoints: 10 },
    ];
    const scores = [
      { name: 'Content', points: 0 },
      { name: 'Structure', points: 10 },
    ];
    const result = computeEssaySuggestedScore(rubric, scores, 20);
    expect(result.vetoTriggered).toBe(false);
    expect(result.suggested).toBe(10);
  });

  it('is unaffected if the AI never returned a score for the veto criterion at all', () => {
    const rubric = [
      { name: 'Academic Integrity', maxPoints: 0, isVeto: true },
      { name: 'Content', maxPoints: 10 },
    ];
    const scores = [{ name: 'Content', points: 10 }];
    expect(computeEssaySuggestedScore(rubric, scores, 20)).toEqual({ suggested: 20, vetoTriggered: false });
  });
});
