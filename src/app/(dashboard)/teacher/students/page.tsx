'use client';
import { useState, useEffect } from 'react';
import { getStudents, getViolations } from '@/lib/data';
import type { CurrentUser, Violation } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, Mail } from 'lucide-react';

export default function StudentsPage() {
  const [students, setStudents] = useState<CurrentUser[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([getStudents('inst-1'), getViolations()]).then(([s, v]) => {
      setStudents(s);
      setViolations(v);
    });
  }, []);

  const filtered = students.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.01em] text-[#1A1D23]">Students</h1>
        <p className="mt-1 text-[13px] text-[#6B7280]">Students enrolled across your exams</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search students..."
          className="ps-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">Student</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Email</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">Trust Score</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Violations</th>
                <th className="text-start px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((s) => {
                const vCount = violations.filter(v => v.studentId === s.id).length;
                const trustScore = Math.max(40, 100 - vCount * 15);
                return (
                  <tr key={s.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                            {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {s.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${trustScore < 60 ? 'text-red-600' : trustScore < 80 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {trustScore}%
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">{vCount}</td>
                    <td className="px-4 py-3">
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
