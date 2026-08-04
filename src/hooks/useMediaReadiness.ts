'use client';
// Pre-exam camera + microphone readiness. Owns exactly one MediaStream for the whole gate
// (the biometric step reuses it rather than calling getUserMedia a second time, the same
// stream-sharing pattern FaceDetector/WebRTCBroadcaster already use), keeps watching it, and
// can re-verify on demand — a granted permission at page load proves nothing about the state
// of the device at the moment the student actually clicks "Start Exam".
//
// Nothing here runs unless `enabled` is true: an exam with isProctoringEnabled === false must
// never trigger a permission prompt at all.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyMediaError,
  dedupeFailuresByDevice,
  evaluateTrackState,
  type MediaDeviceKind,
  type MediaFailure,
} from '@/lib/proctoring/media-readiness';

export type MediaReadinessStatus = 'disabled' | 'checking' | 'ready' | 'blocked';

/** How long a camera may take to report real dimensions before we call it dead. */
const VIDEO_DIMENSIONS_TIMEOUT_MS = 5_000;
/** How long we wait for playback position to advance (i.e. real frames arriving). */
const VIDEO_FRAME_TIMEOUT_MS = 3_000;
/** Shorter budget for the re-check at click time — the stream is already warm. */
const VIDEO_FRAME_RECHECK_MS = 1_500;
/** Backstop for browsers that don't reliably fire `mute`/`ended` on a track. */
const WATCH_POLL_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function deviceOfTrack(track: MediaStreamTrack): MediaDeviceKind {
  return track.kind === 'audio' ? 'microphone' : 'camera';
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach(t => t.stop());
}

/**
 * Acquires camera + microphone. Tries one combined request first (a single permission prompt
 * in the happy path), then falls back to probing each device separately — a combined
 * request's single DOMException never says WHICH device failed, and "your microphone is in
 * use by another app" is only actionable if we know it was the microphone.
 */
async function acquireStream(): Promise<{ stream: MediaStream | null; failures: MediaFailure[] }> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const reason = typeof window !== 'undefined' && window.isSecureContext === false
      ? 'insecure_context'
      : 'unsupported';
    return {
      stream: null,
      failures: [{ device: 'camera', reason }, { device: 'microphone', reason }],
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return { stream, failures: [] };
  } catch {
    // The combined rejection is deliberately discarded: it carries one DOMException for two
    // devices, so it can't say which one failed. The per-device probes below can.
    const failures: MediaFailure[] = [];
    const tracks: MediaStreamTrack[] = [];
    const probes: [MediaDeviceKind, MediaStreamConstraints][] = [
      ['camera', { video: true }],
      ['microphone', { audio: true }],
    ];
    for (const [device, constraints] of probes) {
      try {
        const partial = await navigator.mediaDevices.getUserMedia(constraints);
        tracks.push(...partial.getTracks());
      } catch (err) {
        failures.push(classifyMediaError(err, device));
      }
    }
    if (failures.length === 0) {
      // Some devices/drivers reject a combined request but serve each one individually.
      const merged = new MediaStream();
      tracks.forEach(t => merged.addTrack(t));
      return { stream: merged, failures: [] };
    }
    tracks.forEach(t => t.stop());
    return { stream: null, failures };
  }
}

/**
 * Real-signal check for the camera: non-zero dimensions AND a playback position that actually
 * advances. A "live" track that never produces a frame (lens shutter, a driver that hands back
 * a frozen surface) passes every readyState check and still gives the proctor nothing.
 */
async function probeVideoSignal(stream: MediaStream, frameBudgetMs: number): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play().catch(() => undefined);

    const dimensionsDeadline = Date.now() + VIDEO_DIMENSIONS_TIMEOUT_MS;
    while (Date.now() < dimensionsDeadline && (video.videoWidth === 0 || video.videoHeight === 0)) {
      await sleep(100);
    }
    if (video.videoWidth === 0 || video.videoHeight === 0) return false;

    const startedAtPosition = video.currentTime;
    const frameDeadline = Date.now() + frameBudgetMs;
    while (Date.now() < frameDeadline) {
      await sleep(100);
      if (video.currentTime > startedAtPosition) return true;
    }
    return false;
  } finally {
    video.pause();
    video.srcObject = null;
  }
}

/**
 * Real-signal check for the microphone: an analyser graph is built on the live track and read.
 *
 * Deliberately does NOT require audible sound — a student sitting silently in a quiet room is
 * the normal case, and failing them for it would be a false positive that blocks a legitimate
 * exam. What this proves is that the audio path is genuinely readable end to end (context
 * created, source node attached to the live track, samples returned), which is what fails when
 * the device is a phantom/disconnected input.
 */
async function probeAudioSignal(stream: MediaStream): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;
  let ctx: AudioContext | null = null;
  try {
    ctx = new Ctor();
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    for (let i = 0; i < 4; i += 1) {
      analyser.getByteFrequencyData(data);
      await sleep(50);
    }
    source.disconnect();
    return data.length > 0;
  } catch {
    return false;
  } finally {
    void ctx?.close().catch(() => undefined);
  }
}

function evaluateStreamTracks(stream: MediaStream | null): MediaFailure[] {
  if (!stream) {
    return [{ device: 'camera', reason: 'track_ended' }, { device: 'microphone', reason: 'track_ended' }];
  }
  const found: MediaFailure[] = [];
  const video = evaluateTrackState(stream.getVideoTracks()[0], 'camera');
  if (video) found.push(video);
  const audio = evaluateTrackState(stream.getAudioTracks()[0], 'microphone');
  if (audio) found.push(audio);
  return found;
}

/** Permission may be revoked from browser settings without the page being told. */
async function queryDeniedPermissions(): Promise<MediaFailure[]> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return [];
  const names: [MediaDeviceKind, PermissionName][] = [
    ['camera', 'camera' as PermissionName],
    ['microphone', 'microphone' as PermissionName],
  ];
  const found: MediaFailure[] = [];
  for (const [device, name] of names) {
    try {
      const result = await navigator.permissions.query({ name });
      if (result.state === 'denied') found.push({ device, reason: 'denied' });
    } catch {
      // Firefox/Safari don't expose camera/microphone here — not a failure signal.
    }
  }
  return found;
}

async function verifyStreamFully(stream: MediaStream, frameBudgetMs: number): Promise<MediaFailure[]> {
  const trackFailures = evaluateStreamTracks(stream);
  if (trackFailures.length > 0) return trackFailures;

  const [videoOk, audioOk] = await Promise.all([
    probeVideoSignal(stream, frameBudgetMs),
    probeAudioSignal(stream),
  ]);
  const found: MediaFailure[] = [];
  if (!videoOk) found.push({ device: 'camera', reason: 'no_signal' });
  if (!audioOk) found.push({ device: 'microphone', reason: 'no_signal' });
  // A track can die *during* the probes — re-read state so the more specific reason wins.
  return dedupeFailuresByDevice([...evaluateStreamTracks(stream), ...found]);
}

export interface MediaReadiness {
  status: MediaReadinessStatus;
  failures: MediaFailure[];
  /** Live camera+microphone stream, shared with the biometric step. */
  streamRef: React.RefObject<MediaStream | null>;
  /** Full re-acquisition. Safe to call from a click handler ("Check again"). */
  check: () => void;
  /**
   * Re-verifies at the moment of truth (the Start Exam click). Returns the failures found —
   * empty means genuinely ready. Also flips the hook into `blocked` so the gate re-renders.
   */
  verifyNow: () => Promise<MediaFailure[]>;
}

export function useMediaReadiness(enabled: boolean): MediaReadiness {
  const [phase, setPhase] = useState<Exclude<MediaReadinessStatus, 'disabled'>>('checking');
  const [failures, setFailures] = useState<MediaFailure[]>([]);
  const [generation, setGeneration] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  // Lets the watchers avoid re-setting state (and re-rendering) once already blocked.
  const blockedRef = useRef(false);

  useEffect(() => {
    // The whole point of the isProctoringEnabled === false path: no getUserMedia, ever.
    if (!enabled) return;

    let cancelled = false;
    const detachers: (() => void)[] = [];
    let poll: ReturnType<typeof setInterval> | null = null;

    const block = (found: MediaFailure[]) => {
      if (cancelled || found.length === 0) return;
      blockedRef.current = true;
      setFailures(dedupeFailuresByDevice(found));
      setPhase('blocked');
    };

    async function run() {
      const acquired = await acquireStream();
      if (cancelled) {
        stopStream(acquired.stream);
        return;
      }
      if (!acquired.stream || acquired.failures.length > 0) {
        stopStream(acquired.stream);
        block(acquired.failures.length > 0 ? acquired.failures : [{ device: 'camera', reason: 'unknown' }]);
        return;
      }

      const stream = acquired.stream;
      const liveness = await verifyStreamFully(stream, VIDEO_FRAME_TIMEOUT_MS);
      if (cancelled) {
        stopStream(stream);
        return;
      }
      if (liveness.length > 0) {
        stopStream(stream);
        block(liveness);
        return;
      }

      streamRef.current = stream;
      blockedRef.current = false;
      setFailures([]);
      setPhase('ready');

      // ── Watch for the stream dying underneath us (unplug, revoke, OS mute) ──
      for (const track of stream.getTracks()) {
        const device = deviceOfTrack(track);
        const onEnded = () => block([{ device, reason: 'track_ended' }]);
        const onMute = () => block([{ device, reason: 'track_muted' }]);
        track.addEventListener('ended', onEnded);
        track.addEventListener('mute', onMute);
        detachers.push(() => {
          track.removeEventListener('ended', onEnded);
          track.removeEventListener('mute', onMute);
        });
      }
      const onInactive = () => block([{ device: 'camera', reason: 'track_ended' }]);
      stream.addEventListener('inactive', onInactive);
      detachers.push(() => stream.removeEventListener('inactive', onInactive));

      poll = setInterval(() => {
        if (cancelled || blockedRef.current) return;
        const current = evaluateStreamTracks(streamRef.current);
        if (current.length > 0) block(current);
      }, WATCH_POLL_MS);
    }

    void run();

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      detachers.forEach(fn => fn());
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [enabled, generation]);

  const check = useCallback(() => {
    blockedRef.current = false;
    setFailures([]);
    setPhase('checking');
    setGeneration(g => g + 1);
  }, []);

  const verifyNow = useCallback(async (): Promise<MediaFailure[]> => {
    if (!enabled) return [];

    const stream = streamRef.current;
    const found: MediaFailure[] = [...evaluateStreamTracks(stream)];

    if (found.length === 0) {
      // Permission can be revoked from browser settings without ending the track in every
      // browser — ask the Permissions API directly before trusting the warm stream.
      found.push(...(await queryDeniedPermissions()));
    }
    if (found.length === 0 && stream) {
      const stillFlowing = await probeVideoSignal(stream, VIDEO_FRAME_RECHECK_MS);
      if (!stillFlowing) found.push({ device: 'camera', reason: 'no_signal' });
      found.push(...evaluateStreamTracks(stream));
    }

    const deduped = dedupeFailuresByDevice(found);
    if (deduped.length > 0) {
      blockedRef.current = true;
      setFailures(deduped);
      setPhase('blocked');
    }
    return deduped;
  }, [enabled]);

  return {
    status: enabled ? phase : 'disabled',
    failures,
    streamRef,
    check,
    verifyNow,
  };
}
