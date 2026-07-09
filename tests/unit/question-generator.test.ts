import { describe, it, expect } from 'vitest';
import { generateQuestions } from '@/lib/ai/question-generator';
import { MAX_BATCH_SIZE } from '@/lib/ai/constants';

describe('generateQuestions — honors the requested count (item 7: batch-controlled generation)', () => {
  it('returns exactly `count` items even when it exceeds the canned pool size', () => {
    const result = generateQuestions({ text: 'sample material', count: MAX_BATCH_SIZE, difficulty: 'medium', type: 'mcq' });
    expect(result).toHaveLength(MAX_BATCH_SIZE);
  });

  it('returns exactly 1 item for count=1', () => {
    const result = generateQuestions({ text: 'sample material', count: 1, difficulty: 'easy', type: 'mcq' });
    expect(result).toHaveLength(1);
  });

  it('cycles the pool with a distinguishing "(variant N)" suffix once exhausted, not literal duplicates', () => {
    const result = generateQuestions({ text: 'sample material', count: 12, difficulty: 'medium', type: 'mcq' });
    const stems = result.map(q => q.stem);
    // No two generated stems should be byte-identical even though the underlying pool is smaller than 12
    expect(new Set(stems).size).toBe(stems.length);
  });

  it('does not mutate the underlying canned pool between calls (each call gets a fresh copy)', () => {
    const first = generateQuestions({ text: 'x', count: 3, difficulty: 'medium', type: 'mcq' });
    const second = generateQuestions({ text: 'x', count: 3, difficulty: 'medium', type: 'mcq' });
    expect(first.map(q => q.stem)).toEqual(second.map(q => q.stem));
  });
});

describe('generateQuestions — CLO text is folded into the explanation when provided', () => {
  it('appends "[Aligned to CLO: ...]" to every generated item when cloText is set', () => {
    const result = generateQuestions({ text: 'sample material', count: 3, difficulty: 'medium', type: 'mcq', cloText: 'Explain Big-O notation' });
    for (const q of result) {
      expect(q.explanation).toContain('[Aligned to CLO: Explain Big-O notation]');
    }
  });

  it('leaves explanation untouched when no cloText is provided', () => {
    const withClo = generateQuestions({ text: 'sample material', count: 1, difficulty: 'medium', type: 'mcq', cloText: 'Some objective' });
    const withoutClo = generateQuestions({ text: 'sample material', count: 1, difficulty: 'medium', type: 'mcq' });
    expect(withClo[0].explanation).not.toEqual(withoutClo[0].explanation);
    expect(withoutClo[0].explanation).not.toContain('[Aligned to CLO');
  });
});
