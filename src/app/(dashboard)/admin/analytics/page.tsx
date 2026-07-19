'use client';
// Curriculum Analytics section — Phase 2: data from Prisma aggregate queries
// Phase 2: CLO performance = AVG(answer.marksAwarded / question.marks) WHERE question.learningObjectiveId = clo.id
import { useEffect, useState } from 'react';
import { getAdminStats, getTeachersList } from '@/lib/data';
import type { StatValue } from '@/types';
import { BarChart3, ShieldCheck, TrendingUp, Users, GraduationCap, FileText, BookOpen, Download } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';

const STAT_META: Record<string, { label: string; icon: React.ElementType; iconBg: string; iconColor: string }> = {
  pendingApprovals: { label: 'Pending Approvals', icon: FileText,      iconBg: '#FEF3C7', iconColor: '#D97706' },
  teachers:         { label: 'Total Teachers',    icon: GraduationCap, iconBg: '#EDE9FE', iconColor: '#7C3AED' },
  students:         { label: 'Total Students',    icon: Users,         iconBg: '#DCFCE7', iconColor: '#16A34A' },
  avgTrust:         { label: 'Avg Trust Score',   icon: ShieldCheck,   iconBg: '#E3F0FD', iconColor: '#1E88E5' },
};

const MONTHLY = [
  { month: 'Jan', exams: 8, passed: 6 }, { month: 'Feb', exams: 11, passed: 9 },
  { month: 'Mar', exams: 14, passed: 11 }, { month: 'Apr', exams: 9, passed: 7 },
  { month: 'May', exams: 16, passed: 13 }, { month: 'Jun', exams: 12, passed: 10 },
];

const DEPT_STATS = [
  { dept: 'Computer Science', exams: 14, avgScore: 79, trust: 92 },
  { dept: 'Mathematics',      exams: 9,  avgScore: 74, trust: 95 },
  { dept: 'Physics',          exams: 11, avgScore: 71, trust: 91 },
  { dept: 'Chemistry',        exams: 7,  avgScore: 68, trust: 89 },
  { dept: 'History',          exams: 5,  avgScore: 82, trust: 97 },
];

// Phase 2: from prisma.answer aggregate grouped by clo.learningDomain
const DOMAIN_BREAKDOWN = [
  { domain: 'Knowledge', questions: 42, avgScore: 82, color: '#6366f1' },
  { domain: 'Skill',     questions: 31, avgScore: 71, color: '#10b981' },
  { domain: 'Values',    questions: 15, avgScore: 88, color: '#f59e0b' },
];

// Phase 2: from prisma.answer aggregate grouped by clo.bloomsLevel
const BLOOMS_PERFORMANCE = [
  { level: 'Remember',   avgScore: 88, items: 18 },
  { level: 'Understand', avgScore: 82, items: 22 },
  { level: 'Apply',      avgScore: 73, items: 19 },
  { level: 'Analyze',    avgScore: 66, items: 14 },
  { level: 'Evaluate',   avgScore: 61, items: 9  },
  { level: 'Create',     avgScore: 55, items: 6  },
];

type Teacher = { id: string; name: string; department: string; exams: number; students: number; status: 'active' | 'invited' };

export default function AdminAnalyticsPage() {
  const [stats, setStats]       = useState<StatValue[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([getAdminStats(), getTeachersList()]).then(([s, t]) => {
      setStats(s);
      setTeachers(t as Teacher[]);
      setLoading(false);
    });
  }, []);

  const maxExams = Math.max(...MONTHLY.map(m => m.exams));

  return (
    <div className="space-y-6">
      <PageHeader en="Institution Analytics" ar="تحليلات المؤسسة" subEn="University of Technology · Academic Year 2025–2026" subAr="جامعة التكنولوجيا · العام الأكاديمي 2025–2026" />

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          [1,2,3,4].map(i => (
            <div key={i} className="rounded-2xl border border-[#EBF0F8] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <div className="h-11 w-11 rounded-xl bg-gray-100 animate-pulse" />
              <div className="mt-4 h-8 w-16 rounded bg-gray-100 animate-pulse" />
              <div className="mt-2 h-3 w-28 rounded bg-gray-100 animate-pulse" />
            </div>
          ))
        ) : stats.map(s => {
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


      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly exam chart */}
        <div className="rounded-2xl border border-[#EBF0F8] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="h-5 w-5 text-[#1E88E5]" strokeWidth={2} />
            <h2 className="text-[15px] font-bold text-[#1A1D23]">Monthly Exams</h2>
          </div>
          <div className="flex items-end gap-2 h-36">
            {MONTHLY.map(m => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col-reverse gap-0.5" style={{ height: `${(m.exams / maxExams) * 120}px` }}>
                  <div className="w-full rounded-t-lg" style={{ height: `${(m.passed / m.exams) * 100}%`, backgroundColor: '#1E88E5' }} />
                  <div className="w-full" style={{ height: `${((m.exams - m.passed) / m.exams) * 100}%`, backgroundColor: '#E3F0FD' }} />
                </div>
                <p className="text-[10px] text-[#9CA3AF]">{m.month}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4">
            <span className="flex items-center gap-1.5 text-[11px] text-[#6B7280]"><span className="h-3 w-3 rounded bg-[#1E88E5]" /> Passed</span>
            <span className="flex items-center gap-1.5 text-[11px] text-[#6B7280]"><span className="h-3 w-3 rounded bg-[#E3F0FD]" /> Total</span>
          </div>
        </div>

        {/* Trust score trend */}
        <div className="rounded-2xl border border-[#EBF0F8] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-2 mb-5">
            <ShieldCheck className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} />
            <h2 className="text-[15px] font-bold text-[#1A1D23]">Trust Score by Department</h2>
          </div>
          <div className="space-y-3">
            {DEPT_STATS.map(d => (
              <div key={d.dept}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] font-semibold text-[#1A1D23]">{d.dept}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-[#9CA3AF]">Avg {d.avgScore}%</span>
                    <span className="text-[12px] font-bold text-[#7C3AED]">{d.trust}</span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-[#F4F7FC]">
                  <div className="h-1.5 rounded-full bg-[#7C3AED]" style={{ width: `${d.trust}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Curriculum Analytics ── */}
      <div className="rounded-2xl border border-[#EBF0F8] bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.05)] space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" strokeWidth={2} />
            <h2 className="text-[15px] font-bold text-[#1A1D23]">Curriculum Analytics</h2>
            <span className="text-xs text-muted-foreground">(CLO-linked questions only)</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={() => {
              // Phase 2: export to CSV via GET /api/analytics/curriculum-export
              const csv = [
                'Level,Avg Score (%),Items',
                ...BLOOMS_PERFORMANCE.map(b => `${b.level},${b.avgScore},${b.items}`),
              ].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement('a');
              a.href = url; a.download = 'blooms-performance.csv'; a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Domain breakdown */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-[#1A1D23]">Performance by Learning Domain</p>
            {DOMAIN_BREAKDOWN.map(d => (
              <div key={d.domain}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <p className="text-[12px] font-semibold text-[#1A1D23]">{d.domain}</p>
                    <span className="text-[10px] text-muted-foreground">{d.questions} items</span>
                  </div>
                  <span className="text-[12px] font-bold" style={{ color: d.color }}>{d.avgScore}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#F4F7FC]">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${d.avgScore}%`, backgroundColor: d.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Bloom's level performance */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-[#1A1D23]">Bloom&apos;s Taxonomy Performance</p>
            <p className="text-[11px] text-muted-foreground mb-3">Higher cognitive levels show lower avg scores — expected pattern.</p>
            <div className="space-y-1">
              {BLOOMS_PERFORMANCE.map((b, i) => {
                const colors = ['#64748b','#3b82f6','#10b981','#f59e0b','#f97316','#8b5cf6'];
                return (
                  <div key={b.level} className="flex items-center gap-3 text-xs">
                    <div className="w-20 text-[#6B7280] font-medium shrink-0">{b.level}</div>
                    <div className="flex-1 h-5 bg-[#F4F7FC] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center justify-end pe-2"
                        style={{ width: `${b.avgScore}%`, backgroundColor: colors[i] }}
                      >
                        <span className="text-white font-bold text-[10px]">{b.avgScore}%</span>
                      </div>
                    </div>
                    <span className="text-muted-foreground shrink-0 w-12 text-end">{b.items} items</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          <span className="font-semibold">NCAAA Accreditation:</span> This breakdown maps directly to Course Learning Outcomes (CLOs).
          Export the CSV above for inclusion in your annual accreditation report — it shows Bloom&apos;s taxonomy coverage and domain balance.
        </div>
      </div>

      {/* Teacher performance table */}
      <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2 border-b border-[#EBF0F8] px-5 py-4">
          <TrendingUp className="h-[18px] w-[18px] text-[#16A34A]" strokeWidth={2} />
          <h2 className="text-[15px] font-bold text-[#1A1D23]">Teacher Performance</h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#EBF0F8]">
              {['Teacher', 'Department', 'Exams', 'Students'].map(h => (
                <th key={h} className="px-5 py-3 text-start text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EBF0F8]">
            {teachers.filter(t => t.status === 'active').map(t => (
              <tr key={t.id} className="hover:bg-[#F9FBFE]">
                <td className="px-5 py-3.5">
                  <p className="text-[13px] font-semibold text-[#1A1D23]">{t.name}</p>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{t.department}</td>
                <td className="px-5 py-3.5 text-[13px] font-semibold text-[#1A1D23]">{t.exams}</td>
                <td className="px-5 py-3.5 text-[13px] text-[#6B7280]">{t.students}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
