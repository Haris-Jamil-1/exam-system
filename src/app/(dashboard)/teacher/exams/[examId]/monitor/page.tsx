'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getExamById, getMonitorStudents, getMonitorFeed } from '@/lib/data';
import { useMonitorRealtime } from '@/hooks/useMonitorRealtime';
import type { Exam, MonitorStudent, Violation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Users, CheckCircle, Clock, Eye, Camera, WifiOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { StudentActionsModal, STATUS_CONFIG, VIOLATION_LABELS } from '@/components/shared/StudentActionsModal';

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
      new Notification(`Evalix: ${VIOLATION_LABELS[v.type] ?? v.type}`, { body: v.description });
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
