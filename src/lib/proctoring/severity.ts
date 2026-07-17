// Server-side severity derivation (Phase 3, doc 01): the client suggests a
// severity, but policy lives here so it can be tuned without shipping client
// updates. Duration-aware — sustained episodes escalate.
import type { ViolationType } from '@/types';

export type Severity = 'low' | 'medium' | 'high';

// Types that are high-severity regardless of duration — these are the
// snapshot-evidence + push-notification triggers (decisions 1 and 12).
const ALWAYS_HIGH: ReadonlySet<ViolationType> = new Set(['multiple_faces', 'phone_detected']);

/** Sustained no-face is a decision-1 high-severity flag from this many seconds. */
export const SUSTAINED_NO_FACE_SECONDS = 30;

export function deriveSeverity(
  type: ViolationType,
  durationSeconds: number | null,
  clientSeverity: Severity,
): Severity {
  if (ALWAYS_HIGH.has(type)) return 'high';
  const d = durationSeconds ?? 0;

  switch (type) {
    case 'tab_switch':
      return d > 15 ? 'high' : 'medium';
    case 'window_blur':
      return d > 15 ? 'medium' : 'low';
    case 'fullscreen_exit':
      return 'high';
    case 'no_face':
      return d >= SUSTAINED_NO_FACE_SECONDS ? 'high' : 'medium';
    case 'audio_detected':
      // Previously capped at 'medium' no matter how long it went on — genuinely sustained
      // background noise/talking (not a brief cough or chair scrape) is a real violation the
      // teacher should be pushed-notified about, same as the always-high vision signals.
      return d > 60 ? 'high' : d > 15 ? 'medium' : 'low';
    case 'gaze_away':
      // Same rationale as audio_detected — a truly sustained gaze-away (not a momentary glance)
      // was structurally incapable of ever reaching the push-notification/snapshot tier.
      return d > 60 ? 'high' : d > 20 ? 'medium' : 'low';
    case 'prohibited_object':
      return 'medium';
    default:
      // Unknown/future type: trust the client's suggestion rather than guessing.
      return clientSeverity;
  }
}

export function episodeDurationSeconds(
  startedAt: Date | string,
  endedAt: Date | string | null | undefined,
): number | null {
  if (!endedAt) return null;
  const seconds = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
