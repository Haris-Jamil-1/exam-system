import { describe, it, expect } from 'vitest';
import { ConditionEpisode } from '@/lib/proctoring/episodes';
import { readGaze, HEAD_TURN_RATIO, type LandmarkPoint } from '@/lib/proctoring/gaze';

describe('ConditionEpisode — hysteresis state machine', () => {
  it('does not open before the threshold of consecutive active passes', () => {
    const ep = new ConditionEpisode(3, 2);
    expect(ep.update(true, 1000)).toBeNull();
    expect(ep.update(true, 2000)).toBeNull();
    expect(ep.isOpen).toBe(false);
  });

  it('opens at the threshold with startedAt = first active pass', () => {
    const ep = new ConditionEpisode(3, 2);
    ep.update(true, 1000);
    ep.update(true, 2000);
    expect(ep.update(true, 3000)).toEqual({ kind: 'opened', startedAt: 1000 });
    expect(ep.isOpen).toBe(true);
  });

  it('a blip resets the run — intermittent flicker never opens', () => {
    const ep = new ConditionEpisode(3, 2);
    ep.update(true, 1000);
    ep.update(true, 2000);
    ep.update(false, 3000); // resets active run
    ep.update(true, 4000);
    expect(ep.update(true, 5000)).toBeNull();
    expect(ep.isOpen).toBe(false);
  });

  it('closes only after enough consecutive inactive passes, with true bounds', () => {
    const ep = new ConditionEpisode(2, 2);
    ep.update(true, 1000);
    ep.update(true, 3000); // opened
    ep.update(true, 5000);
    expect(ep.update(false, 7000)).toBeNull(); // 1 inactive — still open
    expect(ep.update(false, 9000)).toEqual({ kind: 'closed', startedAt: 1000, endedAt: 5000 });
    expect(ep.isOpen).toBe(false);
  });

  it('single inactive pass does not close (webcam flicker tolerance)', () => {
    const ep = new ConditionEpisode(2, 2);
    ep.update(true, 1000);
    ep.update(true, 2000); // opened
    ep.update(false, 3000);
    ep.update(true, 4000); // condition back — episode continues
    expect(ep.isOpen).toBe(true);
    ep.update(false, 5000);
    const closed = ep.update(false, 6000);
    expect(closed?.kind).toBe('closed');
    // endedAt is the last time the condition was actually observed
    expect(closed && 'endedAt' in closed && closed.endedAt).toBe(4000);
  });

  it('finalize closes an open episode and is a no-op otherwise', () => {
    const ep = new ConditionEpisode(2, 2);
    expect(ep.finalize(1000)).toBeNull();
    ep.update(true, 1000);
    ep.update(true, 2000);
    expect(ep.finalize(3000)).toEqual({ kind: 'closed', startedAt: 1000, endedAt: 2000 });
    expect(ep.isOpen).toBe(false);
  });

  it('can re-open after closing (chunked long episodes)', () => {
    const ep = new ConditionEpisode(2, 1);
    ep.update(true, 1000);
    ep.update(true, 2000); // opened
    ep.finalize(3000);
    ep.update(true, 4000);
    expect(ep.update(true, 5000)).toEqual({ kind: 'opened', startedAt: 4000 });
  });
});

// Build a 478-point landmark array approximating a face; override key points.
function face(overrides: Record<number, LandmarkPoint>): LandmarkPoint[] {
  const pts: LandmarkPoint[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  // Frontal defaults: nose centered between cheeks, irises centered in eyes.
  pts[1] = { x: 0.5, y: 0.55 };    // nose tip
  pts[234] = { x: 0.3, y: 0.5 };   // left face edge
  pts[454] = { x: 0.7, y: 0.5 };   // right face edge
  pts[33] = { x: 0.38, y: 0.45 };  // left eye outer
  pts[133] = { x: 0.46, y: 0.45 }; // left eye inner
  pts[468] = { x: 0.42, y: 0.45 }; // left iris center
  pts[362] = { x: 0.54, y: 0.45 }; // right eye inner
  pts[263] = { x: 0.62, y: 0.45 }; // right eye outer
  pts[473] = { x: 0.58, y: 0.45 }; // right iris center
  return Object.entries(overrides).reduce((acc, [i, p]) => {
    acc[Number(i)] = p;
    return acc;
  }, pts);
}

describe('readGaze — coarse gaze heuristic', () => {
  it('frontal face with centered irises is not away', () => {
    const g = readGaze(face({}));
    expect(g.away).toBe(false);
    expect(g.headRatio).toBeCloseTo(1, 1);
  });

  it('strong head turn flags away', () => {
    // Nose pushed far toward the right cheek: leftDist/rightDist >> threshold
    const g = readGaze(face({ 1: { x: 0.65, y: 0.55 } }));
    expect(g.headRatio).toBeGreaterThan(HEAD_TURN_RATIO);
    expect(g.away).toBe(true);
  });

  it('both irises cornered the same way flags away without head turn', () => {
    const g = readGaze(face({
      468: { x: 0.385, y: 0.45 }, // left iris at outer corner
      473: { x: 0.545, y: 0.45 }, // right iris at inner corner (same look direction)
    }));
    expect(g.away).toBe(true);
  });

  it('one cornered iris alone (webcam angle artifact) does not flag', () => {
    const g = readGaze(face({ 468: { x: 0.385, y: 0.45 } }));
    expect(g.away).toBe(false);
  });
});
