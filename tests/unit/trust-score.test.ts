import { describe, it, expect } from 'vitest';
import { computeTrustScore, TRUST_WEIGHTS, SEVERITY_MULTIPLIER, type TrustScoreInput } from '@/lib/trust-score';

const T0 = '2026-07-11T10:00:00.000Z';

function v(overrides: Partial<TrustScoreInput> = {}): TrustScoreInput {
  return { type: 'tab_switch', severity: 'medium', timestamp: T0, ...overrides };
}

describe('computeTrustScore', () => {
  it('returns 100 for a clean attempt', () => {
    expect(computeTrustScore([])).toBe(100);
  });

  it('deducts base × severity for a single instantaneous event', () => {
    // tab_switch medium: 5 × 1 = 5
    expect(computeTrustScore([v()])).toBe(95);
    // tab_switch low: 5 × 0.75 = 3.75 → round(96.25) = 96
    expect(computeTrustScore([v({ severity: 'low' })])).toBe(96);
    // phone_detected high: 18 × 1.5 = 27
    expect(computeTrustScore([v({ type: 'phone_detected', severity: 'high' })])).toBe(73);
  });

  it('scales deduction by detector confidence', () => {
    // multiple_faces high at 0.5 confidence: 15 × 1.5 × 0.5 = 11.25 → 89
    expect(computeTrustScore([v({ type: 'multiple_faces', severity: 'high', confidence: 0.5 })])).toBe(89);
  });

  it('treats missing confidence as 1 and clamps out-of-range values', () => {
    const full = computeTrustScore([v({ type: 'no_face', confidence: null })]);
    const over = computeTrustScore([v({ type: 'no_face', confidence: 5 })]);
    expect(full).toBe(over);
    expect(computeTrustScore([v({ type: 'no_face', confidence: -1 })])).toBe(100);
  });

  it('weights episodes by duration, capped at 3x', () => {
    // 30s no_face episode: 8 × 1 × (1 + 30/30) = 16 → 84
    expect(
      computeTrustScore([v({ type: 'no_face', endedAt: '2026-07-11T10:00:30.000Z' })]),
    ).toBe(84);
    // 10-minute episode would be 21x — capped at 3x: 8 × 3 = 24 → 76
    expect(
      computeTrustScore([v({ type: 'no_face', endedAt: '2026-07-11T10:10:00.000Z' })]),
    ).toBe(76);
  });

  it('ignores invalid or negative durations', () => {
    expect(computeTrustScore([v({ endedAt: '2026-07-11T09:00:00.000Z' })])).toBe(95);
    expect(computeTrustScore([v({ endedAt: 'not-a-date' })])).toBe(95);
  });

  it('caps each type so one noisy detector cannot zero the score alone', () => {
    // 20 gaze_away mediums = 60 raw, but gaze cap is 15 → 85
    const gazeSpam = Array.from({ length: 20 }, () => v({ type: 'gaze_away' }));
    expect(computeTrustScore(gazeSpam)).toBe(100 - TRUST_WEIGHTS.gaze_away.cap);
  });

  it('sums across types after per-type caps and floors at 0', () => {
    const everything: TrustScoreInput[] = (Object.keys(TRUST_WEIGHTS) as (keyof typeof TRUST_WEIGHTS)[])
      .flatMap(type => Array.from({ length: 30 }, () => v({ type, severity: 'high' })));
    expect(computeTrustScore(everything)).toBe(0);
  });

  it('skips unknown violation types without crashing', () => {
    const withUnknown = [v(), { ...v(), type: 'future_signal' as TrustScoreInput['type'] }];
    expect(computeTrustScore(withUnknown)).toBe(95);
  });

  it('severity multipliers are ordered low < medium < high', () => {
    expect(SEVERITY_MULTIPLIER.low).toBeLessThan(SEVERITY_MULTIPLIER.medium);
    expect(SEVERITY_MULTIPLIER.medium).toBeLessThan(SEVERITY_MULTIPLIER.high);
  });
});
