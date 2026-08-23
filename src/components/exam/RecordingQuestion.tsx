'use client';
// Advanced Item Types (notes.pdf): audio_response/video_response answer capture. Mirrors
// FileUploadQuestion.tsx's prop shape exactly (`value: File | null`, `onChange`) so the exam
// page's existing upload-at-submit-time flow (fileAnswers state, uploaded together with every
// other file_upload answer in doSubmit/handleSectionSubmit) needs zero changes to support this —
// a recorded take is just a File like any other.
import { useEffect, useRef, useState } from 'react';
import type { Question } from '@/types';
import { Button } from '@/components/ui/button';
import { Mic, Video, Play, Square, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  question: Question;
  value: File | null;
  onChange: (file: File | null) => void;
}

type Phase = 'idle' | 'requesting' | 'prep' | 'recording' | 'recorded' | 'error';

const AUDIO_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg'];
const VIDEO_MIME_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'];

function pickMimeType(candidates: string[]): string | null {
  return candidates.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? null;
}

/** Draws the webcam feed and (if present) the screen-share feed side-by-side onto one canvas,
 * returning a MediaStream of that composite plus the microphone audio track — the actual
 * mechanism behind "screen + webcam side-by-side" (a real capability, not just a checkbox that
 * does nothing): a plain MediaRecorder can only record a single video track, so compositing two
 * live video sources requires drawing both onto a canvas every frame and recording the canvas. */
function compositeStream(webcam: MediaStream, screen: MediaStream): { stream: MediaStream; stop: () => void } {
  const webcamVideo = document.createElement('video');
  webcamVideo.srcObject = webcam;
  webcamVideo.muted = true;
  void webcamVideo.play();
  const screenVideo = document.createElement('video');
  screenVideo.srcObject = screen;
  screenVideo.muted = true;
  void screenVideo.play();

  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;
  let raf = 0;
  function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Screen on the left two-thirds, webcam as a smaller panel on the right — side-by-side.
    const screenW = Math.round(canvas.width * 0.67);
    ctx.drawImage(screenVideo, 0, 0, screenW, canvas.height);
    ctx.drawImage(webcamVideo, screenW, 0, canvas.width - screenW, canvas.height);
    raf = requestAnimationFrame(draw);
  }
  draw();

  const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
  const audioTrack = webcam.getAudioTracks()[0];
  const combined = new MediaStream([...canvasStream.getVideoTracks(), ...(audioTrack ? [audioTrack] : [])]);

  return {
    stream: combined,
    stop: () => {
      cancelAnimationFrame(raf);
      webcamVideo.pause();
      screenVideo.pause();
    },
  };
}

export function RecordingQuestion({ question, value, onChange }: Props) {
  const isVideo = question.type === 'video_response';
  const settings = question.mediaSettings;
  const prepTimeSeconds = settings?.prepTimeSeconds ?? 0;
  const minDurationSeconds = settings?.minDurationSeconds ?? 0;
  const maxDurationSeconds = settings?.maxDurationSeconds ?? 120;
  const maxRetries = settings?.maxRetries ?? 0;
  const allowScreenShare = isVideo && !!settings?.allowScreenShare;

  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [prepSecondsLeft, setPrepSecondsLeft] = useState(prepTimeSeconds);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [retriesUsed, setRetriesUsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [useScreenShare, setUseScreenShare] = useState(false);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamsRef = useRef<MediaStream[]>([]);
  const compositeStopRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      compositeStopRef.current?.();
      streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- teardown-only, deliberately mount/unmount scoped
  }, []);

  function teardownStreams() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    compositeStopRef.current?.();
    compositeStopRef.current = null;
    streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    streamsRef.current = [];
  }

  async function startCapture() {
    setError(null);
    setPhase('requesting');
    try {
      const webcam = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
      if (cancelledRef.current) { webcam.getTracks().forEach(t => t.stop()); return; }
      streamsRef.current.push(webcam);

      let recordingStream = webcam;
      if (isVideo && useScreenShare && allowScreenShare) {
        try {
          const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
          streamsRef.current.push(screen);
          const { stream, stop } = compositeStream(webcam, screen);
          recordingStream = stream;
          compositeStopRef.current = stop;
        } catch {
          // Screen-share permission denied/cancelled — fall back to webcam-only rather than blocking the question entirely.
        }
      }

      if (isVideo && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = webcam;
        void videoPreviewRef.current.play();
      }

      const mimeType = pickMimeType(isVideo ? VIDEO_MIME_TYPES : AUDIO_MIME_TYPES);
      if (!mimeType) throw new Error('Recording is not supported in this browser.');
      const recorder = new MediaRecorder(recordingStream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.split('/')[1].split(';')[0];
        const file = new File([blob], `${question.id}-response.${ext}`, { type: mimeType });
        onChange(file);
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase('recorded');
      };

      if (prepTimeSeconds > 0) {
        setPhase('prep');
        setPrepSecondsLeft(prepTimeSeconds);
        timerRef.current = setInterval(() => {
          setPrepSecondsLeft(s => {
            if (s <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              beginRecording();
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      } else {
        beginRecording();
      }
    } catch (err) {
      teardownStreams();
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Could not access your microphone/camera.');
    }
  }

  function beginRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setPhase('recording');
    setRecordedSeconds(0);
    recorder.start();
    timerRef.current = setInterval(() => {
      setRecordedSeconds(s => {
        const next = s + 1;
        if (next >= maxDurationSeconds) stopRecording();
        return next;
      });
    }, 1000);
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    recorderRef.current?.stop();
    teardownStreams();
  }

  function handleRetry() {
    setRetriesUsed(r => r + 1);
    onChange(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPhase('idle');
  }

  const canRetry = retriesUsed < maxRetries;
  const belowMinimum = phase === 'recorded' && minDurationSeconds > 0 && recordedSeconds < minDurationSeconds;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border bg-purple-50 border-purple-100 p-3 text-xs text-purple-800">
        {isVideo ? <Video className="h-4 w-4 shrink-0 mt-0.5 text-purple-600" /> : <Mic className="h-4 w-4 shrink-0 mt-0.5 text-purple-600" />}
        <div className="space-y-0.5">
          <p className="font-semibold">{isVideo ? 'Video' : 'Audio'} Response</p>
          <p>
            {minDurationSeconds > 0 && `Min ${minDurationSeconds}s · `}Max {maxDurationSeconds}s
            {prepTimeSeconds > 0 && ` · ${prepTimeSeconds}s to prepare before recording starts`}
            {maxRetries > 0 && ` · ${maxRetries - retriesUsed} retake${maxRetries - retriesUsed === 1 ? '' : 's'} left`}
          </p>
          <p className="text-purple-600 italic">This response will be reviewed manually by your teacher after the exam.</p>
        </div>
      </div>

      {allowScreenShare && phase === 'idle' && (
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={useScreenShare} onChange={e => setUseScreenShare(e.target.checked)} className="h-3.5 w-3.5" />
          Share my screen alongside my webcam
        </label>
      )}

      {isVideo && (phase === 'requesting' || phase === 'prep' || phase === 'recording') && (
        <video ref={videoPreviewRef} muted playsInline className="w-full max-w-md rounded-lg border bg-black aspect-video" />
      )}

      {phase === 'idle' && (
        <Button type="button" onClick={() => void startCapture()} className="gap-2">
          <Play className="h-4 w-4" /> Start Recording
        </Button>
      )}

      {phase === 'requesting' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Requesting camera/microphone access…</p>
      )}

      {phase === 'prep' && (
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 text-purple-700 font-bold text-lg">{prepSecondsLeft}</div>
          <p className="text-sm text-muted-foreground">Get ready — recording starts automatically.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => { if (timerRef.current) clearInterval(timerRef.current); beginRecording(); }}>
            Skip Prep
          </Button>
        </div>
      )}

      {phase === 'recording' && (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
            <span className="h-2 w-2 rounded-full bg-red-600 animate-pulse" /> Recording {recordedSeconds}s / {maxDurationSeconds}s
          </span>
          <Button type="button" variant="destructive" size="sm" onClick={stopRecording} className="gap-1.5">
            <Square className="h-3.5 w-3.5" /> Stop
          </Button>
        </div>
      )}

      {phase === 'recorded' && value && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
            {isVideo && previewUrl ? (
              <video src={previewUrl} controls className="w-full max-w-md rounded-lg" />
            ) : previewUrl ? (
              <audio src={previewUrl} controls className="w-full" />
            ) : null}
          </div>
          {belowMinimum && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> This recording is shorter than the required minimum of {minDurationSeconds}s.
            </p>
          )}
          {canRetry && (
            <Button type="button" variant="outline" size="sm" onClick={handleRetry} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Re-record ({maxRetries - retriesUsed} left)
            </Button>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          <div className="space-y-1.5">
            <p>{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void startCapture()}>Try Again</Button>
          </div>
        </div>
      )}

      {question.required && !value && phase === 'idle' && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          This question requires a recorded response before you can proceed.
        </p>
      )}
    </div>
  );
}
