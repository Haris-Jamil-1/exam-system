'use client';
// Shared per-student "Review & Actions" panel — used by both the per-exam monitor page
// (teacher/exams/[examId]/monitor) and the cross-exam Live Monitor overview
// (teacher/monitor). Doc 04's on-demand snapshot pull is still the default view; "Go Live"
// opens a real peer-to-peer WebRTC connection to this one student's camera (signaled over a
// private, RLS-authorized Supabase Realtime channel — see useWebRTCViewer /
// LIVE_VIDEO_PROGRESS.md). Only one student's feed streams to this teacher at a time: the
// hook is keyed on attemptId, so it tears down the previous connection whenever this modal is
// reused for a different student, and closing the modal (unmount) always closes it too.
import { useState, useEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Camera, Send, StopCircle, Video, VideoOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useWebRTCViewer } from '@/hooks/useWebRTCViewer';
import type { MonitorStudent, Violation } from '@/types';

export const STATUS_CONFIG: Record<MonitorStudent['status'], { label: string; class: 'success' | 'warning' | 'danger' | 'secondary' | 'outline' }> = {
  active:       { label: 'Active',       class: 'success'   },
  warning:      { label: 'Warning',      class: 'warning'   },
  flagged:      { label: 'Flagged',      class: 'danger'    },
  disconnected: { label: 'Disconnected', class: 'danger'    },
  submitted:    { label: 'Submitted',    class: 'secondary' },
  not_started:  { label: 'Not started',  class: 'outline'   },
};

export const VIOLATION_LABELS: Record<string, string> = {
  tab_switch: 'Tab Switch', window_blur: 'Gaze/Voice Violation',
  fullscreen_exit: 'Fullscreen Exit', no_face: 'No Face',
  multiple_faces: 'Multiple Faces', audio_detected: 'Audio Detected',
  phone_detected: 'Phone Detected', gaze_away: 'Gaze Away',
  prohibited_object: 'Prohibited Object',
};

export function StudentActionsModal({ student, violations, onActionDone }: {
  student: MonitorStudent;
  violations: Violation[];
  onActionDone: () => void;
}) {
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotState, setSnapshotState] = useState<'idle' | 'waiting' | 'failed'>('idle');
  const [warningText, setWarningText] = useState('');
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [confirmingForce, setConfirmingForce] = useState(false);
  const pollAbort = useRef(false);

  useEffect(() => {
    pollAbort.current = false;
    return () => { pollAbort.current = true; };
  }, []);

  const attemptId = student.attemptId;
  const inProgress = student.attemptStatus === 'in_progress';
  const { videoRef, state: liveState, errorMessage: liveError, start: startLive, stop: stopLive } = useWebRTCViewer(attemptId ?? null);
  const isLive = liveState !== 'idle';

  async function requestSnapshot() {
    if (!attemptId) return;
    setSnapshotState('waiting');
    setSnapshotUrl(null);
    try {
      const res = await fetch('/api/monitor/directives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId, kind: 'snapshot' }),
      });
      if (!res.ok) throw new Error();
      const directive = (await res.json()) as { id: string };

      // Poll for fulfilment (student round trip target < 5s; give up at 30s).
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        if (pollAbort.current) return;
        const listRes = await fetch(`/api/monitor/directives?attemptId=${attemptId}`);
        if (!listRes.ok) continue;
        const list = (await listRes.json()) as { id: string; status: string }[];
        const mine = list.find(d => d.id === directive.id);
        if (mine?.status === 'fulfilled') {
          const evidenceRes = await fetch(`/api/evidence?directiveId=${directive.id}`);
          if (evidenceRes.ok) {
            const { url } = (await evidenceRes.json()) as { url: string };
            if (!pollAbort.current) {
              setSnapshotUrl(url);
              setSnapshotState('idle');
            }
            return;
          }
        }
        if (mine?.status === 'failed') break;
      }
      if (!pollAbort.current) setSnapshotState('failed');
    } catch {
      if (!pollAbort.current) setSnapshotState('failed');
    }
  }

  async function sendWarning() {
    if (!attemptId || !warningText.trim()) return;
    const res = await fetch('/api/monitor/directives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attemptId, kind: 'warning', message: warningText.trim() }),
    });
    setActionMsg(res.ok ? 'Warning sent — it appears as a banner on the student\'s screen.' : 'Could not send warning.');
    if (res.ok) setWarningText('');
  }

  async function forceSubmit() {
    if (!attemptId) return;
    setConfirmingForce(false);
    // Live client: directive makes the student's browser submit its answers.
    // Dead client (disconnected): finalize server-side with what exists.
    const endpoint = student.status === 'disconnected' ? '/api/monitor/force-finalize' : '/api/monitor/directives';
    const body = student.status === 'disconnected'
      ? { attemptId }
      : { attemptId, kind: 'force_submit' };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setActionMsg(res.ok
      ? (student.status === 'disconnected'
        ? 'Attempt finalized (no client response — scored on received answers).'
        : 'Submit instruction sent to the student\'s browser.')
      : 'Force submit failed.');
    onActionDone();
  }

  const cfg = STATUS_CONFIG[student.status];

  return (
    <div className="space-y-4">
      {/* On-demand snapshot, or a live peer-to-peer feed once "Go Live" is clicked */}
      <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video">
        {isLive ? (
          <>
            {/* Always mounted while live so the ref is attached before the remote track
                arrives; hidden (not unmounted) until the connection actually reaches
                'connected', so the status overlay stays visible over a blank frame. */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${liveState === 'connected' ? '' : 'hidden'}`}
            />
            {liveState !== 'connected' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2 px-4 text-center">
                {liveState === 'connecting' ? (
                  <Video className="h-10 w-10 opacity-30 animate-pulse" />
                ) : (
                  <VideoOff className="h-10 w-10 opacity-30" />
                )}
                <p className="text-sm opacity-60">
                  {liveState === 'connecting' ? 'Connecting to the student\'s camera…' : liveError}
                </p>
              </div>
            )}
          </>
        ) : snapshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, next/image can't optimize it
          <img src={snapshotUrl} alt={`Snapshot of ${student.name}`} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
            <Camera className="h-10 w-10 opacity-30" />
            <p className="text-sm opacity-60">
              {snapshotState === 'waiting' ? 'Requesting snapshot…' :
               snapshotState === 'failed' ? 'Snapshot unavailable (student offline or camera blocked)' :
               'No snapshot requested yet'}
            </p>
          </div>
        )}
        {inProgress && (
          <div className="absolute bottom-2 end-2 flex gap-2">
            {isLive ? (
              <Button size="sm" variant="destructive" onClick={() => stopLive()}>
                <VideoOff className="h-3.5 w-3.5 me-1.5" /> Stop live
              </Button>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => void requestSnapshot()} disabled={snapshotState === 'waiting'}>
                  <Camera className="h-3.5 w-3.5 me-1.5" />
                  {snapshotState === 'waiting' ? 'Waiting…' : 'Request snapshot'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => attemptId && startLive(attemptId)}>
                  <Video className="h-3.5 w-3.5 me-1.5" /> Go live
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Student info */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-[#F4F7FC] p-3 text-center">
          <p className="text-[11px] text-[#9CA3AF]">Status</p>
          <Badge variant={cfg.class} className="mt-1 text-xs">{cfg.label}</Badge>
        </div>
        <div className="rounded-xl bg-[#F4F7FC] p-3 text-center">
          <p className="text-[11px] text-[#9CA3AF]">Trust</p>
          <p className={`text-[18px] font-extrabold mt-0.5 ${student.trustScore < 60 ? 'text-red-600' : 'text-green-600'}`}>
            {student.trustScore}%
          </p>
        </div>
        <div className="rounded-xl bg-[#F4F7FC] p-3 text-center">
          <p className="text-[11px] text-[#9CA3AF]">Violations</p>
          <p className={`text-[18px] font-extrabold mt-0.5 ${student.violationCount > 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {student.violationCount}
          </p>
        </div>
      </div>

      {/* Actions */}
      {inProgress && (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold text-[#6B7280]">Actions</p>
          <div className="flex gap-2">
            <input
              value={warningText}
              onChange={e => setWarningText(e.target.value)}
              placeholder="Warning message to the student…"
              maxLength={200}
              className="flex-1 rounded-lg border px-3 py-1.5 text-xs"
            />
            <Button size="sm" variant="outline" onClick={() => void sendWarning()} disabled={!warningText.trim()}>
              <Send className="h-3.5 w-3.5 me-1" /> Warn
            </Button>
          </div>
          {confirmingForce ? (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-2">
              <p className="text-xs text-red-700 flex-1">
                {student.status === 'disconnected'
                  ? 'Client unreachable — finalize this attempt now? Unsubmitted answers are lost.'
                  : 'Force this student to submit now?'}
              </p>
              <Button size="sm" variant="destructive" onClick={() => void forceSubmit()}>Confirm</Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmingForce(false)}>Cancel</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmingForce(true)}>
              <StopCircle className="h-3.5 w-3.5 me-1" /> Force submit
            </Button>
          )}
          {actionMsg && <p className="text-xs text-muted-foreground">{actionMsg}</p>}
        </div>
      )}

      {/* Violations timeline */}
      <div className="space-y-1.5">
        <p className="text-[12px] font-semibold text-[#6B7280]">
          Violations Timeline {violations.length > 0 ? `(${violations.length})` : ''}
        </p>
        {violations.length === 0 ? (
          <p className="text-xs text-[#9CA3AF] py-2 text-center">No violations recorded</p>
        ) : (
          <div className="max-h-[200px] overflow-y-auto space-y-1.5 pr-1">
            {violations.map(v => (
              <div key={v.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                v.severity === 'high'   ? 'border-red-200 bg-red-50' :
                v.severity === 'medium' ? 'border-yellow-200 bg-yellow-50' :
                'border-blue-100 bg-blue-50'
              }`}>
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant={v.severity === 'high' ? 'danger' : v.severity === 'medium' ? 'warning' : 'info'}
                    className="text-[10px] capitalize shrink-0"
                  >
                    {v.severity}
                  </Badge>
                  <span className="text-xs truncate">{VIOLATION_LABELS[v.type] ?? v.type}</span>
                </div>
                <span className="text-[10px] text-[#9CA3AF] shrink-0 ml-2">
                  {formatDistanceToNow(new Date(v.timestamp), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
