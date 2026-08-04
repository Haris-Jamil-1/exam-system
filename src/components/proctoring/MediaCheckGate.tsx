'use client';
// Device gate: the screen a student sees before the biometric step / instructions when the
// camera or microphone isn't genuinely usable. Every failure is named specifically (denied vs.
// no device vs. in use by another app vs. muted vs. producing nothing) with the actual fix —
// a generic "camera error" leaves a student with no idea what to do.
//
// The 2026-07-20 "Start without verification" escape hatch is preserved here rather than
// bypassed: a student whose hardware simply cannot work still has a way into the exam, and the
// teacher is still told (one high-severity unverified_start violation once the attempt exists).
import { Button } from '@/components/ui/button';
import { describeMediaFailure, type MediaFailure } from '@/lib/proctoring/media-readiness';
import { AlertTriangle, Camera, CheckCircle2, Loader2, Mic, RotateCcw, ShieldCheck } from 'lucide-react';

interface Props {
  status: 'checking' | 'blocked';
  failures: MediaFailure[];
  onRetry: () => void;
  /** Escape hatch — omitted only if the caller has no way to report the skip. */
  onSkip?: () => void;
}

export function MediaCheckGate({ status, failures, onRetry, onSkip }: Props) {
  const failedDevices = new Set(failures.map(f => f.device));

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-1">
          <ShieldCheck className="h-10 w-10 text-blue-400 mx-auto" />
          <h1 className="text-xl font-bold text-white">Device Check</h1>
          <p className="text-sm text-slate-400">
            This exam is proctored — your camera and microphone must both be working before it can start.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-slate-800 border-b border-slate-800">
            <DeviceTile
              icon={<Camera className="h-5 w-5" />}
              label="Camera"
              state={status === 'checking' ? 'checking' : failedDevices.has('camera') ? 'failed' : 'ok'}
            />
            <DeviceTile
              icon={<Mic className="h-5 w-5" />}
              label="Microphone"
              state={status === 'checking' ? 'checking' : failedDevices.has('microphone') ? 'failed' : 'ok'}
            />
          </div>

          <div className="p-6 space-y-4">
            {status === 'checking' ? (
              <p className="flex items-center justify-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking your camera and microphone…
              </p>
            ) : (
              <>
                {failures.map(failure => {
                  const copy = describeMediaFailure(failure);
                  return (
                    <div
                      key={`${failure.device}-${failure.reason}`}
                      className="rounded-lg bg-red-900/30 border border-red-800 p-3 text-xs text-red-200 space-y-1.5"
                    >
                      <p className="flex items-center gap-1.5 font-semibold text-red-100">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {copy.title}
                      </p>
                      <p>{copy.detail}</p>
                      <p className="text-red-300">{copy.fix}</p>
                    </div>
                  );
                })}
                <Button onClick={onRetry} className="w-full gap-2 bg-blue-600 hover:bg-blue-700">
                  <RotateCcw className="h-4 w-4" /> Check again
                </Button>
              </>
            )}

            {/* Escape hatch — same understated treatment and same teacher notification as the
                biometric gate's. Available while blocked only; there is nothing to bypass once
                both devices pass. */}
            {onSkip && status === 'blocked' && (
              <div className="border-t border-slate-800 pt-3 space-y-1.5">
                <button
                  type="button"
                  onClick={onSkip}
                  className="w-full text-center text-xs text-slate-400 underline underline-offset-2 hover:text-slate-200"
                >
                  Start without a working camera and microphone
                </button>
                <p className="flex items-center justify-center gap-1 text-center text-[10px] text-slate-500">
                  <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                  Your teacher will be notified that you started without a verified camera and microphone.
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-600">
          Camera and microphone are analyzed on your device for exam integrity. No continuous video or
          audio is recorded or uploaded.
        </p>
      </div>
    </div>
  );
}

function DeviceTile({ icon, label, state }: { icon: React.ReactNode; label: string; state: 'checking' | 'ok' | 'failed' }) {
  const tone =
    state === 'ok' ? 'text-green-400' : state === 'failed' ? 'text-red-400' : 'text-slate-400';
  return (
    <div className="flex items-center justify-center gap-2 p-4">
      <span className={tone}>{icon}</span>
      <span className="text-sm text-slate-200">{label}</span>
      {state === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
      {state === 'ok' && <CheckCircle2 className="h-4 w-4 text-green-400" />}
      {state === 'failed' && <AlertTriangle className="h-4 w-4 text-red-400" />}
    </div>
  );
}
