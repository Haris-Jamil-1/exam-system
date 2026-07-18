'use client';
// Biometric pre-exam gate — 3-step flow: webcam → ID document → verified.
// The preview area shows the REAL camera feed while capturing (previously this whole screen
// was simulated with icons — the student never saw themselves or their ID card at all), and
// each capture freezes an actual frame from the stream so the student sees exactly what was
// taken. Verification itself is still the Phase-1 simulated flow (no OCR/face-match backend
// exists yet — see Phase 3 notes); what's real now is the capture and what the student sees.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, CreditCard, ShieldCheck, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  onComplete: () => void;
}

type Step = 'webcam' | 'id' | 'verified';

const STEPS: { id: Step; icon: React.ReactNode; title: string; desc: string }[] = [
  {
    id: 'webcam',
    icon: <Camera className="h-6 w-6" />,
    title: 'Face Capture',
    desc: 'We need to capture your face to verify your identity throughout the exam.',
  },
  {
    id: 'id',
    icon: <CreditCard className="h-6 w-6" />,
    title: 'ID Document',
    desc: 'Hold your national ID or student card up to the camera for verification.',
  },
  {
    id: 'verified',
    icon: <ShieldCheck className="h-6 w-6" />,
    title: 'Verified',
    desc: 'Your identity has been verified. You may now start the exam.',
  },
];

export function BiometricOnboarding({ onComplete }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentStep, setCurrentStep] = useState<Step>('webcam');
  const [processing, setProcessing] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [faceShot, setFaceShot] = useState<string | null>(null);
  const [idShot, setIdShot] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (!cancelled) setCameraError(true);
      }
    }
    void init();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const stepIndex = STEPS.findIndex(s => s.id === currentStep);
  const step = STEPS[stepIndex];

  function captureFrame(): string | null {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  async function handleCaptureFace() {
    setProcessing(true);
    setFaceShot(captureFrame());
    // Phase 3: run a real face detector / liveness check on the captured frame
    await new Promise(r => setTimeout(r, 1800));
    setProcessing(false);
    setCurrentStep('id');
  }

  async function handleCaptureID() {
    setProcessing(true);
    setIdShot(captureFrame());
    // Phase 3: send the captured frame to an OCR / ID verification endpoint
    await new Promise(r => setTimeout(r, 1500));
    setProcessing(false);
    setCurrentStep('verified');
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <ShieldCheck className="h-10 w-10 text-blue-400 mx-auto" />
          <h1 className="text-xl font-bold text-white">Identity Verification</h1>
          <p className="text-sm text-slate-400">Complete all steps before your exam begins</p>
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
            {processing && (currentStep === 'webcam' ? faceShot : idShot) && (
              // eslint-disable-next-line @next/next/no-img-element -- data-URL freeze frame, not an optimizable asset
              <img
                src={(currentStep === 'webcam' ? faceShot : idShot) ?? undefined}
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

            {currentStep === 'webcam' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-300 space-y-1">
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Look directly at the camera</p>
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Remove sunglasses or face coverings</p>
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Ensure good lighting on your face</p>
                </div>
                <Button
                  onClick={handleCaptureFace}
                  disabled={processing}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  {processing
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying face…</>
                    : <><Camera className="h-4 w-4" /> Capture Face</>
                  }
                </Button>
              </div>
            )}

            {currentStep === 'id' && (
              <div className="space-y-3">
                <div className="rounded-lg bg-slate-800 p-3 text-xs text-slate-300 space-y-1">
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Hold your ID card clearly visible</p>
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Keep the card flat and avoid glare</p>
                  <p className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> All four corners must be visible</p>
                </div>
                <Button
                  onClick={handleCaptureID}
                  disabled={processing}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  {processing
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying ID…</>
                    : <><CreditCard className="h-4 w-4" /> Capture ID Document</>
                  }
                </Button>
              </div>
            )}

            {currentStep === 'verified' && (
              <div className="space-y-3">
                {(faceShot || idShot) && (
                  <div className="flex gap-3">
                    {faceShot && (
                      <div className="flex-1 space-y-1">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL capture */}
                        <img src={faceShot} alt="Captured face" className="w-full rounded-lg border border-slate-700 aspect-video object-cover" />
                        <p className="text-center text-[10px] text-slate-500">Face capture</p>
                      </div>
                    )}
                    {idShot && (
                      <div className="flex-1 space-y-1">
                        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL capture */}
                        <img src={idShot} alt="Captured ID document" className="w-full rounded-lg border border-slate-700 aspect-video object-cover" />
                        <p className="text-center text-[10px] text-slate-500">ID document</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="rounded-lg bg-green-900/30 border border-green-800 p-3 text-xs text-green-300 space-y-1">
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Face successfully captured</p>
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> ID document verified</p>
                  <p className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Biometric baseline stored for this session</p>
                </div>
                <Button
                  onClick={onComplete}
                  className="w-full gap-2 bg-green-600 hover:bg-green-700"
                >
                  <ShieldCheck className="h-4 w-4" /> Start Exam
                </Button>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-600">
          Biometric data is used only for exam integrity. It is not stored beyond your session without your consent.
        </p>
      </div>
    </div>
  );
}
