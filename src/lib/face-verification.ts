// Real client-side face detection for the biometric pre-exam gate.
//
// Uses @vladmandic/face-api (SSD MobileNet detector only — no landmarks/recognition net,
// since there is no second image to match against), self-hosted under public/models/face-api
// like the rest of the proctoring models — no external calls, no raw media leaves the browser.
//
// What this verifies: the capture contains exactly one real, sufficiently large face (not an
// object, not two people). The captured photo is uploaded and shown to the teacher on the live
// monitor (identity is a human judgment call from there, not an automated match).
//
// What this does NOT do (out of scope, client-side only): ID/document verification (removed —
// see the 2026-08-12 session log), OCR, document authenticity checks, or anti-spoof liveness
// detection.

type FaceAPI = typeof import('@vladmandic/face-api');

const MODEL_URL = '/models/face-api';

/** A live face closer than this fraction of frame height is required for the selfie step. */
const MIN_LIVE_FACE_HEIGHT_RATIO = 0.15;

let faceapiPromise: Promise<FaceAPI> | null = null;

async function getFaceApi(): Promise<FaceAPI> {
  if (!faceapiPromise) {
    faceapiPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      // The bundled tfjs exposes ready() at runtime but not in the package's trimmed types.
      await (faceapi.tf as unknown as { ready(): Promise<void> }).ready();
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
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

/** Warm the model while the student is still reading the on-screen instructions. */
export async function preloadFaceModels(): Promise<boolean> {
  try {
    await getFaceApi();
    return true;
  } catch {
    return false;
  }
}

export type LiveFaceResult =
  | { ok: true }
  | { ok: false; reason: 'no_face' | 'multiple_faces' | 'face_too_small' | 'model_unavailable' };

export async function analyzeLiveFace(source: HTMLCanvasElement): Promise<LiveFaceResult> {
  let faceapi: FaceAPI;
  try {
    faceapi = await getFaceApi();
  } catch {
    return { ok: false, reason: 'model_unavailable' };
  }
  const detections = await faceapi.detectAllFaces(source, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }));
  if (detections.length === 0) return { ok: false, reason: 'no_face' };
  if (detections.length > 1) return { ok: false, reason: 'multiple_faces' };
  const box = detections[0].box;
  if (box.height / source.height < MIN_LIVE_FACE_HEIGHT_RATIO) {
    return { ok: false, reason: 'face_too_small' };
  }
  return { ok: true };
}
