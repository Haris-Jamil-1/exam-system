// Trust score v2 (Phase 3, doc 01): severity-, duration- and confidence-weighted,
// with per-type deduction caps so one noisy detector can't zero a score alone.
// Server-side only — inputs are persisted Violation rows; the client never
// computes, sends, or influences this value (C3/C4 invariants from 2026-06-25).
//
//   score = 100 − Σ_types min( Σ_events weight×sev×duration×confidence, typeCap )
//
// Weights live here (server config), so tuning never requires a client update.

export type TrustViolationType =
  | 'tab_switch'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'no_face'
  | 'multiple_faces'
  | 'audio_detected'
  | 'phone_detected'
  | 'gaze_away'
  | 'prohibited_object'
  | 'unverified_start';

export interface TrustScoreInput {
  type: TrustViolationType;
  severity: 'low' | 'medium' | 'high';
  /** Detector confidence 0..1; deterministic signals (tab switch) are 1. */
  confidence?: number | null;
  /** Episode start. */
  timestamp: Date | string;
  /** Episode end; null/undefined = instantaneous event. */
  endedAt?: Date | string | null;
}

interface TypeWeight {
  base: number;
  /** Max total deduction this type can contribute across the whole attempt. */
  cap: number;
}

export const TRUST_WEIGHTS: Record<TrustViolationType, TypeWeight> = {
  tab_switch:        { base: 5,  cap: 25 },
  window_blur:       { base: 3,  cap: 15 },
  fullscreen_exit:   { base: 6,  cap: 25 },
  no_face:           { base: 8,  cap: 30 },
  multiple_faces:    { base: 15, cap: 40 },
  audio_detected:    { base: 4,  cap: 15 },
  phone_detected:    { base: 18, cap: 50 },
  gaze_away:         { base: 3,  cap: 15 },
  prohibited_object: { base: 12, cap: 40 },
  // One-time deduction (cap = base × high multiplier): skipping identity verification
  // costs 12 points once; it can't stack, since it happens at most once per gate.
  unverified_start:  { base: 8,  cap: 12 },
};

export const SEVERITY_MULTIPLIER: Record<'low' | 'medium' | 'high', number> = {
  low: 0.75,
  medium: 1,
  high: 1.5,
};

// Episodes get heavier with duration: +1x per 30s of sustained violation, capped
// so a single very long episode maxes out at 3x its base deduction.
const DURATION_FACTOR_CAP = 3;

function durationFactor(input: TrustScoreInput): number {
  if (!input.endedAt) return 1;
  const start = new Date(input.timestamp).getTime();
  const end = new Date(input.endedAt).getTime();
  const seconds = (end - start) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return 1;
  return Math.min(1 + seconds / 30, DURATION_FACTOR_CAP);
}

export function computeTrustScore(violations: TrustScoreInput[]): number {
  const perType = new Map<TrustViolationType, number>();

  for (const v of violations) {
    const weight = TRUST_WEIGHTS[v.type];
    if (!weight) continue; // unknown type (future enum value): no deduction
    const confidence = Math.min(Math.max(v.confidence ?? 1, 0), 1);
    const deduction =
      weight.base * SEVERITY_MULTIPLIER[v.severity] * durationFactor(v) * confidence;
    perType.set(v.type, (perType.get(v.type) ?? 0) + deduction);
  }

  let total = 0;
  for (const [type, sum] of perType) {
    total += Math.min(sum, TRUST_WEIGHTS[type].cap);
  }

  return Math.round(Math.min(Math.max(100 - total, 0), 100));
}
