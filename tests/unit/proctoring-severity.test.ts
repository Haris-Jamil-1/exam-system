import { describe, it, expect } from 'vitest';
import { deriveSeverity, episodeDurationSeconds, SUSTAINED_NO_FACE_SECONDS } from '@/lib/proctoring/severity';

describe('deriveSeverity — server-side severity policy', () => {
  it('multiple_faces and phone_detected are always high, whatever the client says', () => {
    expect(deriveSeverity('multiple_faces', null, 'low')).toBe('high');
    expect(deriveSeverity('phone_detected', 2, 'low')).toBe('high');
  });

  it('tab_switch escalates from medium to high past 15s away', () => {
    expect(deriveSeverity('tab_switch', null, 'low')).toBe('medium');
    expect(deriveSeverity('tab_switch', 10, 'low')).toBe('medium');
    expect(deriveSeverity('tab_switch', 16, 'low')).toBe('high');
  });

  it('window_blur escalates from low to medium past 15s', () => {
    expect(deriveSeverity('window_blur', 3, 'high')).toBe('low');
    expect(deriveSeverity('window_blur', 20, 'low')).toBe('medium');
  });

  it('no_face becomes high at the sustained threshold (snapshot/push trigger)', () => {
    expect(deriveSeverity('no_face', SUSTAINED_NO_FACE_SECONDS - 1, 'low')).toBe('medium');
    expect(deriveSeverity('no_face', SUSTAINED_NO_FACE_SECONDS, 'low')).toBe('high');
    expect(deriveSeverity('no_face', null, 'low')).toBe('medium');
  });

  it('fullscreen_exit stays high; gaze and audio escalate with duration', () => {
    expect(deriveSeverity('fullscreen_exit', null, 'low')).toBe('high');
    expect(deriveSeverity('gaze_away', 5, 'high')).toBe('low');
    expect(deriveSeverity('gaze_away', 25, 'low')).toBe('medium');
    expect(deriveSeverity('audio_detected', 5, 'high')).toBe('low');
    expect(deriveSeverity('audio_detected', 20, 'low')).toBe('medium');
  });
});

describe('episodeDurationSeconds', () => {
  it('computes duration for a closed episode', () => {
    expect(episodeDurationSeconds('2026-07-11T10:00:00Z', '2026-07-11T10:00:45Z')).toBe(45);
  });

  it('returns null for open, invalid, or negative episodes', () => {
    expect(episodeDurationSeconds('2026-07-11T10:00:00Z', null)).toBeNull();
    expect(episodeDurationSeconds('2026-07-11T10:00:00Z', undefined)).toBeNull();
    expect(episodeDurationSeconds('2026-07-11T10:00:00Z', 'garbage')).toBeNull();
    expect(episodeDurationSeconds('2026-07-11T10:00:00Z', '2026-07-11T09:00:00Z')).toBeNull();
  });
});
