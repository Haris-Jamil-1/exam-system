'use client';
// Real vision proctoring (Phase 3, doc 01). One shared frame loop on the webcam
// stream: MediaPipe Face Landmarker (face count + coarse gaze) every TICK_MS,
// COCO-SSD object detection every OBJECT_EVERY_N ticks. All inference is
// client-side; only events leave the device. Evidence snapshots (decision 1):
// captured ONLY for high-severity flags — multiple faces, phone, sustained
// no-face — with a visible on-screen indicator when captured (decision 3).
//
// Emit policy:
// - multiple_faces / phone_detected: emitted the moment the episode opens
//   (immediacy beats duration for the highest-severity signals), snapshot attached.
// - no_face / gaze_away / prohibited_object: emitted when the episode closes,
//   carrying full duration (server derives severity from it); open episodes are
//   force-chunked at MAX_EPISODE_MS so a student who walks away surfaces on the
//   monitor within ~1 minute, not when they return.
import { useEffect, useRef, useState } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import { ConditionEpisode } from '@/lib/proctoring/episodes';
import { readGaze } from '@/lib/proctoring/gaze';
import type { ProctoringEventBuffer } from '@/lib/proctoring/event-buffer';
import { SUSTAINED_NO_FACE_SECONDS } from '@/lib/proctoring/severity';

interface FaceDetectorProps {
  buffer: ProctoringEventBuffer;
}

const TICK_MS = 2_000;
const OBJECT_EVERY_N = 5; // object detection every 5th tick (~10s)
const MAX_EPISODE_MS = 60_000;
const PHONE_CONFIDENCE = 0.55;
const OBJECT_CLASSES: Record<string, 'phone_detected' | 'prohibited_object'> = {
  'cell phone': 'phone_detected',
  book: 'prohibited_object',
  laptop: 'prohibited_object',
};

type FaceStatus = 'loading' | 'ok' | 'no_face' | 'multiple' | 'degraded' | 'error';

export function FaceDetector({ buffer }: FaceDetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<FaceStatus>('loading');
  const [snapshotFlash, setSnapshotFlash] = useState(false);
  const { addViolation } = useProctoringStore();

  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let cancelled = false; // Guard against unmount before async setup resolves
    let landmarker: { detectForVideo: (v: HTMLVideoElement, ts: number) => { faceLandmarks: { x: number; y: number }[][] }; close: () => void } | null = null;
    let objectModel: { detect: (v: HTMLVideoElement) => Promise<{ class: string; score: number }[]> } | null = null;
    let objectBusy = false;
    let tick = 0;

    const noFace = new ConditionEpisode(3, 2);   // ≥3 passes (~6s) opens
    const multiFace = new ConditionEpisode(2, 2); // ≥2 passes (~4s) opens
    const gazeAway = new ConditionEpisode(4, 2);  // ≥4 passes (~8s) opens
    const objectEpisodes = new Map<string, ConditionEpisode>(); // per object class
    let noFaceOpenedAt: number | null = null;
    let noFaceSnapshot: string | null = null;
    let gazeOpenedAt: number | null = null;
    let lastGazeMeta: Record<string, unknown> = {};

    async function captureSnapshot(): Promise<string | null> {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) return null;
      try {
        const canvas = document.createElement('canvas');
        const scale = 320 / video.videoWidth;
        canvas.width = 320;
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve =>
          canvas.toBlob(resolve, 'image/jpeg', 0.7),
        );
        if (!blob) return null;

        setSnapshotFlash(true);
        setTimeout(() => { if (!cancelled) setSnapshotFlash(false); }, 3000);

        const form = new FormData();
        form.append('file', new File([blob], 'evidence.jpg', { type: 'image/jpeg' }));
        form.append('folder', 'evidence');
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        if (!res.ok) return null;
        const data = (await res.json()) as { path?: string };
        // Store the private storage path; teacher views resolve signed URLs.
        return data.path ?? null;
      } catch {
        return null;
      }
    }

    function handleFaces(count: number, now: number) {
      // ----- multiple faces: emit at open, snapshot evidence -----
      const multiTransition = multiFace.update(count >= 2, now);
      if (multiTransition?.kind === 'opened') {
        setStatus('multiple');
        const startIso = new Date(multiTransition.startedAt).toISOString();
        addViolation({ type: 'multiple_faces', timestamp: startIso, description: 'Multiple faces detected' });
        void captureSnapshot().then(path => {
          buffer.emit({
            type: 'multiple_faces',
            severity: 'high',
            timestamp: startIso,
            description: 'Multiple faces detected in camera feed',
            screenshotUrl: path ?? undefined,
            metadata: { faceCount: count },
          });
        });
      }

      // ----- no face: emit at close with duration; snapshot at open -----
      const noFaceTransition = noFace.update(count === 0, now);
      if (noFaceTransition?.kind === 'opened') {
        setStatus('no_face');
        noFaceOpenedAt = noFaceTransition.startedAt;
        addViolation({
          type: 'no_face',
          timestamp: new Date(noFaceTransition.startedAt).toISOString(),
          description: 'No face detected',
        });
        // The empty frame IS the evidence for a sustained absence.
        void captureSnapshot().then(path => { noFaceSnapshot = path; });
      } else if (noFaceTransition?.kind === 'closed') {
        emitNoFace(noFaceTransition.startedAt, noFaceTransition.endedAt);
      } else if (noFace.isOpen && noFaceOpenedAt && now - noFaceOpenedAt > MAX_EPISODE_MS) {
        // Chunk long absences so the monitor sees them while they're happening.
        const forced = noFace.finalize(now);
        if (forced?.kind === 'closed') emitNoFace(forced.startedAt, forced.endedAt);
      }

      if (count === 1 && !multiFace.isOpen && !noFace.isOpen) setStatus('ok');
    }

    function emitNoFace(startedAt: number, endedAt: number) {
      const durationSec = (endedAt - startedAt) / 1000;
      buffer.emit({
        type: 'no_face',
        severity: 'medium',
        timestamp: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        description: 'No face detected in camera feed',
        // Snapshot evidence only for the sustained (high-severity) case, decision 1.
        screenshotUrl:
          durationSec >= SUSTAINED_NO_FACE_SECONDS ? (noFaceSnapshot ?? undefined) : undefined,
      });
      noFaceOpenedAt = null;
      noFaceSnapshot = null;
    }

    function handleGaze(landmarks: { x: number; y: number }[][], now: number) {
      const away = landmarks.length === 1 ? readGaze(landmarks[0]).away : false;
      if (landmarks.length === 1) {
        const g = readGaze(landmarks[0]);
        lastGazeMeta = {
          headRatio: Number(g.headRatio.toFixed(2)),
          irisOffsetLeft: g.irisOffsetLeft !== null ? Number(g.irisOffsetLeft.toFixed(2)) : null,
          irisOffsetRight: g.irisOffsetRight !== null ? Number(g.irisOffsetRight.toFixed(2)) : null,
        };
      }
      const transition = gazeAway.update(away, now);
      if (transition?.kind === 'opened') {
        gazeOpenedAt = transition.startedAt;
      } else if (transition?.kind === 'closed') {
        emitGaze(transition.startedAt, transition.endedAt);
      } else if (gazeAway.isOpen && gazeOpenedAt && now - gazeOpenedAt > MAX_EPISODE_MS) {
        const forced = gazeAway.finalize(now);
        if (forced?.kind === 'closed') emitGaze(forced.startedAt, forced.endedAt);
      }
    }

    function emitGaze(startedAt: number, endedAt: number) {
      buffer.emit({
        type: 'gaze_away',
        severity: 'low',
        timestamp: new Date(startedAt).toISOString(),
        endedAt: new Date(endedAt).toISOString(),
        description: 'Sustained gaze away from screen',
        metadata: lastGazeMeta,
      });
      gazeOpenedAt = null;
    }

    async function handleObjects(now: number) {
      const video = videoRef.current;
      if (!objectModel || !video || objectBusy || video.videoWidth === 0) return;
      objectBusy = true;
      try {
        const detections = await objectModel.detect(video);
        const seen = new Map<string, number>(); // violation type -> best score
        for (const d of detections) {
          const type = OBJECT_CLASSES[d.class];
          if (type && d.score >= PHONE_CONFIDENCE) {
            seen.set(type, Math.max(seen.get(type) ?? 0, d.score));
          }
        }
        for (const type of ['phone_detected', 'prohibited_object'] as const) {
          let episode = objectEpisodes.get(type);
          if (!episode) {
            // 2 consecutive ~10s samples must agree before flagging.
            episode = new ConditionEpisode(2, 1);
            objectEpisodes.set(type, episode);
          }
          const score = seen.get(type);
          const transition = episode.update(score !== undefined, now);
          if (transition?.kind === 'opened' && type === 'phone_detected') {
            const startIso = new Date(transition.startedAt).toISOString();
            addViolation({ type, timestamp: startIso, description: 'Phone detected' });
            void captureSnapshot().then(path => {
              buffer.emit({
                type,
                severity: 'high',
                confidence: score,
                timestamp: startIso,
                description: 'Mobile phone detected in camera feed',
                screenshotUrl: path ?? undefined,
              });
            });
          } else if (transition?.kind === 'closed' && type === 'prohibited_object') {
            buffer.emit({
              type,
              severity: 'medium',
              confidence: score,
              timestamp: new Date(transition.startedAt).toISOString(),
              endedAt: new Date(transition.endedAt).toISOString(),
              description: 'Prohibited object (book/laptop) detected in camera feed',
            });
          }
        }
      } catch {
        // A single failed detection pass is not an error condition.
      } finally {
        objectBusy = false;
      }
    }

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        if (!cancelled) setStatus('error');
        return;
      }

      // Model loading is best-effort: a device that can't run the models keeps
      // the camera widget and the other detectors — degradation is visible in
      // the widget label and reported via heartbeat metadata, never silent.
      try {
        const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
        const fileset = await FilesetResolver.forVisionTasks('/models/mediapipe/wasm');
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/models/mediapipe/face_landmarker.task' },
          runningMode: 'VIDEO',
          numFaces: 2,
        });
      } catch {
        landmarker = null;
      }

      try {
        await import('@tensorflow/tfjs');
        const cocoSsd = await import('@tensorflow-models/coco-ssd');
        objectModel = await cocoSsd.load({ modelUrl: '/models/coco-ssd/model.json' });
      } catch {
        objectModel = null;
      }

      if (cancelled) {
        landmarker?.close();
        return;
      }
      if (!landmarker && !objectModel) {
        setStatus('degraded');
        buffer.emit({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
          metadata: { degraded: true, reason: 'vision models failed to load' },
        });
        return;
      }
      setStatus('ok');

      intervalId = setInterval(() => {
        if (cancelled) return;
        const video = videoRef.current;
        if (!video || video.videoWidth === 0) return;
        const now = Date.now();
        tick += 1;

        if (landmarker) {
          try {
            const result = landmarker.detectForVideo(video, performance.now());
            handleFaces(result.faceLandmarks.length, now);
            handleGaze(result.faceLandmarks, now);
          } catch {
            // Skip this pass; next tick retries.
          }
        }
        if (tick % OBJECT_EVERY_N === 0) {
          void handleObjects(now);
        }
      }, TICK_MS);
    }

    void init();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      // Flush any open close-emitted episodes so their duration isn't lost.
      const now = Date.now();
      const noFaceFinal = noFace.finalize(now);
      if (noFaceFinal?.kind === 'closed') emitNoFace(noFaceFinal.startedAt, noFaceFinal.endedAt);
      const gazeFinal = gazeAway.finalize(now);
      if (gazeFinal?.kind === 'closed') emitGaze(gazeFinal.startedAt, gazeFinal.endedAt);
      landmarker?.close();
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [buffer, addViolation]);

  const label: Record<FaceStatus, { text: string; cls: string }> = {
    loading: { text: 'Starting…', cls: 'bg-gray-600 text-white' },
    ok: { text: '✓ Face Detected', cls: 'bg-green-600 text-white' },
    no_face: { text: '⚠ No Face', cls: 'bg-red-600 text-white animate-pulse' },
    multiple: { text: '⚠ Multiple Faces', cls: 'bg-red-600 text-white animate-pulse' },
    degraded: { text: 'Basic monitoring', cls: 'bg-yellow-600 text-white' },
    error: { text: '', cls: '' },
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="relative rounded-xl overflow-hidden border-2 border-white shadow-lg w-28 h-20 bg-gray-900">
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
        {status === 'error' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <p className="text-white text-xs text-center">Camera unavailable</p>
          </div>
        ) : (
          <div className={`absolute bottom-1 start-1 end-1 text-center text-xs rounded px-1 py-0.5 ${label[status].cls}`}>
            {label[status].text}
          </div>
        )}
        {snapshotFlash && (
          <div className="absolute top-1 start-1 end-1 text-center text-xs rounded px-1 py-0.5 bg-blue-600 text-white">
            📸 Snapshot captured
          </div>
        )}
      </div>
    </div>
  );
}
