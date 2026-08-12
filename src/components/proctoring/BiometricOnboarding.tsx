'use client';
// Biometric pre-exam gate — face-only capture, 2-step flow: webcam → verified.
// (ID document capture/matching was removed in the 2026-08-12 session — see CLAUDE.md.)
// The preview shows the REAL camera feed; the capture must contain exactly one live face
// (any other object, or more than one face, is rejected — src/lib/face-verification.ts).
// The captured photo is uploaded and shown to the teacher on the live monitor so a human can
// make the identity call — this component does no automated face matching. Still out of scope
// client-side: OCR, document checks, and anti-spoof liveness.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { preloadFaceModels, analyzeLiveFace } from '@/lib/face-verification';
import { Camera, ShieldCheck, Loader2, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  /** photoPath is the uploaded storage path (exam-uploads bucket) if the upload succeeded, or
   *  null if it failed — never blocks the exam, the teacher just won't have a photo to review. */
  onComplete: (photoPath: string | null) => void;
  /**
   * Escape hatch: enter the exam without face verification. The caller is responsible
   * for reporting the skip to the teacher (an `unverified_start` violation on the attempt).
   */
  onSkip?: () => void;
  /**
   * Camera+microphone stream already acquired and liveness-verified by the device gate
   * (useMediaReadiness). When present it is reused instead of opening a second camera stream,
   * and is NOT stopped here — the gate owns its lifetime. Falls back to its own getUserMedia
   * when absent, so this component still works standalone.
   */
  streamRef?: React.RefObject<MediaStream | null>;
}

type Step = 'webcam' | 'verified';

const STEPS: { id: Step; icon: React.ReactNode; title: string; desc: string }[] = [
  {
    id: 'webcam',
    icon: <Camera className="h-6 w-6" />,
    title: 'Face Capture',
    desc: 'We need to capture your face to verify your identity throughout the exam.',
  },
  {
    id: 'verified',
    icon: <ShieldCheck className="h-6 w-6" />,
    title: 'Verified',
    desc: 'Your identity has been verified. You may now start the exam.',
  },
];

const ERROR_MESSAGES: Record<string, string> = {
  no_face: 'No face detected. Look straight at the camera in good lighting and try again.',
  multiple_faces: 'More than one face detected. Make sure you are alone in the frame.',
  face_too_small: 'Move closer so your face fills the circle guide, then capture again.',
  model_unavailable: 'Identity verification could not load. Check your connection, then retry.',
  camera_unavailable: 'Camera frame unavailable — check your camera permission and try again.',
};

async function uploadVerificationPhoto(canvas: HTMLCanvasElement): Promise<string | null> {
  try {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) return null;
    const form = new FormData();
    form.append('file', new File([blob], 'verification.jpg', { type: 'image/jpeg' }));
    form.append('folder', 'verification');
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    if (!res.ok) return null;
    const data = (await res.json()) as { path?: string };
    return data.path ?? null;
  } catch {
    return null;
  }
}

export function BiometricOnboarding({ onComplete, onSkip, streamRef }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoPathRef = useRef<string | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>('webcam');
  const [processing, setProcessing] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [faceShot, setFaceShot] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    // Only set when this component opened the camera itself — a stream handed down by the
    // device gate belongs to the gate and must not be stopped from here.
    let ownedStream: MediaStream | null = null;
    let cancelled = false;

    async function init() {
      const shared = streamRef?.current ?? null;
      if (shared && shared.getVideoTracks().some(t => t.readyState === 'live')) {
        if (videoRef.current) videoRef.current.srcObject = shared;
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        ownedStream = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setCameraError(true);
      }
    }
    void init();
    // Warm the detection model while the student reads the instructions.
    void preloadFaceModels().then(ok => {
      if (!cancelled) setModelState(ok ? 'ready' : 'failed');
    });

    return () => {
      cancelled = true;
      ownedStream?.getTracks().forEach(t => t.stop());
    };
  }, [streamRef]);

  const stepIndex = STEPS.findIndex(s => s.id === currentStep);
  const step = STEPS[stepIndex];

  function captureFrame(): { canvas: HTMLCanvasElement; dataUrl: string } | null {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return { canvas, dataUrl: canvas.toDataURL('image/jpeg', 0.85) };
  }

  async function retryModels() {
    setModelState('loading');
    setVerifyError(null);
    const ok = await preloadFaceModels();
    setModelState(ok ? 'ready' : 'failed');
  }

  async function handleCaptureFace() {
    setProcessing(true);
    setVerifyError(null);
    const frame = captureFrame();
    if (!frame) {
      setVerifyError(ERROR_MESSAGES.camera_unavailable);
      setProcessing(false);
      return;
    }
    setFaceShot(frame.dataUrl);
    const result = await analyzeLiveFace(frame.canvas);
    if (!result.ok) {
      setProcessing(false);
      setFaceShot(null);
      setVerifyError(ERROR_MESSAGES[result.reason]);
      return;
    }
    // Best-effort, non-blocking: a failed upload never stops the exam — the teacher just won't
    // have a photo to review for this student, which is a graceful degradation, not a hard gate.
    photoPathRef.current = await uploadVerificationPhoto(frame.canvas);
    setProcessing(false);
    setCurrentStep('verified');
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <ShieldCheck className="h-10 w-10 text-blue-400 mx-auto" />
          <h1 className="text-xl font-bold text-white">Identity Verification</h1>
          <p className="text-sm text-slate-400">Complete this step before your exam begins</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-0">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold border-2 transition-colors ${
                i < stepIndex
                  ? 'bg-green-500 border-green-500 text-white'
                  : i === stepIndex
                  ? 'border-blue-400 text-blue-400'
                  : 'border-slate-700 text-slate-600'
              }`}>
                {i < stepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-12 mx-1 ${i < stepIndex ? 'bg-green-500' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Main card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          {/* Live camera preview area */}
          <div className="relative bg-slate-950 aspect-video overflow-hidden">
            {/* The stream stays mounted across steps; overlays shape the framing per step. */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`absolute inset-0 h-full w-full object-cover ${currentStep === 'verified' ? 'opacity-20' : ''}`}
            />

            {cameraError && currentStep !== 'verified' && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80">
                <div className="text-center space-y-2 px-6">
                  <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto" />
                  <p className="text-sm text-slate-300">
                    Camera unavailable — check your browser&apos;s camera permission.
                  </p>
                </div>
              </div>
            )}

            {/* Freeze-frame of the shot being verified */}
            {processing && faceShot && (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL freeze frame, not an optimizable asset
              <img
                src={faceShot}
                alt="Captured frame"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}

            {currentStep === 'webcam' && !cameraError && (
              /* Face alignment guide */
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`w-44 h-44 rounded-full border-4 border-dashed ${processing ? 'border-blue-400' : 'border-white/60'}`} />
              </div>
            )}

            {currentStep !== 'verified' && (
              <>
                {/* Corner alignment brackets */}
                <div className="absolute top-4 start-4 h-6 w-6 border-t-2 border-s-2 border-blue-400 rounded-tl-sm" />
                <div className="absolute top-4 end-4 h-6 w-6 border-t-2 border-e-2 border-blue-400 rounded-tr-sm" />
                <div className="absolute bottom-4 start-4 h-6 w-6 border-b-2 border-s-2 border-blue-400 rounded-bl-sm" />
                <div className="absolute bottom-4 end-4 h-6 w-6 border-b-2 border-e-2 border-blue-400 rounded-br-sm" />
                {processing && (
                  <div className="absolute bottom-4 start-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-3 py-1 text-xs text-blue-300 flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing capture…
                  </div>
                )}
              </>
            )}

            {currentStep === 'verified' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="h-20 w-20 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mx-auto">
                    <ShieldCheck className="h-10 w-10 text-green-400" />
                  </div>
                  <p className="text-green-400 font-semibold">Identity Confirmed</p>
                </div>
              </div>
            )}
          </div>

          {/* Step content */}
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-blue-400">{step?.icon}</div>
              <div>
                <h2 className="text-white font-semibold">{step?.title}</h2>
                <p className="text-sm text-slate-400">{step?.desc}</p>
              </div>
            </div>

            {modelState === 'loading' && currentStep !== 'verified' && (
              <p className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading verification model…
              </p>
            )}

            {modelState === 'failed' && currentStep !== 'verified' && (
              <div className="rounded-lg bg-red-900/30 border border-red-800 p-3 text-xs text-red-300 space-y-2">
                <p className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {ERROR_MESSAGES.model_unavailable}
                </p>
                <Button size="sm" variant="outline" onClick={retryModels} className="gap-1.5 h-7 text-xs border-red-700 bg-transparent text-red-200 hover:bg-red-900/40">
                  <RotateCcw className="h-3 w-3" /> Retry loading
                </Button>
              </div>
            )}

            {verifyError && !processing && (
              <div className="rounded-lg bg-amber-900/30 border border-amber-800 p-3 text-xs text-amber-200 space-y-2">
                <p className="flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> <span>{verifyError}</span>
                </p>
              </div>
            )}

            {currentStep === 'webcam' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-300 space-y-1">
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Look directly at the camera</p>
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Remove sunglasses or face coverings</p>
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Ensure good lighting on your face</p>
                </div>
                <Button
                  onClick={handleCaptureFace}
                  disabled={processing || cameraError || modelState !== 'ready'}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  {processing
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying face…</>
                    : <><Camera className="h-4 w-4" /> Capture Face</>
                  }
                </Button>
              </div>
            )}

            {/* Escape hatch: always available before verification completes (covers broken
                cameras and model-load failures too). The skip itself is reported to the
                teacher as an unverified_start violation once the attempt starts. */}
            {onSkip && currentStep !== 'verified' && (
              <div className="border-t border-slate-800 pt-3 space-y-1.5">
                <button
                  type="button"
                  onClick={onSkip}
                  disabled={processing}
                  className="w-full text-center text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200 disabled:opacity-50"
                >
                  Start without verification
                </button>
                <p className="flex items-center justify-center gap-1 text-center text-[10px] text-slate-500">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                  Your teacher will be notified that you started without identity verification.
                </p>
              </div>
            )}

            {currentStep === 'verified' && (
              <div className="space-y-3">
                {faceShot && (
                  <div className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data-URL capture */}
                    <img src={faceShot} alt="Captured face" className="w-full rounded-lg border border-slate-700 aspect-video object-cover" />
                    <p className="text-center text-[10px] text-slate-500">Face capture — visible to your teacher on the live monitor</p>
                  </div>
                )}
                <div className="rounded-lg bg-green-900/30 border border-green-800 p-3 text-xs text-green-300 space-y-1">
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Face detected and captured</p>
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Biometric baseline stored for this session</p>
                </div>
                <Button
                  onClick={() => onComplete(photoPathRef.current)}
                  className="w-full gap-2 bg-green-600 hover:bg-green-700"
                >
                  <ShieldCheck className="h-4 w-4" /> Start Exam
                </Button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-600">
          Biometric data is processed entirely in your browser. Your captured photo is shared with your teacher for exam integrity review.
        </p>
      </div>
    </div>
  );
}
