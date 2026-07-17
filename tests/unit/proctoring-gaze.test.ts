import { describe, it, expect } from 'vitest';
import { readGaze, HEAD_TURN_RATIO, IRIS_CORNER_LOW, IRIS_CORNER_HIGH, type LandmarkPoint } from '@/lib/proctoring/gaze';

// Builds a minimal fake MediaPipe landmark array with only the indices readGaze actually reads
// populated meaningfully; everything else is filler. Eye corners are placed at x=0/x=1 so
// irisOffsetLeft/irisOffsetRight equal the requested value directly (offsetWithin normalizes
// iris.x into the [cornerA.x, cornerB.x] span).
function makeLandmarks(opts: { headRatio?: number; irisOffsetLeft?: number; irisOffsetRight?: number }): LandmarkPoint[] {
  const { headRatio = 1, irisOffsetLeft = 0.5, irisOffsetRight = 0.5 } = opts;
  const pts: LandmarkPoint[] = Array.from({ length: 480 }, () => ({ x: 0, y: 0 }));
  const rightDist = 0.1;
  const leftDist = headRatio * rightDist;
  pts[1] = { x: 0.5, y: 0.5 };              // NOSE_TIP
  pts[234] = { x: 0.5 - leftDist, y: 0.5 }; // LEFT_FACE_EDGE
  pts[454] = { x: 0.5 + rightDist, y: 0.5 };// RIGHT_FACE_EDGE
  pts[33] = { x: 0, y: 0 };                 // LEFT_EYE_OUTER
  pts[133] = { x: 1, y: 0 };                // LEFT_EYE_INNER
  pts[468] = { x: irisOffsetLeft, y: 0 };   // LEFT_IRIS_CENTER
  pts[362] = { x: 0, y: 0 };                // RIGHT_EYE_INNER
  pts[263] = { x: 1, y: 0 };                // RIGHT_EYE_OUTER
  pts[473] = { x: irisOffsetRight, y: 0 };  // RIGHT_IRIS_CENTER
  return pts;
}

describe('readGaze — loosened thresholds (Task 3 fix)', () => {
  it('a straight-on, centered face is never "away"', () => {
    expect(readGaze(makeLandmarks({ headRatio: 1 })).away).toBe(false);
  });

  it('confirms the thresholds were actually loosened from the old 2.6 / [0.2, 0.8]', () => {
    expect(HEAD_TURN_RATIO).toBeLessThan(2.6);
    expect(IRIS_CORNER_LOW).toBeGreaterThan(0.2);
    expect(IRIS_CORNER_HIGH).toBeLessThan(0.8);
  });

  it('a moderate head turn that used to fall under the old 2.6 bar now registers as away', () => {
    const moderateTurn = 2.2; // between the new 2.0 bar and the old 2.6 bar
    expect(readGaze(makeLandmarks({ headRatio: moderateTurn })).away).toBe(true);
  });

  it('a moderate iris offset that used to fall inside the old [0.2, 0.8] band now registers as away', () => {
    // 0.22 is inside the old [0.2, 0.8] "not cornered" band but outside the new [0.25, 0.75] one.
    expect(readGaze(makeLandmarks({ irisOffsetLeft: 0.22, irisOffsetRight: 0.22 })).away).toBe(true);
  });

  it('a single cornered iris alone (webcam-angle misread) still does not trigger away — both must agree', () => {
    expect(readGaze(makeLandmarks({ irisOffsetLeft: 0.1, irisOffsetRight: 0.5 })).away).toBe(false);
  });

  it('an extreme head turn still registers as away, as before', () => {
    expect(readGaze(makeLandmarks({ headRatio: 3.5 })).away).toBe(true);
  });
});
