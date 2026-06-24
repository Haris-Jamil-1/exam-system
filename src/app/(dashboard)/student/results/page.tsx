'use client';
import { useEffect, useState } from 'react';
import { getStudentExams } from '@/lib/data';
import {
  Trophy, ShieldCheck, Clock, FileText,
  CheckCircle2, XCircle, TrendingUp, BarChart2,
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

export default function StudentResultsPage() {
  const [exams, setExams]     = useState<StudentExam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentExams().then(e => { setExams(e as StudentExam[]); setLoading(false); });
  }, []);

  const completed       = exams.filter(e => e.status === 'completed' && e.score !== undefined);
  // Exams submitted but results held by teacher (score === undefined on completed exams)
  const pendingResults  = exams.filter(e => e.status === 'completed' && e.score === undefined);
  const avgScore  = completed.length
    ? Math.round(completed.reduce((sum, e) => sum + (e.score ?? 0), 0) / completed.length)
    : 0;
  const avgTrust  = completed.length
    ? Math.round(completed.reduce((sum, e) => sum + (e.trust ?? 100), 0) / completed.length)
    : 0;
  const passed    = completed.filter(e => (e.score ?? 0) >= 60).length;

  return (
    <div className="space-y-6">
      <PageHeader en="My Results" ar="نتائجي" subEn={`${completed.length} exams completed this term`} subAr="نتائج اختباراتك لهذا الفصل الدراسي" />

      {loading && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="rounded-2xl border border-[#EBF0F8] bg-white p-5">
              <div className="h-10 w-10 rounded-xl bg-gray-100 animate-pulse" />
              <div className="mt-3 h-7 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="mt-2 h-3 w-24 rounded bg-gray-100 animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      {!loading && <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Exams Taken',   value: completed.length, icon: FileText,    iconBg: '#E3F0FD', iconColor: '#1E88E5' },
          { label: 'Average Score', value: `${avgScore}%`,   icon: BarChart2,   iconBg: '#EDE9FE', iconColor: '#7C3AED' },
          { label: 'Passed',        value: passed,           icon: TrendingUp,  iconBg: '#DCFCE7', iconColor: '#16A34A' },
          { label: 'Avg Trust',     value: avgTrust,         icon: ShieldCheck, iconBg: '#FEF3C7', iconColor: '#D97706' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl border border-[#EBF0F8] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: s.iconBg }}>
                <Icon className="h-5 w-5" style={{ color: s.iconColor }} strokeWidth={2} />
              </span>
              <p className="mt-3 text-[26px] font-extrabold leading-none text-[#1A1D23]">{s.value}</p>
              <p className="mt-1 text-[12px] text-[#6B7280]">{s.label}</p>
            </div>
          );
        })}
      </div>}

      {/* Results list */}
      <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2 border-b border-[#EBF0F8] px-5 py-4">
          <Trophy className="h-[18px] w-[18px] text-amber-500" strokeWidth={2} />
          <h2 className="text-[15px] font-bold text-[#1A1D23]">Exam Results</h2>
        </div>

        {completed.length === 0 && pendingResults.length === 0 ? (
          <div className="py-12 text-center text-[14px] text-[#9CA3AF]">No completed exams yet.</div>
        ) : (
          <>
            {/* Desktop table */}
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-[#EBF0F8] bg-[#FAFBFD]">
                  {['Exam', 'Date', 'Duration', 'Score', 'Trust', 'Result'].map(h => (
                    <th key={h} className="px-5 py-3 text-start text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBF0F8]">
                {/* Pending (held) results */}
                {pendingResults.map(exam => (
                  <tr key={exam.id} className="hover:bg-[#F9FBFE] bg-amber-50/50">
                    <td className="px-5 py-4">
                      <p className="text-[14px] font-semibold text-[#1A1D23]">{exam.title}</p>
                      <p className="text-[11px] text-[#9CA3AF]">{exam.course}</p>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-[#6B7280]">{exam.schedule}</td>
                    <td className="px-5 py-4">
                      <span className="flex items-center gap-1 text-[13px] text-[#6B7280]">
                        <Clock className="h-3.5 w-3.5 text-[#9CA3AF]" /> {exam.durationMins} min
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-amber-600">—</td>
                    <td className="px-5 py-4 text-[13px] text-[#6B7280]">—</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        <Clock className="h-3 w-3" /> Pending
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Published results */}
                {completed.map(exam => {
                  const pass = (exam.score ?? 0) >= 60;
                  return (
                    <tr key={exam.id} className="hover:bg-[#F9FBFE]">
                      <td className="px-5 py-4">
                        <p className="text-[14px] font-semibold text-[#1A1D23]">{exam.title}</p>
                        <p className="text-[11px] text-[#9CA3AF]">{exam.course}</p>
                      </td>
                      <td className="px-5 py-4 text-[13px] text-[#6B7280]">{exam.schedule}</td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-1 text-[13px] text-[#6B7280]">
                          <Clock className="h-3.5 w-3.5 text-[#9CA3AF]" /> {exam.durationMins} min
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[16px] font-extrabold ${pass ? 'text-emerald-600' : 'text-red-500'}`}>{exam.score}%</span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-1 text-[13px] font-semibold text-[#6B7280]">
                          <ShieldCheck className="h-3.5 w-3.5 text-[#D97706]" /> {exam.trust ?? '—'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          pass
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            : 'bg-red-50 border-red-100 text-red-600'
                        }`}>
                          {pass ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {pass ? 'Passed' : 'Failed'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-[#EBF0F8] md:hidden">
              {pendingResults.map(exam => (
                <li key={exam.id} className="p-4 bg-amber-50/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[#1A1D23]">{exam.title}</p>
                      <p className="text-[12px] text-[#9CA3AF]">{exam.course} · {exam.schedule}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 shrink-0">
                      <Clock className="h-3 w-3" /> Pending
                    </span>
                  </div>
                </li>
              ))}
              {completed.map(exam => {
                const pass = (exam.score ?? 0) >= 60;
                return (
                  <li key={exam.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[#1A1D23]">{exam.title}</p>
                        <p className="text-[12px] text-[#9CA3AF]">{exam.course} · {exam.schedule}</p>
                        <div className="mt-2 flex items-center gap-3">
                          <span className="flex items-center gap-1 text-[12px] text-[#6B7280]">
                            <Clock className="h-3.5 w-3.5" /> {exam.durationMins} min
                          </span>
                          <span className="flex items-center gap-1 text-[12px] text-[#6B7280]">
                            <ShieldCheck className="h-3.5 w-3.5 text-[#D97706]" /> {exam.trust}
                          </span>
                        </div>
                      </div>
                      <div className="text-end flex-shrink-0">
                        <p className={`text-[18px] font-extrabold ${pass ? 'text-emerald-600' : 'text-red-500'}`}>{exam.score}%</p>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          pass ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'
                        }`}>
                          {pass ? 'Passed' : 'Failed'}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
