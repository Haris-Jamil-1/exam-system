'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  FileText, Users, ShieldCheck, ClipboardCheck,
  Plus, UserPlus, Upload, ArrowUpRight,
  Radio, AlertTriangle, Clock, CheckCircle2, PencilLine,
} from 'lucide-react';
import type { ExamStatus, StatValue } from '@/types';
import { getDashboardStats, getRecentExams, getRecentAlerts } from '@/lib/data';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const STAT_META: Record<string, { label: string; icon: React.ElementType; iconBg: string; iconColor: string }> = {
  activeExams:    { label: 'Active Exams',      icon: FileText,      iconBg: '#E3F0FD', iconColor: '#1E88E5' },
  totalStudents:  { label: 'Total Students',     icon: Users,         iconBg: '#DCFCE7', iconColor: '#16A34A' },
  avgTrust:       { label: 'Avg Trust Score',    icon: ShieldCheck,   iconBg: '#EDE9FE', iconColor: '#7C3AED' },
  pendingReviews: { label: 'Pending Reviews',    icon: ClipboardCheck,iconBg: '#FEF3C7', iconColor: '#D97706' },
};

const statusStyles: Record<ExamStatus, { label: string; dot: string; chip: string; icon: React.ElementType }> = {
  live:      { label: 'Live',      dot: 'bg-red-500',    chip: 'bg-red-50 text-red-600 border-red-100',          icon: Radio },
  scheduled: { label: 'Scheduled', dot: 'bg-[#1E88E5]',  chip: 'bg-blue-50 text-[#1E88E5] border-blue-100',     icon: Clock },
  draft:     { label: 'Draft',     dot: 'bg-slate-400',  chip: 'bg-slate-100 text-slate-500 border-slate-200',   icon: PencilLine },
  completed: { label: 'Completed', dot: 'bg-emerald-500',chip: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: CheckCircle2 },
};

const quickActions = [
  { label: 'Create Exam',       desc: 'Build or generate with AI',      icon: Plus,     href: '/teacher/exams/new', color: '#1E88E5', bg: '#E3F0FD' },
  { label: 'Invite Students',   desc: 'Email or import a roster',        icon: UserPlus, href: '/teacher/students',  color: '#16A34A', bg: '#DCFCE7' },
  { label: 'Upload Document',   desc: 'Generate questions from a file',  icon: Upload,   href: '/teacher/exams/new', color: '#7C3AED', bg: '#EDE9FE' },
];

type RecentExam = { id: string; title: string; course: string; detail: string; students: number; status: ExamStatus };
type Alert = { id: string; student: string; event: string; time: string; severity: 'high' | 'medium' | 'low' };

export default function TeacherDashboard() {
  const h = useTranslations('headings');
  const a = useTranslations('actions');
  const currentUser = useCurrentUser();

  const [stats, setStats]   = useState<StatValue[]>([]);
  const [exams, setExams]   = useState<RecentExam[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    Promise.all([getDashboardStats(), getRecentExams(), getRecentAlerts()]).then(([s, e, al]) => {
      setStats(s);
      setExams(e as RecentExam[]);
      setAlerts(al as Alert[]);
    });
  }, []);

  const firstName = currentUser?.name?.split(' ')[0] ?? 'Teacher';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.01em] text-[#1A1D23]">
            {h('welcome')}, {firstName}
          </h1>
          <p className="mt-1 text-[15px] text-[#6B7280]">
            Here&apos;s what&apos;s happening across your exams today.
          </p>
        </div>
        <Link
          href="/teacher/exams/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E88E5] px-5 py-2.5 text-[14px] font-semibold text-white shadow-md shadow-blue-200 transition-all hover:-translate-y-px hover:bg-[#1976D2] hover:shadow-lg hover:shadow-blue-200"
        >
          <Plus className="h-4 w-4" />
          {a('createExam')}
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(s => {
          const meta = STAT_META[s.key ?? ''];
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <div key={s.key} className="rounded-2xl border border-[#EBF0F8] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <div className="flex items-start justify-between">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: meta.iconBg }}>
                  <Icon className="h-[22px] w-[22px]" style={{ color: meta.iconColor }} strokeWidth={2} />
                </span>
              </div>
              <p className="mt-4 text-[28px] font-extrabold leading-none tracking-tight text-[#1A1D23]">{s.value}</p>
              <p className="mt-1.5 text-[13px] font-medium text-[#6B7280]">{meta.label}</p>
              <p className="mt-2 text-[12px] font-medium text-[#16A34A]">{s.delta}</p>
            </div>
          );
        })}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Exams list (2/3) */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-[#EBF0F8] px-5 py-4">
              <h2 className="text-[16px] font-bold text-[#1A1D23]">Your Exams</h2>
              <Link href="/teacher/exams" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#1E88E5] hover:text-[#1976D2]">
                View all <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ul className="divide-y divide-[#EBF0F8]">
              {exams.map(exam => {
                const st = statusStyles[exam.status];
                const StIcon = st.icon;
                return (
                  <li key={exam.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[#F9FBFE]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <p className="truncate text-[15px] font-semibold text-[#1A1D23]">{exam.title}</p>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.chip}`}>
                          {exam.status === 'live'
                            ? <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${st.dot}`} />
                            : <StIcon className="h-3 w-3" />
                          }
                          {st.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] text-[#9CA3AF]">{exam.course} · {exam.detail}</p>
                    </div>
                    <div className="hidden items-center gap-1.5 text-[13px] text-[#6B7280] sm:flex">
                      <Users className="h-4 w-4 text-[#9CA3AF]" />
                      {exam.students}
                    </div>
                    <Link
                      href={exam.status === 'live' ? '/teacher/monitor' : '/teacher/exams'}
                      className="rounded-lg border border-[#E8ECF4] px-3 py-1.5 text-[13px] font-semibold text-[#1A1D23] transition-colors hover:border-[#CBD5E1] hover:bg-white"
                    >
                      {exam.status === 'live' ? 'Monitor' : exam.status === 'completed' ? 'Results' : 'Open'}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-6">
          {/* Live alerts */}
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-[#EBF0F8] px-5 py-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-[18px] w-[18px] text-red-500" strokeWidth={2} />
                <h2 className="text-[16px] font-bold text-[#1A1D23]">Live Alerts</h2>
              </div>
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">{alerts.length} new</span>
            </div>
            <ul className="divide-y divide-[#EBF0F8]">
              {alerts.map(alert => (
                <li key={alert.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${alert.severity === 'high' ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#1A1D23]">{alert.student}</p>
                    <p className="truncate text-[12px] text-[#6B7280]">{alert.event}</p>
                  </div>
                  <span className="flex-shrink-0 text-[11px] text-[#9CA3AF]">{alert.time}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/teacher/monitor"
              className="block border-t border-[#EBF0F8] px-5 py-3 text-center text-[13px] font-semibold text-[#1E88E5] hover:bg-[#F9FBFE]"
            >
              Open Live Monitor
            </Link>
          </div>

          {/* Quick actions */}
          <div className="rounded-2xl border border-[#EBF0F8] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <h2 className="mb-4 text-[16px] font-bold text-[#1A1D23]">Quick Actions</h2>
            <div className="space-y-2.5">
              {quickActions.map(qa => {
                const Icon = qa.icon;
                return (
                  <Link key={qa.label} href={qa.href} className="group flex items-center gap-3 rounded-xl border border-[#EBF0F8] p-3 transition-all hover:border-[#CBD5E1] hover:bg-[#F9FBFE]">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: qa.bg }}>
                      <Icon className="h-5 w-5" style={{ color: qa.color }} strokeWidth={2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-[#1A1D23]">{qa.label}</p>
                      <p className="truncate text-[12px] text-[#9CA3AF]">{qa.desc}</p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-[#CBD5E1] transition-colors group-hover:text-[#1E88E5]" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
