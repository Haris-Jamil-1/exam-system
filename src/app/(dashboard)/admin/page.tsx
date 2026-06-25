'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  ClipboardCheck, GraduationCap, Users, ShieldCheck,
  ArrowUpRight, CheckCircle2, XCircle, Clock, Radio,
  FileText, UserPlus, BarChart3, Building2,
} from 'lucide-react';
import type { StatValue } from '@/types';
import { getAdminStats, getTeachersList, getPendingExams, getApprovedExams } from '@/lib/data';
import { getMyInstitution } from '@/lib/data/users';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { PendingExam } from '@/types';

const STAT_META: Record<string, { label: string; icon: React.ElementType; iconBg: string; iconColor: string }> = {
  pendingApprovals: { label: 'Pending Approvals', icon: ClipboardCheck, iconBg: '#FEF3C7', iconColor: '#D97706' },
  teachers:         { label: 'Total Teachers',    icon: GraduationCap,  iconBg: '#EDE9FE', iconColor: '#7C3AED' },
  students:         { label: 'Total Students',    icon: Users,          iconBg: '#DCFCE7', iconColor: '#16A34A' },
  avgTrust:         { label: 'Avg Trust Score',   icon: ShieldCheck,    iconBg: '#E3F0FD', iconColor: '#1E88E5' },
};

const PROCTORING_CHIP: Record<string, string> = {
  strict:   'bg-red-50 text-red-600 border-red-100',
  standard: 'bg-blue-50 text-[#1E88E5] border-blue-100',
  basic:    'bg-slate-100 text-slate-500 border-slate-200',
};

type ApprovedExam = { id: string; title: string; subject: string; teacher: string; status: 'live' | 'scheduled' | 'completed'; date: string; students: number };
type Teacher = { id: string; name: string; department: string; exams: number; students: number; status: 'active' | 'invited' };

const DEPT_COLOR: Record<string, string> = {
  'Computer Science': '#1E88E5', Mathematics: '#7C3AED', Physics: '#16A34A', Chemistry: '#D97706', History: '#E53935',
};

export default function AdminDashboard() {
  const h = useTranslations('headings');
  const a = useTranslations('actions');
  const currentUser = useCurrentUser();

  const [stats, setStats]     = useState<StatValue[]>([]);
  const [pending, setPending] = useState<PendingExam[]>([]);
  const [approved, setApproved] = useState<ApprovedExam[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [institutionName, setInstitutionName] = useState('');

  useEffect(() => {
    Promise.all([getAdminStats(), getPendingExams(), getApprovedExams(), getTeachersList(), getMyInstitution()]).then(([s, p, a, t, inst]) => {
      setStats(s);
      setPending(p as PendingExam[]);
      setApproved(a as ApprovedExam[]);
      setTeachers(t as Teacher[]);
      setInstitutionName(inst?.name ?? '');
    });
  }, []);

  const firstName = currentUser?.name?.split(' ').slice(-1)[0] ?? 'Admin';
  const visiblePending = pending.filter(e => !approvedIds.has(e.id) && !rejectedIds.has(e.id));

  async function approve(id: string) {
    await fetch(`/api/exams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalStatus: 'approved', status: 'scheduled' }),
    });
    setApprovedIds(prev => new Set([...prev, id]));
  }
  async function reject(id: string) {
    await fetch(`/api/exams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalStatus: 'rejected' }),
    });
    setRejectedIds(prev => new Set([...prev, id]));
  }

  const statusStyle: Record<string, { chip: string; icon: React.ElementType; pulse?: boolean }> = {
    live:      { chip: 'bg-red-50 text-red-600 border-red-100', icon: Radio, pulse: true },
    scheduled: { chip: 'bg-blue-50 text-[#1E88E5] border-blue-100', icon: Clock },
    completed: { chip: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: CheckCircle2 },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDE9FE]">
            <Building2 className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-[22px] font-extrabold tracking-[-0.01em] text-[#1A1D23]">
              {institutionName}
            </h1>
            <p className="text-[13px] text-[#6B7280]">{h('welcome')}, {firstName}</p>
          </div>
        </div>
        <Link
          href="/admin/teachers"
          className="inline-flex items-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2.5 text-[14px] font-semibold text-white shadow-md shadow-purple-200 transition-all hover:-translate-y-px hover:bg-[#6D28D9]"
        >
          <UserPlus className="h-4 w-4" />
          {a('inviteTeacher')}
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
              <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: meta.iconBg }}>
                <Icon className="h-[22px] w-[22px]" style={{ color: meta.iconColor }} strokeWidth={2} />
              </span>
              <p className="mt-4 text-[28px] font-extrabold leading-none tracking-tight text-[#1A1D23]">{s.value}</p>
              <p className="mt-1.5 text-[13px] font-medium text-[#6B7280]">{meta.label}</p>
              <p className="mt-2 text-[12px] font-medium text-[#16A34A]">{s.delta}</p>
            </div>
          );
        })}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Pending exam approvals (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-[#EBF0F8] px-5 py-4">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-[18px] w-[18px] text-[#D97706]" strokeWidth={2} />
                <h2 className="text-[16px] font-bold text-[#1A1D23]">Pending Exam Approvals</h2>
              </div>
              {visiblePending.length > 0 && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-600">{visiblePending.length} waiting</span>
              )}
            </div>

            {visiblePending.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400" strokeWidth={1.5} />
                <p className="text-[14px] font-semibold text-[#1A1D23]">All caught up!</p>
                <p className="text-[13px] text-[#9CA3AF]">No exams waiting for your approval.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[#EBF0F8]">
                {visiblePending.map(exam => (
                  <li key={exam.id} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#F4F7FC]">
                        <FileText className="h-4 w-4 text-[#6B7280]" strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[14px] font-semibold text-[#1A1D23]">{exam.title}</p>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PROCTORING_CHIP[exam.proctoringLevel]}`}>
                            {exam.proctoringLevel}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-[#9CA3AF]">
                          {exam.subject} · by {exam.teacher} · {exam.questions} questions · {exam.duration} min · {exam.students} students
                        </p>
                        <p className="text-[11px] text-[#C4C9D4] mt-0.5">
                          Submitted {new Date(exam.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 gap-2 mt-0.5">
                        <button
                          onClick={() => approve(exam.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => reject(exam.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-50 border border-red-100 px-3 py-1.5 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-100"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Return
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <Link href="/admin/exams" className="block border-t border-[#EBF0F8] px-5 py-3 text-center text-[13px] font-semibold text-[#7C3AED] hover:bg-[#F9FBFE]">
              View all exams
            </Link>
          </div>

          {/* Recent approved exams */}
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-[#EBF0F8] px-5 py-4">
              <h2 className="text-[16px] font-bold text-[#1A1D23]">Institution Exams</h2>
              <Link href="/admin/exams" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#7C3AED]">
                Manage <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ul className="divide-y divide-[#EBF0F8]">
              {approved.map(exam => {
                const st = statusStyle[exam.status];
                const StIcon = st?.icon ?? CheckCircle2;
                return (
                  <li key={exam.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#F9FBFE]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-semibold text-[#1A1D23]">{exam.title}</p>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0 ${st?.chip}`}>
                          {st?.pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
                          {!st?.pulse && <StIcon className="h-2.5 w-2.5" />}
                          <span className="capitalize">{exam.status}</span>
                        </span>
                      </div>
                      <p className="text-[12px] text-[#9CA3AF]">{exam.teacher} · {exam.students} students</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-6">
          {/* Teachers */}
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-[#EBF0F8] px-5 py-4">
              <h2 className="text-[16px] font-bold text-[#1A1D23]">Teachers</h2>
              <Link href="/admin/teachers" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#7C3AED]">
                Manage <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ul className="divide-y divide-[#EBF0F8]">
              {teachers.slice(0, 4).map(t => {
                const initials = t.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                const color = DEPT_COLOR[t.department] ?? '#6B7280';
                return (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#F9FBFE]">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ backgroundColor: color }}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#1A1D23]">{t.name}</p>
                      <p className="text-[11px] text-[#9CA3AF]">{t.department}</p>
                    </div>
                    {t.status === 'invited' && (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">Invited</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <Link href="/admin/teachers" className="block border-t border-[#EBF0F8] px-5 py-3 text-center text-[13px] font-semibold text-[#7C3AED] hover:bg-[#F9FBFE]">
              + Invite new teacher
            </Link>
          </div>

          {/* Quick links */}
          <div className="rounded-2xl border border-[#EBF0F8] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <h2 className="mb-3 text-[14px] font-bold text-[#1A1D23]">Quick Links</h2>
            <div className="space-y-2">
              {[
                { label: 'Item Bank Review', href: '/admin/items',   icon: ClipboardCheck, color: '#D97706', bg: '#FEF3C7' },
                { label: 'Analytics',         href: '/admin/analytics', icon: BarChart3,     color: '#1E88E5', bg: '#E3F0FD' },
                { label: 'Invite Teacher',    href: '/admin/teachers',  icon: UserPlus,      color: '#7C3AED', bg: '#EDE9FE' },
              ].map(l => {
                const Icon = l.icon;
                return (
                  <Link key={l.label} href={l.href} className="group flex items-center gap-2.5 rounded-xl border border-[#EBF0F8] p-2.5 hover:border-[#CBD5E1] hover:bg-[#F9FBFE]">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: l.bg }}>
                      <Icon className="h-4 w-4" style={{ color: l.color }} strokeWidth={2} />
                    </span>
                    <p className="text-[13px] font-semibold text-[#1A1D23]">{l.label}</p>
                    <ArrowUpRight className="ms-auto h-3.5 w-3.5 text-[#CBD5E1] group-hover:text-[#7C3AED]" />
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
