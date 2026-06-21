'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getExams } from '@/lib/data';
import type { Exam, ExamStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Monitor, Edit, BarChart3, Trash2 } from 'lucide-react';

const STATUS_STYLES: Record<ExamStatus, 'danger' | 'info' | 'secondary' | 'outline'> = {
  live: 'danger',
  scheduled: 'info',
  completed: 'secondary',
  draft: 'outline',
};

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3, 4].map(i => (
        <tr key={i}>
          <td className="px-4 py-3">
            <div className="h-4 w-40 rounded bg-gray-100 animate-pulse" />
            <div className="mt-1.5 h-3 w-24 rounded bg-gray-100 animate-pulse" />
          </td>
          <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 w-20 rounded bg-gray-100 animate-pulse" /></td>
          <td className="px-4 py-3"><div className="h-5 w-16 rounded-full bg-gray-100 animate-pulse" /></td>
          <td className="px-4 py-3 hidden sm:table-cell"><div className="h-4 w-14 rounded bg-gray-100 animate-pulse" /></td>
          <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 w-8 rounded bg-gray-100 animate-pulse" /></td>
          <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 w-8 rounded bg-gray-100 animate-pulse" /></td>
          <td className="px-4 py-3">
            <div className="flex justify-end gap-1">
              <div className="h-8 w-8 rounded bg-gray-100 animate-pulse" />
              <div className="h-8 w-8 rounded bg-gray-100 animate-pulse" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    getExams('inst-1').then(data => { setExams(data); setLoading(false); });
  }, []);

  function handleDelete(id: string) {
    if (!confirm('Delete this exam? This action cannot be undone.')) return;
    setExams(prev => prev.filter(e => e.id !== id));
  }

  const filtered = exams.filter(e => {
    const matchSearch = e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.subject.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-0.01em] text-[#1A1D23]">My Exams</h1>
          <p className="mt-1 text-[13px] text-[#6B7280]">Create, manage, and monitor your exams</p>
        </div>
        <Link href="/teacher/exams/new">
          <Button className="gap-2 bg-[#1E88E5] hover:bg-[#1976D2]">
            <Plus className="h-4 w-4" />
            Create Exam
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52 max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search exams..."
            className="ps-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="live">Live</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">Exam</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Subject</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Duration</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Students</th>
                  <th className="text-start px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Questions</th>
                  <th className="text-end px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <SkeletonRows />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      {exams.length === 0
                        ? 'No exams yet. Create your first exam to get started.'
                        : 'No exams match your search or filter.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map(exam => (
                    <tr key={exam.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{exam.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(exam.startTime).toLocaleDateString()}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{exam.subject}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_STYLES[exam.status]} className="capitalize gap-1">
                          {exam.status === 'live' && (
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 inline-block" />
                          )}
                          {exam.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{exam.duration} min</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {exam._count?.enrollments ?? 0}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {exam._count?.questions ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {exam.status === 'live' && (
                            <Link href={`/teacher/exams/${exam.id}/monitor`}>
                              <Button size="icon" variant="ghost" title="Monitor live exam">
                                <Monitor className="h-4 w-4 text-green-600" />
                              </Button>
                            </Link>
                          )}
                          {exam.status === 'completed' && (
                            <Link href={`/teacher/exams/${exam.id}/results`}>
                              <Button size="icon" variant="ghost" title="View results">
                                <BarChart3 className="h-4 w-4 text-blue-600" />
                              </Button>
                            </Link>
                          )}
                          <Link href={`/teacher/exams/${exam.id}/edit`}>
                            <Button size="icon" variant="ghost" title="Edit exam">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete exam"
                            onClick={() => handleDelete(exam.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
