'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getExamById, getMonitorStudents, getMonitorFeed } from '@/lib/data';
import { useMonitorRealtime } from '@/hooks/useMonitorRealtime';
import { useWebRTCViewer } from '@/hooks/useWebRTCViewer';
import type { Exam, MonitorStudent, Violation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Users, CheckCircle, Clock, Eye, Camera, WifiOff, Send, StopCircle, Video, VideoOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_CONFIG: Record<MonitorStudent['status'], { label: string; class: 'success' | 'warning' | 'danger' | 'secondary' | 'outline' }> = {
  active:       { label: 'Active',       class: 'success'   },
  warning:      { label: 'Warning',      class: 'warning'   },
  flagged:      { label: 'Flagged',      class: 'danger'    },
  disconnected: { label: 'Disconnected', class: 'danger'    },
  submitted:    { label: 'Submitted',    class: 'secondary' },
  not_started:  { label: 'Not started',  class: 'outline'   },
};

const VIOLATION_LABELS: Record<string, string> = {
  tab_switch: 'Tab Switch', window_blur: 'Window Blur',
  fullscreen_exit: 'Fullscreen Exit', no_face: 'No Face',
  multiple_faces: 'Multiple Faces', audio_detected: 'Audio Detected',
  phone_detected: 'Phone Detected', gaze_away: 'Gaze Away',
  prohibited_object: 'Prohibited Object',
};

export default function MonitorPage() {
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<MonitorStudent[]>([]);
  const [feed, setFeed] = useState<Violation[]>([]);
  const [viewing, setViewing] = useState<MonitorStudent | null>(null);

  const refresh = useCallback(async () => {
    const [s, f] = await Promise.all([getMonitorStudents(examId), getMonitorFeed(examId)]);
    setStudents(s);
    setFeed(f.slice(0, 30));
  }, [examId]);

  // Decision 12: push-style notification ONLY for the highest-severity events
  // (multi-face, phone, sustained no-face — exactly the events the server
  // stamps high). Uses the browser Notification API when the tab is hidden;
  // full Web Push infra is the deferred scope valve from doc 04.
  const notifyHigh = useCallback((v: { type: string; description: string }) => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted' && document.visibilityState === 'hidden') {
      new Notification(`ExamPro: ${VIOLATION_LABELS[v.type] ?? v.type}`, { body: v.description });
    }
  }, []);

  const { live } = useMonitorRealtime({ examId, onRefresh: refresh, onHighSeverity: notifyHigh });

  useEffect(() => {
    async function load() {
      const e = await getExamById(examId);
      setExam(e ?? null);
      await refresh();
    }
    void load();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, [examId, refresh]);

  // Realtime is the fast path; polling stays as the safety net — 10s when the
  // websocket is down (feature parity with pre-Phase-3), 60s when live.
  useEffect(() => {
    const id = setInterval(() => void refresh(), live ? 60_000 : 10_000);
    return () => clearInterval(id);
  }, [refresh, live]);

  const active       = students.filter(s => s.status === 'active' || s.status === 'warning').length;
  const flagged      = students.filter(s => s.status === 'flagged' || s.status === 'disconnected').length;
  const submitted    = students.filter(s => s.status === 'submitted').length;

  if (!exam) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Users,         color: 'text-blue-500',  label: 'Enrolled',  value: students.length },
          { icon: CheckCircle,   color: 'text-green-500', label: 'Active',    value: active },
          { icon: AlertTriangle, color: 'text-red-500',   label: 'Attention', value: flagged },
          { icon: Clock,         color: 'text-gray-400',  label: 'Submitted', value: submitted },
        ].map(s => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${s.color}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-xl font-bold">{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Student grid — pre-sorted needs-attention-first by getMonitorStudents */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Student Status ({students.length})</span>
                <Badge variant={live ? 'success' : 'outline'} className="text-xs font-normal">
                  {live ? '● Live' : 'Polling'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {students.map(s => {
                  const cfg = STATUS_CONFIG[s.status];
                  const needsAttention = s.status === 'flagged' || s.status === 'disconnected';
                  return (
                    <div key={s.id} className={`border rounded-lg p-3 space-y-2 ${needsAttention ? 'border-red-200 bg-red-50/30' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                              {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.violationCount} violation{s.violationCount !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                        <Badge variant={cfg.class} className="text-xs">
                          {s.status === 'disconnected' && <WifiOff className="h-3 w-3 me-1" />}
                          {cfg.label}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Trust Score</span>
                          <span className={s.trustScore < 60 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                            {s.trustScore}%
                          </span>
                        </div>
                        <Progress value={s.trustScore} className={`h-1.5 ${s.trustScore < 60 ? '[&>div]:bg-red-500' : '[&>div]:bg-green-500'}`} />
                      </div>
                      <button
                        onClick={() => setViewing(s)}
                        disabled={!s.attemptId}
                        className="w-full text-xs flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Eye className="h-3.5 w-3.5" /> Review & Actions
                      </button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Violation feed */}
        <div>
          <Card className="h-full">
            <CardHeader><CardTitle>Live Alerts</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {feed.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No violations yet</p>
                ) : feed.map(v => (
                  <div key={v.id} className={`rounded-lg p-3 text-xs border-s-2 ${
                    v.severity === 'high'   ? 'border-red-500 bg-red-50' :
                    v.severity === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                    'border-blue-300 bg-blue-50'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{VIOLATION_LABELS[v.type] ?? v.type}</span>
                      <Badge variant={v.severity === 'high' ? 'danger' : v.severity === 'medium' ? 'warning' : 'info'} className="text-xs capitalize">
                        {v.severity}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground truncate">{v.description}</p>
                    <p className="text-muted-foreground mt-1">{formatDistanceToNow(new Date(v.timestamp), { addSuffix: true })}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Student review & actions modal */}
      <Dialog open={!!viewing} onOpenChange={open => { if (!open) setViewing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-blue-500" />
              {viewing?.name}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <StudentActionsModal
              student={viewing}
              violations={feed.filter(v => v.studentId === viewing.id)}
              onActionDone={() => void refresh()}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Student review & actions modal ────────────────────────────────────────
// Doc 04's on-demand snapshot pull is still the default view; "Go Live" opens a real
// peer-to-peer WebRTC connection to this one student's camera (signaled over a private,
// RLS-authorized Supabase Realtime channel — see useWebRTCViewer / LIVE_VIDEO_PROGRESS.md).
// Only one student's feed streams to this teacher at a time: the hook is keyed on
// attemptId, so it tears down the previous connection whenever this modal is reused for a
// different student, and closing the modal (unmount) always closes it too.
function StudentActionsModal({ student, violations, onActionDone }: {
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
