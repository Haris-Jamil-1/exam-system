'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getExamById, getMonitorPageData } from '@/lib/data';
import { useMonitorRealtime } from '@/hooks/useMonitorRealtime';
import type { Exam, MonitorStudent, Violation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Users, CheckCircle, Clock, Eye, Camera, WifiOff, History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { StudentActionsModal, STATUS_CONFIG, VIOLATION_LABELS } from '@/components/shared/StudentActionsModal';
import { trustScoreTextClass, trustScoreProgressClass } from '@/lib/trust-score';
import { DateTimeField } from '@/components/shared/DateTimeField';

interface EndTimeChange {
  id: string;
  oldEndTime: string;
  newEndTime: string;
  changedByName: string;
  createdAt: string;
}

export default function MonitorPage() {
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<MonitorStudent[]>([]);
  const [feed, setFeed] = useState<Violation[]>([]);
  // Holds only the id, never a frozen student object — StudentActionsModal previously froze
  // trust score/violation count at whatever they were the moment the modal opened, because
  // `viewing` held a one-time snapshot that never re-synced with `students` as it kept
  // polling/refreshing underneath. Deriving the live object from `students` at render time
  // makes staleness structurally impossible: there is only ever one copy of this data.
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = students.find(s => s.id === viewingId) ?? null;

  // Extend/Change End Time (2026-08-12) — mid-exam, teacher-initiated, notifies every
  // in-progress student in real time via PATCH /api/exams/[examId]/end-time.
  const [extendOpen, setExtendOpen] = useState(false);
  const [extendValue, setExtendValue] = useState('');
  const [extendError, setExtendError] = useState('');
  // A shrink (new end time earlier than the current one) requires an explicit second
  // confirmation — students may lose time they were already counting on.
  const [extendConfirmingShrink, setExtendConfirmingShrink] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extendResult, setExtendResult] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<EndTimeChange | null>(null);

  // One server action instead of two. These are polled every 10–60s, so the
  // second serialized round trip was being paid continuously, not just on load.
  const refresh = useCallback(async () => {
    const { students: s, feed: f } = await getMonitorPageData(examId);
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
      new Notification(`Evalix: ${VIOLATION_LABELS[v.type] ?? v.type}`, { body: v.description });
    }
  }, []);

  const { live } = useMonitorRealtime({ examId, onRefresh: refresh, onHighSeverity: notifyHigh });

  const loadLastChange = useCallback(async () => {
    try {
      const res = await fetch(`/api/exams/${examId}/end-time?limit=1`);
      if (!res.ok) return;
      const list = (await res.json()) as EndTimeChange[];
      setLastChange(list[0] ?? null);
    } catch {
      // Non-critical — the audit strip just stays empty.
    }
  }, [examId]);

  useEffect(() => {
    async function load() {
      const e = await getExamById(examId);
      setExam(e ?? null);
      await refresh();
      await loadLastChange();
    }
    void load();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, [examId, refresh, loadLastChange]);

  async function submitExtend() {
    if (!exam) return;
    setExtendError('');
    if (!extendValue) {
      setExtendError('Choose a new end time.');
      return;
    }
    const newEnd = new Date(extendValue);
    if (Number.isNaN(newEnd.getTime()) || newEnd.getTime() <= Date.now()) {
      setExtendError('New end time must be in the future.');
      return;
    }
    const isShrink = newEnd.getTime() < new Date(exam.endTime).getTime();
    if (isShrink && !extendConfirmingShrink) {
      setExtendConfirmingShrink(true);
      return;
    }
    setExtending(true);
    try {
      const res = await fetch(`/api/exams/${examId}/end-time`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEndTime: newEnd.toISOString() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExtendError(typeof data.message === 'string' ? data.message : 'Could not update the end time.');
        return;
      }
      setExam(prev => (prev ? { ...prev, endTime: data.newEndTime } : prev));
      setExtendResult(`End time updated — ${data.notifiedStudents} active student${data.notifiedStudents === 1 ? '' : 's'} notified.`);
      setExtendOpen(false);
      setExtendConfirmingShrink(false);
      setExtendValue('');
      void loadLastChange();
    } finally {
      setExtending(false);
    }
  }

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
      {/* Header + Extend/Change End Time */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{exam.title}</h2>
          <p className="text-sm text-muted-foreground">Ends {new Date(exam.endTime).toLocaleString()}</p>
          {lastChange && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <History className="h-3 w-3" />
              End time changed by {lastChange.changedByName} {formatDistanceToNow(new Date(lastChange.createdAt), { addSuffix: true })}
              {' '}({new Date(lastChange.oldEndTime).toLocaleTimeString()} → {new Date(lastChange.newEndTime).toLocaleTimeString()})
            </p>
          )}
        </div>
        {exam.status === 'live' && (
          <Button
            variant="outline"
            className="gap-2 shrink-0"
            onClick={() => {
              setExtendError('');
              setExtendConfirmingShrink(false);
              setExtendValue('');
              setExtendOpen(true);
            }}
          >
            <Clock className="h-4 w-4" /> Extend / Change End Time
          </Button>
        )}
      </div>
      {extendResult && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{extendResult}</p>}

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
                          <span className={`font-medium ${trustScoreTextClass(s.trustScore)}`}>
                            {s.trustScore}%
                          </span>
                        </div>
                        <Progress value={s.trustScore} className={`h-1.5 ${trustScoreProgressClass(s.trustScore)}`} />
                      </div>
                      <button
                        onClick={() => setViewingId(s.id)}
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
      <Dialog open={!!viewing} onOpenChange={open => { if (!open) setViewingId(null); }}>
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

      {/* Extend/Change End Time */}
      <Dialog open={extendOpen} onOpenChange={open => { setExtendOpen(open); if (!open) setExtendConfirmingShrink(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" /> Extend / Change End Time
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Currently ends at <strong>{new Date(exam.endTime).toLocaleString()}</strong>. Every student still in
              progress is notified immediately and their countdown updates on-screen — a student who already
              submitted is unaffected.
            </p>
            <div className="space-y-2">
              <Label>New End Time</Label>
              <DateTimeField onChange={setExtendValue} />
            </div>
            {extendError && <p className="text-sm text-red-500">{extendError}</p>}
            {extendConfirmingShrink && !extendError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                This new end time is <strong>earlier</strong> than the current one — students currently taking the
                exam will lose time they were already counting on. Click Confirm again to proceed.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendOpen(false)} disabled={extending}>Cancel</Button>
            <Button onClick={() => void submitExtend()} disabled={extending} className="gap-2">
              <Clock className="h-4 w-4" />
              {extending ? 'Saving…' : extendConfirmingShrink ? 'Confirm Shorter Time' : 'Update End Time'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
