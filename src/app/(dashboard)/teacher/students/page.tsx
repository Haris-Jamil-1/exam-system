'use client';
import { useState, useEffect } from 'react';
import { getStudents } from '@/lib/data';
import type { StudentRosterEntry } from '@/lib/data/students';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { Search, Mail } from 'lucide-react';

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StudentsPage() {
  const [students, setStudents] = useState<StudentRosterEntry[]>([]);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    getStudents().then(setStudents);
  }, []);

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        en="Students"
        ar="الطلاب"
        subEn="Students enrolled across your exams — invite students from a class in the Classes tab"
        subAr="الطلاب المسجلون في اختباراتك"
      />

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
        <input
          type="text"
          placeholder="Search students..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-10 w-full rounded-xl border border-[#E8ECF4] bg-white ps-9 pe-4 text-[13px] text-[#1A1D23] placeholder:text-[#9CA3AF] outline-none transition-all focus:border-[#1E88E5] focus:ring-4 focus:ring-[#1E88E5]/10"
        />
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[#EBF0F8] bg-[#F9FBFE]">
              <tr>
                <th className="px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Student</th>
                <th className="hidden px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF] md:table-cell">Email</th>
                <th className="hidden px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF] lg:table-cell">Class</th>
                <th className="px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Trust Score</th>
                <th className="hidden px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF] sm:table-cell">Violations</th>
                <th className="px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF0F8]">
              {filtered.map(s => {
                const vCount = s.violationCount;
                const hasTrust = s.trustScore !== null;
                return (
                  <tr key={s.id} className="transition-colors hover:bg-[#F9FBFE]">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="rounded-lg bg-[#E3F0FD] text-[11px] font-bold text-[#1E88E5]">
                            {s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[13px] font-semibold text-[#1A1D23]">{s.name}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 md:table-cell">
                      <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
                        <Mail className="h-3 w-3 text-[#9CA3AF]" />
                        {s.email}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 lg:table-cell">
                      {s.classNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {s.classNames.map(name => (
                            <Badge key={name} variant="secondary" className="text-[11px] font-normal">{name}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[12px] text-[#C4C9D4]">No class</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {hasTrust ? (
                        <span className={`text-[13px] font-semibold ${s.trustScore! >= 80 ? 'text-green-600' : s.trustScore! >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                          {Math.round(s.trustScore!)}%
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#9CA3AF]">Not yet computed</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3.5 text-[13px] text-[#6B7280] sm:table-cell">{vCount}</td>
                    <td className="px-4 py-3.5">
                      <Badge variant={vCount === 0 ? 'success' : vCount > 2 ? 'danger' : 'warning'}>
                        {vCount === 0 ? 'Clean' : vCount > 2 ? 'Flagged' : 'Warning'}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
