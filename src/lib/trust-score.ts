// Trust score: flat, severity-based deduction. Every violation event costs a fixed
// amount off 100 by its own severity — Low -2, Medium -5, High -10 — summed across
// the whole attempt and clamped to [0, 100]. One shared function, called by both the
// flat and sectioned submit routes (and force-finalize) so the same violation history
// can never produce two different scores depending on which route finalized the attempt.
// Server-side only — inputs are persisted Violation rows; the client never computes,
// sends, or influences this value (C3/C4 invariants from 2026-06-25).

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
  severity: 'low' | 'medium' | 'high';
  type?: TrustViolationType;
  confidence?: number | null;
  timestamp?: Date | string;
  endedAt?: Date | string | null;
}

export const SEVERITY_DEDUCTION: Record<'low' | 'medium' | 'high', number> = {
  low: 2,
  medium: 5,
  high: 10,
};

export function computeTrustScore(violations: TrustScoreInput[]): number {
  const total = violations.reduce((sum, v) => sum + (SEVERITY_DEDUCTION[v.severity] ?? 0), 0);
  return Math.round(Math.min(Math.max(100 - total, 0), 100));
}

// ── Shared color coding ─────────────────────────────────────────────────────────
// Every view that renders a trust score (Live Monitor roster, per-exam monitor,
// Students tab, results table, the student's own complete page, the monitor modal)
// must derive its color from this, not its own inline threshold — same score, same
// color, everywhere. Thresholds: <50 red, 50-79 orange, >=80 green.

export type TrustScoreTier = 'red' | 'orange' | 'green';

export function trustScoreTier(score: number): TrustScoreTier {
  if (score < 50) return 'red';
  if (score < 80) return 'orange';
  return 'green';
}

const TIER_HEX: Record<TrustScoreTier, string> = {
  red: '#DC2626',
  orange: '#D97706',
  green: '#16A34A',
};

const TIER_TEXT_CLASS: Record<TrustScoreTier, string> = {
  red: 'text-red-600',
  orange: 'text-amber-500',
  green: 'text-green-600',
};

const TIER_PROGRESS_CLASS: Record<TrustScoreTier, string> = {
  red: '[&>div]:bg-red-500',
  orange: '[&>div]:bg-amber-500',
  green: '[&>div]:bg-green-500',
};

/** Hex color for inline styles (e.g. a progress bar's backgroundColor). */
export function trustScoreHex(score: number): string {
  return TIER_HEX[trustScoreTier(score)];
}

/** Tailwind text color class. */
export function trustScoreTextClass(score: number): string {
  return TIER_TEXT_CLASS[trustScoreTier(score)];
}

/** Tailwind class to color a shadcn `<Progress>` bar's inner div. */
export function trustScoreProgressClass(score: number): string {
  return TIER_PROGRESS_CLASS[trustScoreTier(score)];
}
