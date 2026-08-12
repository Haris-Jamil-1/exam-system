// Pre-exam media gate: pure decision logic for "is the camera AND microphone actually
// usable right now". Deliberately free of React/DOM APIs so every branch is unit-testable
// without a component harness — this repo has no React component test setup and does not add
// one (see the Phase 7.1 entry in CLAUDE.md); the same pattern as exam-start-errors.ts.
//
// The two questions this file answers:
//  1. getUserMedia threw — WHICH device, and WHY (denied vs. no device vs. busy)? A generic
//     "camera error" is useless to a student who can actually fix the problem.
//  2. A stream exists — is it genuinely alive? A granted permission is not proof of a working
//     device: a track can be `ended` (unplugged / permission revoked mid-session), `muted`
//     (OS-level mute, no data flowing at all), disabled, or live-but-producing-nothing.

export type MediaDeviceKind = 'camera' | 'microphone';

export type MediaFailureReason =
  /** User (or an admin policy / browser setting) refused access. */
  | 'denied'
  /** Permission prompt closed without a choice — retriable, unlike a hard denial. */
  | 'dismissed'
  /** No such device is attached at all. */
  | 'no_device'
  /** Device exists but another application holds it. */
  | 'device_in_use'
  /** Page isn't a secure context, so getUserMedia is unavailable. */
  | 'insecure_context'
  /** Browser has no getUserMedia at all. */
  | 'unsupported'
  /** Track reached readyState 'ended' — unplugged, or permission revoked after grant. */
  | 'track_ended'
  /** Track is muted at the source: it exists and is "live" but delivers no data. */
  | 'track_muted'
  /** Track was disabled (enabled === false) — no data is delivered downstream. */
  | 'track_disabled'
  /** Track claims to be live, but no real frames / no readable analyser path materialized. */
  | 'no_signal'
  | 'unknown';

export interface MediaFailure {
  device: MediaDeviceKind;
  reason: MediaFailureReason;
  /** Raw DOMException name, kept for diagnostics/logging only — never shown to a student. */
  errorName?: string;
}

/** Minimal structural view of a MediaStreamTrack — keeps this module DOM-free and testable. */
export interface TrackLike {
  readyState?: string;
  muted?: boolean;
  enabled?: boolean;
}

const DEVICE_NOUN: Record<MediaDeviceKind, string> = {
  camera: 'Camera',
  microphone: 'Microphone',
};

/**
 * Maps a getUserMedia rejection to a specific, actionable reason.
 * Never throws — an unrecognized error shape falls through to 'unknown'.
 */
export function classifyMediaError(error: unknown, device: MediaDeviceKind): MediaFailure {
  const name = typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name: unknown }).name)
    : '';
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message).toLowerCase()
    : '';

  const base = (reason: MediaFailureReason): MediaFailure =>
    name ? { device, reason, errorName: name } : { device, reason };

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError': // legacy Chrome spelling
    case 'SecurityError':
      // Chrome reports a dismissed prompt as NotAllowedError too, distinguishable only by
      // its message — and "you closed the prompt" needs a different instruction than
      // "you blocked the camera for this site".
      return base(message.includes('dismiss') ? 'dismissed' : 'denied');
    case 'NotFoundError':
    case 'DevicesNotFoundError': // legacy Chrome spelling
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return base('no_device');
    case 'NotReadableError':
    case 'TrackStartError': // legacy Chrome spelling
      return base('device_in_use');
    case 'TypeError':
      return base('unsupported');
    default:
      return base('unknown');
  }
}

/**
 * Liveness check for one acquired track. Returns `null` when the track is genuinely usable.
 * Order matters: an ended track is reported as ended even if it is also muted, because
 * "reconnect the device" is the useful instruction in that case.
 */
export function evaluateTrackState(
  track: TrackLike | null | undefined,
  device: MediaDeviceKind,
): MediaFailure | null {
  if (!track) return { device, reason: 'no_device' };
  if (track.readyState !== 'live') return { device, reason: 'track_ended' };
  if (track.muted === true) return { device, reason: 'track_muted' };
  if (track.enabled === false) return { device, reason: 'track_disabled' };
  return null;
}

/** Student-facing copy. `fix` is the concrete next step, not a restatement of the problem. */
export function describeMediaFailure(failure: MediaFailure): { title: string; detail: string; fix: string } {
  const noun = DEVICE_NOUN[failure.device];
  const lower = failure.device;

  switch (failure.reason) {
    case 'denied':
      return {
        title: `${noun} access is blocked`,
        detail: `Your browser is refusing this page access to your ${lower}.`,
        fix: `Click the padlock (or ${lower}) icon in the address bar, set ${noun} to "Allow", then choose Check again.`,
      };
    case 'dismissed':
      return {
        title: `${noun} permission was not answered`,
        detail: `The ${lower} permission prompt was closed without choosing.`,
        fix: 'Choose Check again and select "Allow" when your browser asks.',
      };
    case 'no_device':
      return {
        title: `No ${lower} found`,
        detail: `This computer has no ${lower} available to your browser.`,
        fix: `Connect a ${lower} (or enable the built-in one in your system settings), then choose Check again.`,
      };
    case 'device_in_use':
      return {
        title: `${noun} is in use by another app`,
        detail: `Another application is already holding your ${lower}, so this page cannot use it.`,
        fix: `Close Zoom, Teams, Meet, OBS or any other app using the ${lower} — including other browser tabs — then choose Check again.`,
      };
    case 'insecure_context':
      return {
        title: 'Insecure connection',
        detail: `Browsers only allow ${lower} access over a secure (https) connection.`,
        fix: 'Open this exam using its https address, then choose Check again. Contact your teacher if the link is http.',
      };
    case 'unsupported':
      return {
        title: 'Browser not supported',
        detail: `This browser does not support ${lower} access for exams.`,
        fix: 'Open the exam in an up-to-date Chrome, Edge or Firefox on a desktop computer.',
      };
    case 'track_ended':
      return {
        title: `${noun} stopped`,
        detail: `Your ${lower} disconnected — it was unplugged, switched off, or its permission was revoked.`,
        fix: `Reconnect your ${lower} (and re-allow the permission if your browser asks), then choose Check again.`,
      };
    case 'track_muted':
      return {
        title: `${noun} is muted`,
        detail: `Your ${lower} is muted at the system level and is not sending any data.`,
        fix: failure.device === 'microphone'
          ? 'Unmute the microphone in your operating system settings and check any hardware mute switch on your headset, then choose Check again.'
          : 'Turn the camera on in your operating system settings and check any privacy shutter or hardware switch, then choose Check again.',
      };
    case 'track_disabled':
      return {
        title: `${noun} is switched off`,
        detail: `Your ${lower} is connected but currently switched off.`,
        fix: `Switch the ${lower} back on, then choose Check again.`,
      };
    case 'no_signal':
      return {
        title: `${noun} is not producing any ${failure.device === 'camera' ? 'video' : 'audio'}`,
        detail: failure.device === 'camera'
          ? 'Your camera reports that it is on, but no video frames are arriving.'
          : 'Your microphone reports that it is on, but no audio input could be opened from it.',
        fix: failure.device === 'camera'
          ? 'Check for a lens cover or privacy shutter, close any app that may have taken over the camera, then choose Check again.'
          : 'Select a working input device in your system sound settings, then choose Check again.',
      };
    default:
      return {
        title: `${noun} could not be started`,
        detail: `Something prevented your ${lower} from starting.`,
        fix: `Reconnect the ${lower}, reload this page, then choose Check again.`,
      };
  }
}

/** Keeps at most one failure per device (the first, which is the most specific we found). */
export function dedupeFailuresByDevice(failures: readonly MediaFailure[]): MediaFailure[] {
  const seen = new Set<MediaDeviceKind>();
  const out: MediaFailure[] = [];
  for (const failure of failures) {
    if (seen.has(failure.device)) continue;
    seen.add(failure.device);
    out.push(failure);
  }
  return out;
}

export function isMediaReady(failures: readonly MediaFailure[]): boolean {
  return failures.length === 0;
}

/** One-line summary for inline error slots (the Start Exam button's error line). */
export function formatMediaBlockMessage(failures: readonly MediaFailure[]): string {
  if (failures.length === 0) return '';
  return dedupeFailuresByDevice(failures)
    .map(f => {
      const { title, fix } = describeMediaFailure(f);
      return `${title}. ${fix}`;
    })
    .join(' ');
}

/** Compact machine-ish summary for the violation description / console diagnostics. */
export function summarizeFailuresForLog(failures: readonly MediaFailure[]): string {
  return dedupeFailuresByDevice(failures)
    .map(f => `${f.device}: ${f.reason}`)
    .join(', ');
}

/**
 * The single `unverified_start` violation's description.
 *
 * The escape hatch (2026-07-20) is deliberately preserved: a student may always proceed, and
 * the teacher is always told. Hardening the device gate adds a SECOND reason a student may
 * have bypassed verification, so the description now says which. Wording updated 2026-08-12
 * when ID-document verification was removed (face-only capture now); the event itself is
 * still exactly one high-severity `unverified_start` (unchanged severity, trust deduction and
 * bell-panel label).
 */
export function buildUnverifiedStartDescription(input: {
  biometricSkipped: boolean;
  mediaSkipped: boolean;
  mediaFailures?: readonly MediaFailure[];
}): string {
  const deviceDetail = input.mediaFailures && input.mediaFailures.length > 0
    ? ` (${summarizeFailuresForLog(input.mediaFailures)})`
    : '';

  if (input.mediaSkipped && input.biometricSkipped) {
    return `Student started the exam without completing face identity verification and without a working camera and microphone${deviceDetail}`;
  }
  if (input.mediaSkipped) {
    return `Student started the exam without a working camera and microphone — device check bypassed${deviceDetail}`;
  }
  // Unchanged legacy wording for the original escape-hatch path.
  return 'Student started the exam without completing face identity verification';
}
