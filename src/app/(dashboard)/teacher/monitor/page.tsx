'use client';
import { useState } from 'react';
import {
  Eye, AlertTriangle, Users, ShieldCheck,
  Volume2, Monitor, CameraOff, RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const MOCK_STUDENTS = [
  { id: 's1', name: 'Ali Hassan',     initials: 'AH', trust: 42, status: 'alert',  alert: 'Tab switch detected',    avatar: '#E53935' },
  { id: 's2', name: 'Sara Ahmed',     initials: 'SA', trust: 61, status: 'alert',  alert: 'No face detected',        avatar: '#D97706' },
  { id: 's3', name: 'Omar Khalid',    initials: 'OK', trust: 78, status: 'warning',alert: 'Window blur × 3',         avatar: '#F59E0B' },
  { id: 's4', name: 'Nour Ibrahim',   initials: 'NI', trust: 91, status: 'ok',     alert: null,                      avatar: '#1E88E5' },
  { id: 's5', name: 'Lina Farouk',    initials: 'LF', trust: 95, status: 'ok',     alert: null,                      avatar: '#16A34A' },
  { id: 's6', name: 'Khaled Mansour', initials: 'KM', trust: 88, status: 'ok',     alert: null,                      avatar: '#7C3AED' },
  { id: 's7', name: 'Dina Rashid',    initials: 'DR', trust: 73, status: 'warning',alert: 'Audio noise detected',    avatar: '#F59E0B' },
  { id: 's8', name: 'Tarek Nasser',   initials: 'TN', trust: 97, status: 'ok',     alert: null,                      avatar: '#1E88E5' },
];

const ALERT_ICONS: Record<string, React.ElementType> = {
  'Tab switch detected':  Monitor,
  'No face detected':     CameraOff,
  'Window blur × 3':      Eye,
  'Audio noise detected': Volume2,
};

const trustColor = (trust: number) =>
  trust >= 85 ? '#16A34A' : trust >= 65 ? '#D97706' : '#E53935';

const statusChip: Record<string, string> = {
  alert:   'bg-red-50 text-red-600 border border-red-100',
  warning: 'bg-amber-50 text-amber-600 border border-amber-100',
  ok:      'bg-emerald-50 text-emerald-600 border border-emerald-100',
};

export default function LiveMonitorPage() {
  const [filter, setFilter] = useState<'all' | 'alert' | 'warning'>('all');

  const alerts  = MOCK_STUDENTS.filter(s => s.status === 'alert');
  const visible = MOCK_STUDENTS.filter(s => filter === 'all' || s.status === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        en="Live Monitor"
        ar="المراقبة المباشرة"
        subEn="Data Structures Midterm · CS 301"
        subAr="اختبار منتصف الفصل · هياكل البيانات"
        action={
          <button className="inline-flex items-center gap-2 rounded-xl border border-[#E8ECF4] px-4 py-2 text-[13px] font-semibold text-[#1A1D23] transition-colors hover:bg-[#F4F7FC]">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Active Students', value: MOCK_STUDENTS.length,                   iconBg: '#E3F0FD', iconColor: '#1E88E5', icon: Users },
          { label: 'Avg Trust Score', value: Math.round(MOCK_STUDENTS.reduce((a, s) => a + s.trust, 0) / MOCK_STUDENTS.length), iconBg: '#DCFCE7', iconColor: '#16A34A', icon: ShieldCheck },
          { label: 'Live Alerts',     value: alerts.length,                           iconBg: '#FEE2E2', iconColor: '#E53935', icon: AlertTriangle },
          { label: 'Warnings',        value: MOCK_STUDENTS.filter(s => s.status === 'warning').length, iconBg: '#FEF3C7', iconColor: '#D97706', icon: Eye },
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
        {(['all', 'alert', 'warning'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold capitalize transition-colors ${
              filter === f
                ? 'bg-[#1E88E5] text-white'
                : 'border border-[#E8ECF4] text-[#6B7280] hover:bg-[#F4F7FC]'
            }`}
          >
            {f === 'all' ? `All (${MOCK_STUDENTS.length})` : f === 'alert' ? `Alerts (${alerts.length})` : `Warnings (${MOCK_STUDENTS.filter(s => s.status === 'warning').length})`}
          </button>
        ))}
      </div>

      {/* Student grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map(student => {
          const AlertIcon = student.alert ? ALERT_ICONS[student.alert] ?? AlertTriangle : null;
          return (
            <div
              key={student.id}
              className={`rounded-2xl border bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)] transition-all ${
                student.status === 'alert'
                  ? 'border-red-200 ring-1 ring-red-200'
                  : student.status === 'warning'
                  ? 'border-amber-200'
                  : 'border-[#EBF0F8]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ backgroundColor: student.avatar }}>
                  {student.initials}
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
                  <span className="text-[12px] font-bold" style={{ color: trustColor(student.trust) }}>{student.trust}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#F4F7FC]">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${student.trust}%`, backgroundColor: trustColor(student.trust) }}
                  />
                </div>
              </div>

              {/* Alert tag */}
              {student.alert && AlertIcon && (
                <div className={`mt-3 flex items-center gap-1.5 rounded-lg p-2 text-[11px] font-semibold ${student.status === 'alert' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                  <AlertIcon className="h-3 w-3 flex-shrink-0" />
                  {student.alert}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
