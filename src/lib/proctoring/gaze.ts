// Coarse gaze heuristic from MediaPipe Face Landmarker output (Phase 3, doc 01).
// Deliberately coarse: only sustained, unmistakable looking-away should flag —
// fine-grained gaze tracking without calibration produces false positives that
// erode teacher trust. Convention-independent geometry (landmark distances),
// no head-pose matrix decomposition needed.
export interface LandmarkPoint {
  x: number;
  y: number;
}

// MediaPipe Face Mesh canonical indices
const NOSE_TIP = 1;
const LEFT_FACE_EDGE = 234;
const RIGHT_FACE_EDGE = 454;
const LEFT_IRIS_CENTER = 468;
const RIGHT_IRIS_CENTER = 473;
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;

// Loosened from the original 2.6/[0.2,0.8] — that combination under-detected real, sustained
// looking-away (a moderate but genuine gaze-off-screen never crossed either bar). Still coarse
// by design (no per-user calibration), just no longer requiring an extreme ~30°+ head turn or
// an iris pinned almost fully into the corner before anything registers.
/** Head turned when nose-to-cheek distance ratio exceeds this (≈22°+ yaw). */
export const HEAD_TURN_RATIO = 2.0;
/** Iris cornered when its position within the eye corners leaves [0.25, 0.75]. */
export const IRIS_CORNER_LOW = 0.25;
export const IRIS_CORNER_HIGH = 0.75;

export interface GazeReading {
  away: boolean;
  headRatio: number;
  irisOffsetLeft: number | null;
  irisOffsetRight: number | null;
}

function offsetWithin(iris: LandmarkPoint, cornerA: LandmarkPoint, cornerB: LandmarkPoint): number | null {
  const span = cornerB.x - cornerA.x;
  if (Math.abs(span) < 1e-6) return null;
  return (iris.x - cornerA.x) / span;
}

export function readGaze(landmarks: LandmarkPoint[]): GazeReading {
  const nose = landmarks[NOSE_TIP];
  const leftEdge = landmarks[LEFT_FACE_EDGE];
  const rightEdge = landmarks[RIGHT_FACE_EDGE];

  const leftDist = Math.abs(nose.x - leftEdge.x);
  const rightDist = Math.abs(rightEdge.x - nose.x);
  const headRatio = rightDist < 1e-6 ? Number.POSITIVE_INFINITY : leftDist / rightDist;
  const headTurned = headRatio > HEAD_TURN_RATIO || headRatio < 1 / HEAD_TURN_RATIO;

  // Iris landmarks exist only when the model ran with iris refinement (478 pts).
  let irisOffsetLeft: number | null = null;
  let irisOffsetRight: number | null = null;
  if (landmarks.length > RIGHT_IRIS_CENTER) {
    irisOffsetLeft = offsetWithin(landmarks[LEFT_IRIS_CENTER], landmarks[LEFT_EYE_OUTER], landmarks[LEFT_EYE_INNER]);
    irisOffsetRight = offsetWithin(landmarks[RIGHT_IRIS_CENTER], landmarks[RIGHT_EYE_INNER], landmarks[RIGHT_EYE_OUTER]);
  }

  // Both irises cornered the same way = looking far off-screen even without a
  // head turn. One iris alone can misread from webcam angle — require both.
  const irisCornered =
    irisOffsetLeft !== null &&
    irisOffsetRight !== null &&
    ((irisOffsetLeft < IRIS_CORNER_LOW && irisOffsetRight < IRIS_CORNER_LOW) ||
      (irisOffsetLeft > IRIS_CORNER_HIGH && irisOffsetRight > IRIS_CORNER_HIGH));

  return { away: headTurned || irisCornered, headRatio, irisOffsetLeft, irisOffsetRight };
}
