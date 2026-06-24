'use client';
// Biometric pre-exam gate — 3-step flow: webcam → ID document → verified
// Phase 3: replace simulated steps with real face-api.js capture + liveness check
// Phase 2: store biometricVerified:true on ExamAttempt before allowing student in
import { useState } from 'react';
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
  const [currentStep, setCurrentStep] = useState<Step>('webcam');
  const [processing, setProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [idDetected, setIdDetected] = useState(false);

  const stepIndex = STEPS.findIndex(s => s.id === currentStep);
  const step = STEPS[stepIndex];

  async function handleCaptureFace() {
    setProcessing(true);
    // Phase 3: run faceapi.detectSingleFace() on webcam stream
    await new Promise(r => setTimeout(r, 1800));
    setFaceDetected(true);
    setProcessing(false);
    setCurrentStep('id');
  }

  async function handleCaptureID() {
    setProcessing(true);
    // Phase 3: capture frame, send to OCR / ID verification endpoint
    await new Promise(r => setTimeout(r, 1500));
    setIdDetected(true);
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
          {/* Webcam preview area */}
          <div className="relative bg-slate-950 aspect-video flex items-center justify-center">
            {currentStep !== 'verified' ? (
              <>
                {/* Simulated webcam frame */}
                <div className="relative w-48 h-48 rounded-full border-4 border-dashed border-slate-700 flex items-center justify-center">
                  {currentStep === 'webcam' && (
                    <Camera className={`h-16 w-16 ${faceDetected ? 'text-green-400' : 'text-slate-600'}`} />
                  )}
                  {currentStep === 'id' && (
                    <CreditCard className={`h-16 w-16 ${idDetected ? 'text-green-400' : 'text-slate-600'}`} />
                  )}
                  {processing && (
                    <div className="absolute inset-0 rounded-full border-4 border-blue-400 border-t-transparent animate-spin" />
                  )}
                </div>
                {/* Corner alignment brackets */}
                <div className="absolute top-4 start-4 h-6 w-6 border-t-2 border-s-2 border-blue-400 rounded-tl-sm" />
                <div className="absolute top-4 end-4 h-6 w-6 border-t-2 border-e-2 border-blue-400 rounded-tr-sm" />
                <div className="absolute bottom-4 start-4 h-6 w-6 border-b-2 border-s-2 border-blue-400 rounded-bl-sm" />
                <div className="absolute bottom-4 end-4 h-6 w-6 border-b-2 border-e-2 border-blue-400 rounded-br-sm" />
              </>
            ) : (
              <div className="text-center space-y-3">
                <div className="h-20 w-20 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mx-auto">
                  <ShieldCheck className="h-10 w-10 text-green-400" />
                </div>
                <p className="text-green-400 font-semibold">Identity Confirmed</p>
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
