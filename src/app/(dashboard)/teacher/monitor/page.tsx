'use client';
import { useState, useEffect } from 'react';
import { getExams, getMonitorStudents } from '@/lib/data';
import type { Exam, MonitorStudent } from '@/types';
import {
  Eye, AlertTriangle, Users, ShieldCheck,
  Volume2, Monitor, CameraOff, Radio,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ALERT_ICONS: Record<string, React.ElementType> = {
  flagged: AlertTriangle,
  warning: Eye,
  active:  Monitor,
  submitted: CameraOff,
};

const trustColor = (trust: number) =>
  trust >= 85 ? '#16A34A' : trust >= 65 ? '#D97706' : '#E53935';

const statusChip: Record<string, string> = {
  flagged:   'bg-red-50 text-red-600 border border-red-100',
  warning:   'bg-amber-50 text-amber-600 border border-amber-100',
  active:    'bg-emerald-50 text-emerald-600 border border-emerald-100',
  submitted: 'bg-slate-100 text-slate-500 border border-slate-200',
};

export default function LiveMonitorPage() {
  const [liveExams, setLiveExams]     = useState<Exam[]>([]);
  const [selectedId, setSelectedId]   = useState<string>('');
  const [students, setStudents]       = useState<MonitorStudent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState<'all' | 'flagged' | 'warning'>('all');

  useEffect(() => {
    getExams().then(exams => {
      const live = exams.filter(e => e.status === 'live');
      setLiveExams(live);
      if (live.length > 0) setSelectedId(live[0].id);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    async function refresh() {
      const data = await getMonitorStudents(selectedId);
      if (alive) setStudents(data);
    }
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 10_000);
    return () => { alive = false; clearInterval(interval); };
  }, [selectedId]);

  const alerts  = students.filter(s => s.status === 'flagged');
  const visible = filter === 'all'
    ? students
    : students.filter(s => s.status === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        en="Live Monitor"
        ar="المراقبة المباشرة"
        subEn="Cross-exam live proctoring dashboard"
        subAr="لوحة المراقبة المباشرة لجميع الاختبارات"
        action={
          liveExams.length > 1 ? (
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select live exam" />
              </SelectTrigger>
              <SelectContent>
                {liveExams.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-2xl border border-[#EBF0F8] bg-white p-4 animate-pulse h-24" />
          ))}
        </div>
      ) : liveExams.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Radio className="h-12 w-12 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-[15px] font-semibold text-[#1A1D23]">No live exams right now</p>
          <p className="text-[13px] text-[#9CA3AF]">Start an exam from your exam list to see students here.</p>
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Active Students', value: students.length,     iconBg: '#E3F0FD', iconColor: '#1E88E5', icon: Users },
              { label: 'Avg Trust Score', value: students.length ? Math.round(students.reduce((a, s) => a + s.trustScore, 0) / students.length) : 100, iconBg: '#DCFCE7', iconColor: '#16A34A', icon: ShieldCheck },
              { label: 'Live Alerts',     value: alerts.length,       iconBg: '#FEE2E2', iconColor: '#E53935', icon: AlertTriangle },
              { label: 'Warnings',        value: students.filter(s => s.status === 'warning').length, iconBg: '#FEF3C7', iconColor: '#D97706', icon: Volume2 },
            ].map(stat => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-2xl border border-[#EBF0F8] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: stat.iconBg }}>
                    <Icon className="h-4 w-4" style={{ color: stat.iconColor }} strokeWidth={2} />
                  </span>
                  <p className="mt-3 text-[22px] font-extrabold leading-none text-[#1A1D23]">{stat.value}</p>
                  <p className="mt-1 text-[12px] text-[#6B7280]">{stat.label}</p>
                </div>
              );
            })}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(['all', 'flagged', 'warning'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold capitalize transition-colors ${
                  filter === f
                    ? 'bg-[#1E88E5] text-white'
                    : 'border border-[#E8ECF4] text-[#6B7280] hover:bg-[#F4F7FC]'
                }`}
              >
                {f === 'all' ? `All (${students.length})` : f === 'flagged' ? `Alerts (${alerts.length})` : `Warnings (${students.filter(s => s.status === 'warning').length})`}
              </button>
            ))}
          </div>

          {/* Student grid */}
          {visible.length === 0 ? (
            <div className="py-12 text-center text-[13px] text-[#9CA3AF]">No students match this filter.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map(student => {
                const StatusIcon = ALERT_ICONS[student.status] ?? AlertTriangle;
                return (
                  <div
                    key={student.id}
                    className={`rounded-2xl border bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all ${
                      student.status === 'flagged'
                        ? 'border-red-200 ring-1 ring-red-200'
                        : student.status === 'warning'
                        ? 'border-amber-200'
                        : 'border-[#EBF0F8]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[13px] font-bold text-blue-700">
                        {student.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-[#1A1D23]">{student.name}</p>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusChip[student.status]}`}>
                          {student.status}
                        </span>
                      </div>
                    </div>

                    {/* Trust bar */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-[#9CA3AF]">Trust Score</span>
                        <span className="text-[12px] font-bold" style={{ color: trustColor(student.trustScore) }}>{student.trustScore}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#F4F7FC]">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${student.trustScore}%`, backgroundColor: trustColor(student.trustScore) }}
                        />
                      </div>
                    </div>

                    {/* Violation count */}
                    {student.violationCount > 0 && (
                      <div className={`mt-3 flex items-center gap-1.5 rounded-lg p-2 text-[11px] font-semibold ${student.status === 'flagged' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                        <StatusIcon className="h-3 w-3 flex-shrink-0" />
                        {student.violationCount} violation{student.violationCount !== 1 ? 's' : ''} detected
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
