// Real client-side identity verification for the biometric pre-exam gate.
//
// Uses @vladmandic/face-api (SSD MobileNet detector + 68-point landmarks + FaceNet-style
// 128-d recognition embeddings), self-hosted under public/models/face-api like the rest of
// the proctoring models — no external calls, no raw media leaves the browser.
//
// What this verifies:
//   1. The face capture contains exactly one real, sufficiently large face (not an object,
//      not an ID card held up, not two people).
//   2. The ID capture contains exactly one face — the portrait printed on the card — and
//      that portrait is card-photo-sized, not a live face filling the frame (blocks the
//      trivial bypass of showing your own face twice).
//   3. The live face and the ID portrait belong to the same person (Euclidean distance
//      between embeddings under FACE_MATCH_THRESHOLD).
//
// What this does NOT do (out of scope, client-side only): OCR of the ID's text, document
// authenticity checks, or anti-spoof liveness detection.

type FaceAPI = typeof import('@vladmandic/face-api');

const MODEL_URL = '/models/face-api';

/**
 * Standard face-api same-person threshold. Live QA against this exact model set measured
 * different-person distances of 0.62–0.71 (two people, same photo/lighting), so loosening
 * beyond 0.6 demonstrably risks accepting someone else's ID; same-person captures land far
 * below it.
 */
export const FACE_MATCH_THRESHOLD = 0.6;

/** A live face closer than this fraction of frame height is required for the selfie step. */
const MIN_LIVE_FACE_HEIGHT_RATIO = 0.15;

/**
 * A face taller than this fraction of frame height in the ID step is almost certainly a
 * live face, not a portrait printed on a card held up to the camera.
 */
const MAX_ID_FACE_HEIGHT_RATIO = 0.45;

let faceapiPromise: Promise<FaceAPI> | null = null;

async function getFaceApi(): Promise<FaceAPI> {
  if (!faceapiPromise) {
    faceapiPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      // The bundled tfjs exposes ready() at runtime but not in the package's trimmed types.
      await (faceapi.tf as unknown as { ready(): Promise<void> }).ready();
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })().catch(err => {
      // Loud, like the proctoring model loaders — a silent catch here is exactly the class
      // of bug that kept vision detection dead for weeks (see 2026-07-18 session log).
      console.error('[face-verification] models failed to load:', err);
      faceapiPromise = null; // allow a retry after transient network failures
      throw err;
    });
  }
  return faceapiPromise;
}

/** Warm the models while the student is still reading the on-screen instructions. */
export async function preloadFaceModels(): Promise<boolean> {
  try {
    await getFaceApi();
    return true;
  } catch {
    return false;
  }
}

export type LiveFaceResult =
  | { ok: true; descriptor: Float32Array }
  | { ok: false; reason: 'no_face' | 'multiple_faces' | 'face_too_small' | 'model_unavailable' };

export async function analyzeLiveFace(source: HTMLCanvasElement): Promise<LiveFaceResult> {
  let faceapi: FaceAPI;
  try {
    faceapi = await getFaceApi();
  } catch {
    return { ok: false, reason: 'model_unavailable' };
  }
  const detections = await faceapi
    .detectAllFaces(source, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (detections.length === 0) return { ok: false, reason: 'no_face' };
  if (detections.length > 1) return { ok: false, reason: 'multiple_faces' };
  const box = detections[0].detection.box;
  if (box.height / source.height < MIN_LIVE_FACE_HEIGHT_RATIO) {
    return { ok: false, reason: 'face_too_small' };
  }
  return { ok: true, descriptor: detections[0].descriptor };
}

export type IdPhotoResult =
  | { ok: true; descriptor: Float32Array }
  | { ok: false; reason: 'no_id_face' | 'multiple_faces' | 'live_face_not_card' | 'model_unavailable' };

export async function analyzeIdPhoto(source: HTMLCanvasElement): Promise<IdPhotoResult> {
  let faceapi: FaceAPI;
  try {
    faceapi = await getFaceApi();
  } catch {
    return { ok: false, reason: 'model_unavailable' };
  }
  // Lower confidence floor: ID portraits are small, printed, and often glare-washed.
  const detections = await faceapi
    .detectAllFaces(source, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
    .withFaceLandmarks()
    .withFaceDescriptors();
  if (detections.length === 0) return { ok: false, reason: 'no_id_face' };
  // Two faces means the student's own face is in frame next to the card — ambiguous, and it
  // would let the matcher lock onto the live face instead of the card portrait. Reject.
  if (detections.length > 1) return { ok: false, reason: 'multiple_faces' };
  const box = detections[0].detection.box;
  if (box.height / source.height > MAX_ID_FACE_HEIGHT_RATIO) {
    return { ok: false, reason: 'live_face_not_card' };
  }
  return { ok: true, descriptor: detections[0].descriptor };
}

/** Euclidean distance between two 128-d face embeddings. Lower = more similar. */
export function faceMatchDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export function isSamePerson(a: Float32Array, b: Float32Array): boolean {
  return faceMatchDistance(a, b) <= FACE_MATCH_THRESHOLD;
}
