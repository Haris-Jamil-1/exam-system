'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getExamById, getMonitorStudents, getMonitorFeed } from '@/lib/data';
import type { Exam, MonitorStudent, Violation } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Users, CheckCircle, Clock, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const STATUS_CONFIG = {
  active: { label: 'Active', class: 'success' },
  warning: { label: 'Warning', class: 'warning' },
  flagged: { label: 'Flagged', class: 'danger' },
  submitted: { label: 'Submitted', class: 'secondary' },
};

const VIOLATION_LABELS: Record<string, string> = {
  tab_switch: 'Tab Switch',
  window_blur: 'Window Blur',
  fullscreen_exit: 'Fullscreen Exit',
  no_face: 'No Face',
  multiple_faces: 'Multiple Faces',
  audio_detected: 'Audio Detected',
  phone_detected: 'Phone Detected',
};

export default function MonitorPage() {
  const { examId } = useParams<{ examId: string }>();
  const [exam, setExam] = useState<Exam | null>(null);
  const [students, setStudents] = useState<MonitorStudent[]>([]);
  const [feed, setFeed] = useState<Violation[]>([]);
  useEffect(() => {
    Promise.all([getExamById(examId), getMonitorStudents(examId), getMonitorFeed(examId)]).then(
      ([e, s, f]) => {
        setExam(e ?? null);
        setStudents(s);
        setFeed(f.slice(0, 30));
      }
    );
  }, [examId]);


  const active = students.filter(s => s.status === 'active').length;
  const flagged = students.filter(s => s.status === 'flagged').length;
  const submitted = students.filter(s => s.status === 'submitted').length;

  if (!exam) return <div className="text-center py-12 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Enrolled</p>
                <p className="text-xl font-bold">{students.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-xl font-bold">{active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Flagged</p>
                <p className="text-xl font-bold">{flagged}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="text-xl font-bold">{submitted}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Student grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Student Status ({students.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {students.map(s => {
                  const cfg = STATUS_CONFIG[s.status];
                  return (
                    <div key={s.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                              {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {s.violationCount} violation{s.violationCount !== 1 ? 's' : ''}
                            </p>
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
                        <Progress
                          value={s.trustScore}
                          className={`h-1.5 ${s.trustScore < 60 ? '[&>div]:bg-red-500' : '[&>div]:bg-green-500'}`}
                        />
                      </div>
                      {s.status === 'flagged' && (
                        <button className="w-full text-xs flex items-center justify-center gap-1 text-blue-600 hover:underline">
                          <Eye className="h-3 w-3" /> View Live
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Violation Feed */}
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Live Alerts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {feed.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No violations yet</p>
                ) : (
                  feed.map(v => (
                    <div key={v.id} className={`rounded-lg p-3 text-xs border-s-2 ${
                      v.severity === 'high' ? 'border-red-500 bg-red-50' :
                      v.severity === 'medium' ? 'border-yellow-500 bg-yellow-50' :
                      'border-blue-300 bg-blue-50'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold">{VIOLATION_LABELS[v.type] ?? v.type}</span>
                        <Badge
                          variant={v.severity === 'high' ? 'danger' : v.severity === 'medium' ? 'warning' : 'info'}
                          className="text-xs capitalize"
                        >
                          {v.severity}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground truncate">{v.description}</p>
                      <p className="text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(v.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
