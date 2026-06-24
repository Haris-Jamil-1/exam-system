'use client';
import { useEffect, useState } from 'react';
import { getPendingExams, getApprovedExams } from '@/lib/data';
import {
  FileText, CheckCircle2, XCircle, Clock,
  ClipboardCheck, Users, Timer,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import type { PendingExam } from '@/types';

type ApprovedExam = { id: string; title: string; subject: string; teacher: string; status: 'live' | 'scheduled' | 'completed'; date: string; students: number };

const PROCTORING_CHIP: Record<string, string> = {
  strict:   'bg-red-50 text-red-600 border-red-100',
  standard: 'bg-blue-50 text-[#1E88E5] border-blue-100',
  basic:    'bg-slate-100 text-slate-500 border-slate-200',
};

const STATUS_STYLE: Record<string, { chip: string; label: string; dot?: string }> = {
  live:      { chip: 'bg-red-50 text-red-600 border-red-100',             label: 'Live',      dot: 'bg-red-500' },
  scheduled: { chip: 'bg-blue-50 text-[#1E88E5] border-blue-100',        label: 'Scheduled' },
  completed: { chip: 'bg-emerald-50 text-emerald-600 border-emerald-100', label: 'Completed' },
};

type Tab = 'pending' | 'approved';

export default function AdminExamsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending]   = useState<PendingExam[]>([]);
  const [approved, setApproved] = useState<ApprovedExam[]>([]);
  const [loading, setLoading]   = useState(true);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([getPendingExams(), getApprovedExams()]).then(([p, a]) => {
      setPending(p as PendingExam[]);
      setApproved(a as ApprovedExam[]);
      setLoading(false);
    });
  }, []);

  async function approve(id: string) {
    // Persist to backend (Phase 2: updates DB; Phase 1: updates in-memory mock)
    await fetch(`/api/exams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'scheduled' }),
    });
    setApprovedIds(prev => new Set([...prev, id]));
  }

  async function reject(id: string) {
    await fetch(`/api/exams/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'draft' }),
    });
    setRejectedIds(prev => new Set([...prev, id]));
  }

  const visiblePending  = pending.filter(e => !approvedIds.has(e.id) && !rejectedIds.has(e.id));
  const justApproved    = pending.filter(e => approvedIds.has(e.id));

  return (
    <div className="space-y-6">
      <PageHeader en="Exam Management" ar="إدارة الاختبارات" subEn="Review and approve exam submissions from your teachers" subAr="مراجعة وموافقة على اختبارات المعلمين" />

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('pending')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-colors ${
            tab === 'pending' ? 'bg-[#7C3AED] text-white shadow-sm' : 'border border-[#E8ECF4] text-[#6B7280] hover:bg-[#F4F7FC]'
          }`}
        >
          <ClipboardCheck className="h-4 w-4" />
          Pending Review
          {visiblePending.length > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === 'pending' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
              {visiblePending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('approved')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-colors ${
            tab === 'approved' ? 'bg-[#7C3AED] text-white shadow-sm' : 'border border-[#E8ECF4] text-[#6B7280] hover:bg-[#F4F7FC]'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          All Institution Exams
        </button>
      </div>

      {/* Pending tab */}
      {tab === 'pending' && (
        <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
          {loading ? (
            <div className="divide-y divide-[#EBF0F8]">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-start gap-4 p-5">
                  <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-gray-100 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-56 rounded bg-gray-100 animate-pulse" />
                    <div className="h-3 w-40 rounded bg-gray-100 animate-pulse" />
                    <div className="flex gap-4">
                      <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                      <div className="h-3 w-16 rounded bg-gray-100 animate-pulse" />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <div className="h-9 w-20 rounded-xl bg-gray-100 animate-pulse" />
                    <div className="h-9 w-20 rounded-xl bg-gray-100 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : visiblePending.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-400" strokeWidth={1.5} />
              <p className="text-[15px] font-semibold text-[#1A1D23]">All caught up!</p>
              <p className="text-[13px] text-[#9CA3AF]">No exams waiting for your approval.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EBF0F8]">
              {visiblePending.map(exam => (
                <li key={exam.id} className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#F4F7FC]">
                      <FileText className="h-5 w-5 text-[#6B7280]" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-[15px] font-bold text-[#1A1D23]">{exam.title}</p>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${PROCTORING_CHIP[exam.proctoringLevel]}`}>
                          {exam.proctoringLevel} proctoring
                        </span>
                      </div>
                      <p className="text-[13px] text-[#6B7280] mb-2">{exam.subject} · Submitted by {exam.teacher}</p>
                      <div className="flex flex-wrap gap-4 text-[12px] text-[#9CA3AF]">
                        <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {exam.questions} questions</span>
                        <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> {exam.duration} min</span>
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {exam.students} enrolled</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(exam.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row">
                      <button
                        onClick={() => approve(exam.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Approve
                      </button>
                      <button
                        onClick={() => reject(exam.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8ECF4] px-4 py-2 text-[13px] font-semibold text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="h-4 w-4" /> Return
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* All exams tab */}
      {tab === 'approved' && (
        <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EBF0F8]">
                {['Exam', 'Teacher', 'Schedule', 'Students', 'Status'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-start text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wide first:rounded-tl-2xl last:rounded-tr-2xl">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF0F8]">
              {/* Just-approved exams appear first */}
              {justApproved.map(exam => (
                <tr key={exam.id} className="bg-emerald-50/40 hover:bg-emerald-50/60">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <p className="text-[14px] font-semibold text-[#1A1D23]">{exam.title}</p>
                    </div>
                    <p className="text-[11px] text-[#9CA3AF] ps-3.5">{exam.subject}</p>
                  </td>
                  <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{exam.teacher}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">—</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{exam.students}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1 rounded-full border bg-emerald-50 border-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Approved
                    </span>
                  </td>
                </tr>
              ))}
              {approved.map(exam => {
                const st = STATUS_STYLE[exam.status];
                return (
                  <tr key={exam.id} className="hover:bg-[#F9FBFE]">
                    <td className="px-5 py-3.5">
                      <p className="text-[14px] font-semibold text-[#1A1D23]">{exam.title}</p>
                      <p className="text-[11px] text-[#9CA3AF]">{exam.subject}</p>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{exam.teacher}</td>
                    <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">
                      {new Date(exam.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      <br />
                      <span className="text-[11px] text-[#9CA3AF]">{new Date(exam.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{exam.students}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.chip}`}>
                        {exam.status === 'live' ? (
                          <><span className={`h-1.5 w-1.5 animate-pulse rounded-full ${st.dot}`} /> {st.label}</>
                        ) : exam.status === 'scheduled' ? (
                          <><Clock className="h-3 w-3" /> {st.label}</>
                        ) : (
                          <><CheckCircle2 className="h-3 w-3" /> {st.label}</>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
