import { describe, it, expect } from 'vitest';
import {
  buildUnverifiedStartDescription,
  classifyMediaError,
  dedupeFailuresByDevice,
  describeMediaFailure,
  evaluateTrackState,
  formatMediaBlockMessage,
  isMediaReady,
  summarizeFailuresForLog,
  type MediaFailure,
} from '@/lib/proctoring/media-readiness';

function domError(name: string, message = ''): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe('classifyMediaError — the student must be told which device and why', () => {
  it('maps a hard denial to denied, per device', () => {
    expect(classifyMediaError(domError('NotAllowedError', 'Permission denied'), 'camera'))
      .toEqual({ device: 'camera', reason: 'denied', errorName: 'NotAllowedError' });
    expect(classifyMediaError(domError('NotAllowedError'), 'microphone').device).toBe('microphone');
  });

  it('distinguishes a dismissed prompt from a hard denial (both are NotAllowedError in Chrome)', () => {
    expect(classifyMediaError(domError('NotAllowedError', 'Permission dismissed'), 'camera').reason)
      .toBe('dismissed');
  });

  it('accepts the legacy Chrome spellings', () => {
    expect(classifyMediaError(domError('PermissionDeniedError'), 'camera').reason).toBe('denied');
    expect(classifyMediaError(domError('DevicesNotFoundError'), 'camera').reason).toBe('no_device');
    expect(classifyMediaError(domError('TrackStartError'), 'microphone').reason).toBe('device_in_use');
  });

  it('maps a missing device to no_device', () => {
    expect(classifyMediaError(domError('NotFoundError'), 'camera').reason).toBe('no_device');
    expect(classifyMediaError(domError('OverconstrainedError'), 'microphone').reason).toBe('no_device');
  });

  it('maps hardware held by another application to device_in_use', () => {
    expect(classifyMediaError(domError('NotReadableError'), 'camera').reason).toBe('device_in_use');
  });

  it('maps an unusable API surface to unsupported', () => {
    expect(classifyMediaError(domError('TypeError'), 'camera').reason).toBe('unsupported');
  });

  it('never throws on a non-Error value and falls back to unknown', () => {
    expect(classifyMediaError(undefined, 'camera')).toEqual({ device: 'camera', reason: 'unknown' });
    expect(classifyMediaError('boom', 'microphone').reason).toBe('unknown');
    expect(classifyMediaError({ name: 'SomethingNew' }, 'camera')).toEqual({
      device: 'camera', reason: 'unknown', errorName: 'SomethingNew',
    });
  });

  it('the three headline cases produce three genuinely different messages', () => {
    const messages = (['NotAllowedError', 'NotFoundError', 'NotReadableError'] as const).map(name =>
      describeMediaFailure(classifyMediaError(domError(name), 'camera')).title,
    );
    expect(new Set(messages).size).toBe(3);
  });
});

describe('evaluateTrackState — a granted permission is not proof of a live device', () => {
  it('passes a genuinely live track', () => {
    expect(evaluateTrackState({ readyState: 'live', muted: false, enabled: true }, 'camera')).toBeNull();
  });

  it('rejects an ended track (unplugged / permission revoked mid-session)', () => {
    expect(evaluateTrackState({ readyState: 'ended', muted: false, enabled: true }, 'camera'))
      .toEqual({ device: 'camera', reason: 'track_ended' });
  });

  it('rejects an OS-muted track even though it reports live', () => {
    expect(evaluateTrackState({ readyState: 'live', muted: true, enabled: true }, 'microphone'))
      .toEqual({ device: 'microphone', reason: 'track_muted' });
  });

  it('rejects a disabled track', () => {
    expect(evaluateTrackState({ readyState: 'live', muted: false, enabled: false }, 'camera'))
      .toEqual({ device: 'camera', reason: 'track_disabled' });
  });

  it('reports a missing track as no_device', () => {
    expect(evaluateTrackState(undefined, 'microphone')).toEqual({ device: 'microphone', reason: 'no_device' });
    expect(evaluateTrackState(null, 'camera')).toEqual({ device: 'camera', reason: 'no_device' });
  });

  it('prefers "ended" over "muted" when both are true (reconnect is the useful instruction)', () => {
    expect(evaluateTrackState({ readyState: 'ended', muted: true, enabled: false }, 'camera')?.reason)
      .toBe('track_ended');
  });
});

describe('failure presentation', () => {
  it('gives every reason a distinct, non-empty title/detail/fix', () => {
    const reasons: MediaFailure['reason'][] = [
      'denied', 'dismissed', 'no_device', 'device_in_use', 'insecure_context',
      'unsupported', 'track_ended', 'track_muted', 'track_disabled', 'no_signal', 'unknown',
    ];
    const titles = new Set<string>();
    for (const reason of reasons) {
      const copy = describeMediaFailure({ device: 'camera', reason });
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.detail.length).toBeGreaterThan(0);
      expect(copy.fix.length).toBeGreaterThan(0);
      titles.add(copy.title);
    }
    expect(titles.size).toBe(reasons.length);
  });

  it('names the actual device in the copy', () => {
    expect(describeMediaFailure({ device: 'microphone', reason: 'device_in_use' }).title)
      .toContain('Microphone');
    expect(describeMediaFailure({ device: 'camera', reason: 'device_in_use' }).title)
      .toContain('Camera');
  });

  it('keeps at most one failure per device and treats an empty list as ready', () => {
    const deduped = dedupeFailuresByDevice([
      { device: 'camera', reason: 'track_ended' },
      { device: 'camera', reason: 'no_signal' },
      { device: 'microphone', reason: 'denied' },
    ]);
    expect(deduped).toEqual([
      { device: 'camera', reason: 'track_ended' },
      { device: 'microphone', reason: 'denied' },
    ]);
    expect(isMediaReady([])).toBe(true);
    expect(isMediaReady(deduped)).toBe(false);
  });

  it('formats a combined block message covering both devices', () => {
    const message = formatMediaBlockMessage([
      { device: 'camera', reason: 'denied' },
      { device: 'microphone', reason: 'no_device' },
    ]);
    expect(message).toContain('Camera');
    expect(message).toContain('microphone');
    expect(formatMediaBlockMessage([])).toBe('');
  });

  it('summarizes failures compactly for logs/violation detail', () => {
    expect(summarizeFailuresForLog([
      { device: 'camera', reason: 'device_in_use' },
      { device: 'microphone', reason: 'track_muted' },
    ])).toBe('camera: device_in_use, microphone: track_muted');
  });
});

describe('buildUnverifiedStartDescription — the escape hatch stays intact', () => {
  it('keeps the pre-existing biometric-only wording byte-identical', () => {
    expect(buildUnverifiedStartDescription({ biometricSkipped: true, mediaSkipped: false }))
      .toBe('Student started the exam without completing face identity verification');
  });

  it('names the device bypass, with the specific reasons, when the device gate was skipped', () => {
    const description = buildUnverifiedStartDescription({
      biometricSkipped: false,
      mediaSkipped: true,
      mediaFailures: [{ device: 'microphone', reason: 'no_device' }],
    });
    expect(description).toContain('device check bypassed');
    expect(description).toContain('microphone: no_device');
  });

  it('covers both bypasses in one description (still one violation event)', () => {
    const description = buildUnverifiedStartDescription({
      biometricSkipped: true,
      mediaSkipped: true,
      mediaFailures: [{ device: 'camera', reason: 'denied' }],
    });
    expect(description).toContain('face identity verification');
    expect(description).toContain('camera and microphone');
    expect(description).toContain('camera: denied');
  });

  it('omits the parenthetical when no failure detail is available', () => {
    expect(buildUnverifiedStartDescription({ biometricSkipped: false, mediaSkipped: true, mediaFailures: [] }))
      .not.toContain('(');
  });
});
