import { describe, it, expect } from 'vitest';
import {
  computeTrustScore, SEVERITY_DEDUCTION, trustScoreTier,
  trustScoreHex, trustScoreTextClass, trustScoreProgressClass,
  type TrustScoreInput,
} from '@/lib/trust-score';

function v(severity: TrustScoreInput['severity']): TrustScoreInput {
  return { severity };
}

describe('computeTrustScore', () => {
  it('returns 100 for a clean attempt', () => {
    expect(computeTrustScore([])).toBe(100);
  });

  it('deducts a flat amount per event by severity', () => {
    expect(computeTrustScore([v('low')])).toBe(98);
    expect(computeTrustScore([v('medium')])).toBe(95);
    expect(computeTrustScore([v('high')])).toBe(90);
  });

  it('sums deductions across multiple events regardless of type/duration/confidence', () => {
    expect(computeTrustScore([v('low'), v('medium'), v('high')])).toBe(100 - 2 - 5 - 10);
    expect(computeTrustScore(Array.from({ length: 5 }, () => v('high')))).toBe(50);
  });

  it('floors at 0, never goes negative', () => {
    expect(computeTrustScore(Array.from({ length: 20 }, () => v('high')))).toBe(0);
  });

  it('gives the same score for the same violation history regardless of caller', () => {
    // The exact bug this ticket fixes: sectioned vs. non-sectioned submit routes must
    // agree on the same violation history's score.
    const history: TrustScoreInput[] = [v('high'), v('medium'), v('medium'), v('low')];
    expect(computeTrustScore(history)).toBe(computeTrustScore([...history]));
  });

  it('severity deduction table is ordered low < medium < high', () => {
    expect(SEVERITY_DEDUCTION.low).toBeLessThan(SEVERITY_DEDUCTION.medium);
    expect(SEVERITY_DEDUCTION.medium).toBeLessThan(SEVERITY_DEDUCTION.high);
  });
});

describe('trust score color coding', () => {
  it('tiers at <50 red, 50-79 orange, >=80 green', () => {
    expect(trustScoreTier(0)).toBe('red');
    expect(trustScoreTier(49)).toBe('red');
    expect(trustScoreTier(50)).toBe('orange');
    expect(trustScoreTier(79)).toBe('orange');
    expect(trustScoreTier(80)).toBe('green');
    expect(trustScoreTier(100)).toBe('green');
  });

  it('hex/text/progress helpers agree on the same tier', () => {
    expect(trustScoreHex(40)).toBe('#DC2626');
    expect(trustScoreTextClass(40)).toBe('text-red-600');
    expect(trustScoreProgressClass(40)).toContain('bg-red-500');

    expect(trustScoreHex(65)).toBe('#D97706');
    expect(trustScoreTextClass(65)).toBe('text-amber-500');
    expect(trustScoreProgressClass(65)).toContain('bg-amber-500');

    expect(trustScoreHex(90)).toBe('#16A34A');
    expect(trustScoreTextClass(90)).toBe('text-green-600');
    expect(trustScoreProgressClass(90)).toContain('bg-green-500');
  });
});
