'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getExamById, getMonitorStudents, getMonitorFeed } from '@/lib/data';
import type { Exam, MonitorStudent, Violation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Users, CheckCircle, Clock, Eye, Video, VideoOff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_CONFIG = {
  active:    { label: 'Active',    class: 'success'   },
  warning:   { label: 'Warning',   class: 'warning'   },
  flagged:   { label: 'Flagged',   class: 'danger'    },
  submitted: { label: 'Submitted', class: 'secondary' },
};

const VIOLATION_LABELS: Record<string, string> = {
  tab_switch: 'Tab Switch', window_blur: 'Window Blur',
  fullscreen_exit: 'Fullscreen Exit', no_face: 'No Face',
  multiple_faces: 'Multiple Faces', audio_detected: 'Audio Detected',
  phone_detected: 'Phone Detected',
};

async function refreshLiveData(examId: string, setStudents: (s: MonitorStudent[]) => void, setFeed: (f: Violation[]) => void) {
  const [s, f] = await Promise.all([getMonitorStudents(examId), getMonitorFeed(examId)]);
  setStudents(s);
  setFeed(f.slice(0, 30));
}

export default function MonitorPage() {
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<MonitorStudent[]>([]);
  const [feed, setFeed] = useState<Violation[]>([]);
  const [viewing, setViewing] = useState<MonitorStudent | null>(null);

  useEffect(() => {
    Promise.all([getExamById(examId), getMonitorStudents(examId), getMonitorFeed(examId)]).then(
      ([e, s, f]) => { setExam(e ?? null); setStudents(s); setFeed(f.slice(0, 30)); }
    );
  }, [examId]);

  // Poll every 10 seconds for live updates
  useEffect(() => {
    const id = setInterval(() => { void refreshLiveData(examId, setStudents, setFeed); }, 10000);
    return () => clearInterval(id);
  }, [examId]);

  const active    = students.filter(s => s.status === 'active').length;
  const flagged   = students.filter(s => s.status === 'flagged').length;
  const submitted = students.filter(s => s.status === 'submitted').length;

  if (!exam) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: Users,         color: 'text-blue-500',  label: 'Enrolled',  value: students.length },
          { icon: CheckCircle,   color: 'text-green-500', label: 'Active',    value: active },
          { icon: AlertTriangle, color: 'text-red-500',   label: 'Flagged',   value: flagged },
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
        {/* Student grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Student Status ({students.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {students.map(s => {
                  const cfg = STATUS_CONFIG[s.status];
                  return (
                    <div key={s.id} className={`border rounded-lg p-3 space-y-2 ${s.status === 'flagged' ? 'border-red-200 bg-red-50/30' : ''}`}>
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
                        <Badge variant={cfg.class as 'success' | 'warning' | 'danger' | 'secondary'} className="text-xs">
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
                      {/* Eye button — visible on all students */}
                      <button
                        onClick={() => setViewing(s)}
                        className="w-full text-xs flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" /> View Live Feed
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

      {/* Live feed modal */}
      <Dialog open={!!viewing} onOpenChange={open => { if (!open) setViewing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-4 w-4 text-blue-500" />
              Live Feed — {viewing?.name}
            </DialogTitle>
          </DialogHeader>
          {viewing && <StudentFeedModal student={viewing} violations={feed.filter(v => v.studentId === viewing.id)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Student live-feed modal ───────────────────────────────────────────────
function StudentFeedModal({ student, violations }: { student: MonitorStudent; violations: Violation[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    // In Phase 1 we show the teacher's own camera as a placeholder.
    // Phase 3: this will connect to the student's WebRTC stream via socket.io.
    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) { videoRef.current.srcObject = stream; }
        setStreamActive(true);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    void init();
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  const cfg = STATUS_CONFIG[student.status];

  return (
    <div className="space-y-4">
      {/* Video feed */}
      <div className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video">
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
        {!streamActive && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
            <Video className="h-10 w-10 opacity-30" />
            <p className="text-sm opacity-50">Connecting...</p>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-2">
            <VideoOff className="h-10 w-10 opacity-50" />
            <p className="text-sm opacity-60">Camera unavailable</p>
            <p className="text-xs opacity-40">Phase 3: WebRTC student stream</p>
          </div>
        )}
        {streamActive && (
          <div className="absolute top-2 start-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE (demo)
          </div>
        )}
      </div>

      {/* Student info */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-[#F4F7FC] p-3 text-center">
          <p className="text-[11px] text-[#9CA3AF]">Status</p>
          <Badge variant={cfg.class as 'success' | 'warning' | 'danger' | 'secondary'} className="mt-1 text-xs">{cfg.label}</Badge>
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

      {/* Full violations timeline */}
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
