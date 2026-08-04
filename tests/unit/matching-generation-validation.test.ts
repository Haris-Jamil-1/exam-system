import { describe, it, expect } from 'vitest';
import { isStructurallyValidMatchingBatch } from '@/lib/ai/claude-generator';

// Live-DB audit found 16 real AI-generated matching Items with a fully populated
// correctAnswer array but zero Option rows — the model returned correctAnswer (right-hand
// labels) without options (left-hand terms), which the zod schema's `options?.optional()`
// silently allowed since other types legitimately have no options at all. These items
// persisted as broken, unusable matching questions with no error anywhere. This function is
// the guard that makes callClaude() reject-and-retry that shape instead of accepting it.

describe('isStructurallyValidMatchingBatch', () => {
  it('accepts a batch where every item has options and correctAnswer of equal length', () => {
    const items = [
      { options: ['A', 'B', 'C'], correctAnswer: ['1', '2', '3'] },
      { options: ['X', 'Y'], correctAnswer: ['a', 'b'] },
    ];
    expect(isStructurallyValidMatchingBatch(items)).toBe(true);
  });

  it('rejects an item with correctAnswer populated but options missing (the real production bug)', () => {
    const items = [
      { correctAnswer: ['Definition one', 'Definition two', 'Definition three', 'Definition four'] },
    ];
    expect(isStructurallyValidMatchingBatch(items)).toBe(false);
  });

  it('rejects an item whose options and correctAnswer lengths do not match', () => {
    const items = [
      { options: ['A', 'B', 'C'], correctAnswer: ['1', '2'] },
    ];
    expect(isStructurallyValidMatchingBatch(items)).toBe(false);
  });

  it('rejects correctAnswer as a bare string instead of an array', () => {
    const items = [
      { options: ['A', 'B'], correctAnswer: 'not an array' },
    ];
    expect(isStructurallyValidMatchingBatch(items)).toBe(false);
  });

  it('rejects options with fewer than 2 entries', () => {
    const items = [
      { options: ['A'], correctAnswer: ['1'] },
    ];
    expect(isStructurallyValidMatchingBatch(items)).toBe(false);
  });

  it('rejects the whole batch if any single item in it is malformed', () => {
    const items = [
      { options: ['A', 'B'], correctAnswer: ['1', '2'] },
      { correctAnswer: ['x', 'y', 'z'] },
    ];
    expect(isStructurallyValidMatchingBatch(items)).toBe(false);
  });

  it('accepts an empty batch vacuously', () => {
    expect(isStructurallyValidMatchingBatch([])).toBe(true);
  });
});
