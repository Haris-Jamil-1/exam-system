'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getStudentExams } from '@/lib/data';
import {
  Calendar, Clock, FileText, Play, CheckCircle2,
  Radio, ChevronRight, ShieldCheck, Filter,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

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

const STATUS_STYLE = {
  available: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-100', icon: Radio,        dot: true,  label: 'Available Now' },
  upcoming:  { chip: 'bg-blue-50 text-[#1E88E5] border-blue-100',         icon: Clock,        dot: false, label: 'Upcoming' },
  completed: { chip: 'bg-slate-100 text-slate-500 border-slate-200',      icon: CheckCircle2, dot: false, label: 'Completed' },
};

type Filter = 'all' | 'available' | 'upcoming' | 'completed';

export default function StudentExamsPage() {
  const [exams, setExams]     = useState<StudentExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<Filter>('all');

  useEffect(() => {
    getStudentExams().then(e => { setExams(e as StudentExam[]); setLoading(false); });
  }, []);

  const visible = filter === 'all' ? exams : exams.filter(e => e.status === filter);
  const counts = {
    available: exams.filter(e => e.status === 'available').length,
    upcoming:  exams.filter(e => e.status === 'upcoming').length,
    completed: exams.filter(e => e.status === 'completed').length,
  };

  return (
    <div className="space-y-6">
      <PageHeader en="My Exams" ar="اختباراتي" subEn="Your complete exam schedule and results" subAr="جدول اختباراتك ونتائجك الكاملة" />

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { key: 'available', label: 'Available Now', count: counts.available, color: '#16A34A', bg: '#DCFCE7', icon: Radio },
          { key: 'upcoming',  label: 'Upcoming',      count: counts.upcoming,  color: '#1E88E5', bg: '#E3F0FD', icon: Calendar },
          { key: 'completed', label: 'Completed',     count: counts.completed, color: '#6B7280', bg: '#F4F7FC', icon: CheckCircle2 },
        ].map(s => {
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              onClick={() => setFilter(filter === s.key ? 'all' : s.key as Filter)}
              className={`rounded-2xl border p-4 text-start transition-all ${filter === s.key ? 'border-current ring-1' : 'border-[#EBF0F8] hover:border-[#CBD5E1]'} bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]`}
              style={{ borderColor: filter === s.key ? s.color : undefined, color: s.color }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: s.bg }}>
                  <Icon className="h-4 w-4" style={{ color: s.color }} strokeWidth={2} />
                </span>
              </div>
              <p className="text-[22px] font-extrabold text-[#1A1D23]">{s.count}</p>
              <p className="text-[12px] text-[#6B7280]">{s.label}</p>
            </button>
          );
        })}
      </div>

      {/* Filter strip */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-[#9CA3AF]" />
        {(['all', 'available', 'upcoming', 'completed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold capitalize transition-colors ${
              filter === f ? 'bg-[#1A1D23] text-white' : 'border border-[#E8ECF4] text-[#6B7280] hover:bg-[#F4F7FC]'
            }`}
          >
            {f === 'all' ? `All (${exams.length})` : f}
          </button>
        ))}
      </div>

      {/* Exam table / cards */}
      <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-9 w-9 rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 w-48 rounded bg-gray-100 animate-pulse" />
                  <div className="h-3 w-28 rounded bg-gray-100 animate-pulse" />
                </div>
                <div className="h-5 w-20 rounded-full bg-gray-100 animate-pulse" />
                <div className="h-8 w-16 rounded-xl bg-gray-100 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
        <>
        {/* Desktop table */}
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="border-b border-[#EBF0F8] bg-[#FAFBFD]">
              {['Exam', 'Date & Time', 'Duration', 'Questions', 'Status', 'Action'].map(h => (
                <th key={h} className="px-5 py-3.5 text-start text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EBF0F8]">
            {visible.map(exam => {
              const st = STATUS_STYLE[exam.status];
              const StIcon = st.icon;
              const passed = exam.score !== undefined && exam.score >= 60;
              return (
                <tr key={exam.id} className={`transition-colors ${exam.status === 'available' ? 'bg-emerald-50/30 hover:bg-emerald-50/50' : 'hover:bg-[#F9FBFE]'}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${exam.status === 'available' ? 'bg-emerald-100' : exam.status === 'upcoming' ? 'bg-[#E3F0FD]' : 'bg-[#F4F7FC]'}`}>
                        <FileText className={`h-4 w-4 ${exam.status === 'available' ? 'text-emerald-600' : exam.status === 'upcoming' ? 'text-[#1E88E5]' : 'text-[#9CA3AF]'}`} strokeWidth={2} />
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold text-[#1A1D23]">{exam.title}</p>
                        <p className="text-[11px] text-[#9CA3AF]">{exam.course}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-[13px] font-semibold text-[#1A1D23]">{exam.schedule.split(',')[0]}</p>
                    <p className="text-[11px] text-[#9CA3AF]">{exam.schedule.split(', ')[1] ?? ''}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 text-[13px] text-[#6B7280]">
                      <Clock className="h-3.5 w-3.5 text-[#9CA3AF]" />
                      {exam.durationMins} min
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[13px] text-[#6B7280]">{exam.questions} Qs</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.chip}`}>
                      {st.dot ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> : <StIcon className="h-3 w-3" />}
                      {st.label}
                    </span>
                    {exam.status === 'completed' && exam.score !== undefined && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`text-[12px] font-bold ${passed ? 'text-emerald-600' : 'text-red-500'}`}>{exam.score}%</span>
                        {exam.trust !== undefined && (
                          <span className="flex items-center gap-0.5 text-[10px] text-[#9CA3AF]">
                            <ShieldCheck className="h-3 w-3" /> {exam.trust}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {exam.status === 'available' ? (
                      <Link href={`/exam/${exam.id}`} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-emerald-700">
                        <Play className="h-3.5 w-3.5" /> Start
                      </Link>
                    ) : exam.status === 'completed' ? (
                      <Link href="/student/results" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#1E88E5] hover:text-[#1976D2]">
                        Results <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <span className="text-[12px] text-[#9CA3AF]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Mobile cards */}
        <ul className="divide-y divide-[#EBF0F8] md:hidden">
          {visible.map(exam => {
            const st = STATUS_STYLE[exam.status];
            const StIcon = st.icon;
            const passed = exam.score !== undefined && exam.score >= 60;
            return (
              <li key={exam.id} className={`p-4 ${exam.status === 'available' ? 'bg-emerald-50/30' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.chip}`}>
                        {st.dot ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> : <StIcon className="h-3 w-3" />}
                        {st.label}
                      </span>
                    </div>
                    <p className="text-[14px] font-semibold text-[#1A1D23]">{exam.title}</p>
                    <p className="text-[12px] text-[#9CA3AF]">{exam.course}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-[#6B7280]">
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {exam.schedule}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {exam.durationMins} min</span>
                    </div>
                    {exam.status === 'completed' && exam.score !== undefined && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`text-[13px] font-bold ${passed ? 'text-emerald-600' : 'text-red-500'}`}>{exam.score}% · {passed ? 'Passed' : 'Failed'}</span>
                        {exam.trust !== undefined && <span className="flex items-center gap-0.5 text-[11px] text-[#9CA3AF]"><ShieldCheck className="h-3 w-3" /> Trust: {exam.trust}</span>}
                      </div>
                    )}
                  </div>
                  {exam.status === 'available' && (
                    <Link href={`/exam/${exam.id}`} className="flex-shrink-0 inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white">
                      <Play className="h-3.5 w-3.5" /> Start
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {visible.length === 0 && (
          <div className="py-12 text-center text-[14px] text-[#9CA3AF]">No exams found.</div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
