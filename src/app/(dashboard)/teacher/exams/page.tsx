'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getExams } from '@/lib/data';
import type { Exam, ExamStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Plus, Search, Monitor, Edit, BarChart3, Trash2, Share2, Copy, Send, Upload, Check, Mail, X } from 'lucide-react';

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

// ── Share modal ──────────────────────────────────────────────────────────────
function ShareModal({ exam }: { exam: Exam }) {
  const examLink = typeof window !== 'undefined'
    ? `${window.location.origin}/exam/${exam.id}`
    : `/exam/${exam.id}`;

  const [copied, setCopied]         = useState(false);
  const [email, setEmail]           = useState('');
  const [sentEmails, setSentEmails] = useState<string[]>([]);
  const [csvEmails, setCsvEmails]   = useState<string[]>([]);
  const [csvSent, setCsvSent]       = useState(false);
  const [csvName, setCsvName]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function copyLink() {
    void navigator.clipboard.writeText(examLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function sendIndividual() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trimmed, role: 'student' }),
    });
    if (!sentEmails.includes(trimmed)) setSentEmails(prev => [...prev, trimmed]);
    setEmail('');
  }

  function removeEmail(addr: string) {
    setSentEmails(prev => prev.filter(e => e !== addr));
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      // Extract all email-shaped tokens from CSV/Excel text
      const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) ?? [];
      const unique = [...new Set(matches.map(m => m.toLowerCase()))];
      setCsvEmails(unique);
      setCsvSent(false);
    };
    reader.readAsText(file);
  }

  async function sendBulk() {
    await Promise.all(
      csvEmails.map(email =>
        fetch('/api/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: 'student' }),
        })
      )
    );
    setCsvSent(true);
  }

  return (
    <div className="space-y-5">
      {/* ── Exam link ── */}
      <div className="space-y-2">
        <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wide">Exam Link</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={examLink}
            className="flex-1 min-w-0 rounded-xl border border-[#E8ECF4] bg-[#F4F7FC] px-3 py-2 text-[13px] font-mono text-[#374151] select-all"
          />
          <Button onClick={copyLink} variant="outline" size="sm" className="rounded-xl shrink-0 gap-1.5">
            {copied ? <><Check className="h-3.5 w-3.5 text-green-500" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
          </Button>
        </div>
      </div>

      <hr className="border-[#EBF0F8]" />

      {/* ── Send to individual emails ── */}
      <div className="space-y-3">
        <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wide">Send to Students</p>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="student@university.edu"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendIndividual(); } }}
            className="rounded-xl border-[#E8ECF4] text-[13px]"
          />
          <Button onClick={sendIndividual} size="sm" className="rounded-xl shrink-0 gap-1.5 bg-[#1E88E5] hover:bg-[#1976D2]">
            <Send className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {sentEmails.length > 0 && (
          <div className="space-y-1.5">
            {sentEmails.map(addr => (
              <div key={addr} className="flex items-center justify-between rounded-lg bg-[#EEF6FF] border border-[#BFDBFE] px-3 py-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-[#1E88E5] shrink-0" />
                  <span className="text-[12px] text-[#1E3A5F]">{addr}</span>
                </div>
                <button onClick={() => removeEmail(addr)} className="text-[#9CA3AF] hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Button size="sm" className="w-full rounded-xl gap-1.5 bg-[#1E88E5] hover:bg-[#1976D2] mt-1">
              <Send className="h-3.5 w-3.5" /> Send to {sentEmails.length} student{sentEmails.length !== 1 ? 's' : ''}
            </Button>
          </div>
        )}
      </div>

      <hr className="border-[#EBF0F8]" />

      {/* ── Bulk CSV/Excel upload ── */}
      <div className="space-y-3">
        <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wide">Bulk Upload (CSV / Excel)</p>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={onFileChange} />
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#BFDBFE] bg-[#EEF6FF] py-5 text-[#1E88E5] hover:bg-[#DBEAFE] transition-colors"
        >
          <Upload className="h-5 w-5" />
          <span className="text-[12px] font-medium">{csvName || 'Click to upload email list'}</span>
          <span className="text-[11px] text-[#9CA3AF]">CSV or Excel — one email per row, or any column</span>
        </button>
        {csvEmails.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-[#6B7280]">Found <strong>{csvEmails.length}</strong> emails in file:</p>
            <div className="max-h-28 overflow-y-auto rounded-xl border border-[#E8ECF4] bg-[#F4F7FC] p-2 space-y-1">
              {csvEmails.map(addr => (
                <div key={addr} className="flex items-center gap-1.5">
                  <Mail className="h-3 w-3 text-[#1E88E5] shrink-0" />
                  <span className="text-[11px] text-[#374151]">{addr}</span>
                </div>
              ))}
            </div>
            {csvSent ? (
              <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-3 py-2">
                <Check className="h-4 w-4 text-green-500" />
                <span className="text-[12px] text-green-700 font-medium">
                  Invitations sent to {csvEmails.length} students! (Phase 2: real email via SMTP)
                </span>
              </div>
            ) : (
              <Button onClick={sendBulk} size="sm" className="w-full rounded-xl gap-1.5 bg-[#1E88E5] hover:bg-[#1976D2]">
                <Send className="h-3.5 w-3.5" /> Send to all {csvEmails.length} emails
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sharingExam, setSharingExam] = useState<Exam | null>(null);

  useEffect(() => {
    getExams().then(data => { setExams(data); setLoading(false); });
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
      <PageHeader
        en="My Exams"
        ar="اختباراتي"
        subEn="Create, manage and monitor your exams"
        subAr="إنشاء وإدارة ومراقبة اختباراتك"
        action={
          <Link href="/teacher/exams/new">
            <Button className="gap-2 bg-[#1E88E5] hover:bg-[#1976D2]">
              <Plus className="h-4 w-4" />
              Create Exam
            </Button>
          </Link>
        }
      />

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
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Share exam link"
                            onClick={() => setSharingExam(exam)}
                          >
                            <Share2 className="h-4 w-4 text-[#1E88E5]" />
                          </Button>
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

      {/* Share modal */}
      <Dialog open={!!sharingExam} onOpenChange={open => { if (!open) setSharingExam(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-[#1E88E5]" />
              Share — {sharingExam?.title}
            </DialogTitle>
          </DialogHeader>
          {sharingExam && <ShareModal exam={sharingExam} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
