'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  Calendar, CheckCircle2, BarChart2, ShieldCheck,
  Clock, Trophy, ChevronRight, Play,
} from 'lucide-react';
import type { StatValue } from '@/types';
import { getStudentDashboardData } from '@/lib/data';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const STAT_META: Record<string, { label: string; icon: React.ElementType; iconBg: string; iconColor: string }> = {
  upcoming:  { label: 'Upcoming Exams',  icon: Calendar,      iconBg: '#E3F0FD', iconColor: '#1E88E5' },
  completed: { label: 'Completed',        icon: CheckCircle2,  iconBg: '#DCFCE7', iconColor: '#16A34A' },
  avgScore:  { label: 'Average Score',   icon: BarChart2,     iconBg: '#EDE9FE', iconColor: '#7C3AED' },
  trust:     { label: 'Trust Score',     icon: ShieldCheck,   iconBg: '#FEF3C7', iconColor: '#D97706' },
};

type StudentExam = {
  id: string;
  title: string;
  course: string;
  status: 'available' | 'upcoming' | 'completed';
  schedule: string;
  durationMins: number;
  questions: number;
  score?: number;
  trust?: number;
};

export default function StudentDashboard() {
  const h = useTranslations('headings');
  const a = useTranslations('actions');
  const currentUser = useCurrentUser();

  const [stats, setStats] = useState<StatValue[]>([]);
  const [exams, setExams] = useState<StudentExam[]>([]);

  useEffect(() => {
    getStudentDashboardData().then(({ stats: s, exams: e }) => {
      setStats(s);
      setExams(e as StudentExam[]);
    });
  }, []);

  const firstName  = currentUser?.name?.split(' ')[0] ?? 'Student';
  const available  = exams.filter(e => e.status === 'available');
  const upcoming   = exams.filter(e => e.status === 'upcoming');
  const completed  = exams.filter(e => e.status === 'completed');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.01em] text-[#1A1D23]">
          {h('welcome')}, {firstName}
        </h1>
        <p className="mt-1 text-[15px] text-[#6B7280]">{h('studentSubtitle')}</p>
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

      {/* Available now — gradient banner */}
      {available.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #1E88E5 0%, #7C3AED 100%)' }}>
          <div className="px-6 py-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white/80" />
              <span className="text-[12px] font-semibold text-white/80 uppercase tracking-wide">Available Now</span>
            </div>
            <p className="text-[22px] font-extrabold text-white">{available[0].title}</p>
            <p className="mt-1 text-[14px] text-white/70">{available[0].course} · {available[0].durationMins} min · {available[0].questions} questions</p>
            <div className="mt-4 flex items-center gap-3">
              <Link
                href={`/exam/${available[0].id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-[14px] font-bold text-[#1E88E5] shadow-lg transition-all hover:-translate-y-px hover:shadow-xl"
              >
                <Play className="h-4 w-4" />
                {a('startExam')}
              </Link>
              <span className="text-[13px] text-white/70">Today, {new Date(available[0].schedule).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Upcoming exams (2/3) */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-[#EBF0F8] px-5 py-4">
              <h2 className="text-[16px] font-bold text-[#1A1D23]">Upcoming Exams</h2>
              <Link href="/student/exams" className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#1E88E5]">
                All exams <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {upcoming.length === 0 ? (
              <div className="px-5 py-8 text-center text-[14px] text-[#9CA3AF]">No upcoming exams.</div>
            ) : (
              <ul className="divide-y divide-[#EBF0F8]">
                {upcoming.map(exam => (
                  <li key={exam.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[#F9FBFE]">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#E3F0FD]">
                      <Calendar className="h-5 w-5 text-[#1E88E5]" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-[#1A1D23]">{exam.title}</p>
                      <p className="text-[12px] text-[#9CA3AF]">{exam.course} · {exam.durationMins} min</p>
                    </div>
                    <div className="text-end flex-shrink-0">
                      <p className="text-[13px] font-semibold text-[#1A1D23]">{new Date(exam.schedule).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, {new Date(exam.schedule).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="text-[11px] text-[#9CA3AF]">{exam.questions} questions</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column (1/3) — completed history */}
        <div>
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between border-b border-[#EBF0F8] px-5 py-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-[18px] w-[18px] text-amber-500" strokeWidth={2} />
                <h2 className="text-[16px] font-bold text-[#1A1D23]">Recent Results</h2>
              </div>
            </div>
            {completed.length === 0 ? (
              <div className="px-5 py-8 text-center text-[14px] text-[#9CA3AF]">No completed exams yet.</div>
            ) : (
              <ul className="divide-y divide-[#EBF0F8]">
                {completed.map(exam => {
                  const passed = (exam.score ?? 0) >= 60;
                  return (
                    <li key={exam.id} className="px-5 py-4 transition-colors hover:bg-[#F9FBFE]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-[#1A1D23]">{exam.title}</p>
                          <p className="text-[11px] text-[#9CA3AF]">{exam.schedule}</p>
                        </div>
                        <div className="text-end flex-shrink-0">
                          <p className="text-[18px] font-extrabold text-[#1A1D23]">{exam.score}%</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${passed ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                            {passed ? 'Passed' : 'Failed'}
                          </span>
                        </div>
                      </div>
                      {exam.trust !== undefined && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <ShieldCheck className="h-3 w-3 text-[#9CA3AF]" />
                          <span className="text-[11px] text-[#9CA3AF]">Trust: {exam.trust}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <Link href="/student/results" className="block border-t border-[#EBF0F8] px-5 py-3 text-center text-[13px] font-semibold text-[#1E88E5] hover:bg-[#F9FBFE]">
              View all results
            </Link>
          </div>

          {/* Time reminder */}
          {upcoming.length > 0 && (
            <div className="mt-4 rounded-2xl border border-[#EBF0F8] bg-white p-4 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#E3F0FD]">
                  <Clock className="h-4 w-4 text-[#1E88E5]" strokeWidth={2} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#1A1D23]">Next exam</p>
                  <p className="text-[12px] text-[#6B7280]">{upcoming[0].title} — {upcoming[0].schedule}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
