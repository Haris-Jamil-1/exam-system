'use client';
import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { getStudents, getViolations, getMyInstitution } from '@/lib/data';
import type { CurrentUser, Violation } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/PageHeader';
import {
  Search, Mail, UserPlus, Link2, Copy, Check, X,
  Upload, FileSpreadsheet, Send, AlertCircle,
} from 'lucide-react';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://exam-system-sigma.vercel.app';

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function parseEmailsFromBuffer(buffer: ArrayBuffer): string[] {
  const wb   = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  const found: string[] = [];
  for (const row of rows) {
    for (const cell of row) {
      const v = String(cell ?? '').trim();
      if (isEmail(v)) found.push(v.toLowerCase());
    }
  }
  return [...new Set(found)];
}

// ── Shared pill tabs ──────────────────────────────────────────────────────────
type Tab = 'link' | 'email' | 'bulk';
const TAB_CONFIG: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'link',  label: 'Share Link',  icon: Link2          },
  { id: 'email', label: 'By Email',    icon: Mail           },
  { id: 'bulk',  label: 'Bulk Upload', icon: FileSpreadsheet },
];

// ── Link tab ──────────────────────────────────────────────────────────────────
function LinkTab({ inviteLink }: { inviteLink: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(inviteLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div className="space-y-5">
      {/* Icon hero */}
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-gradient-to-b from-[#EBF5FF] to-[#F4F7FC] py-7 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1E88E5] shadow-lg shadow-blue-200">
          <Link2 className="h-6 w-6 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[15px] font-bold text-[#1A1D23]">Invite via Link</p>
          <p className="mt-0.5 text-[12px] text-[#6B7280]">Share this link — students can register and join your institution</p>
        </div>
      </div>

      {/* Link box */}
      <div className="overflow-hidden rounded-xl border border-[#E8ECF4] bg-[#F9FBFE]">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex-1 truncate font-mono text-[12px] text-[#6B7280]">
            {inviteLink}
          </span>
          <button
            onClick={copy}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition-all ${
              copied
                ? 'bg-green-500 text-white'
                : 'bg-[#1E88E5] text-white hover:bg-[#1976D2]'
            }`}
          >
            {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy Link</>}
          </button>
        </div>
      </div>

      <p className="text-[12px] text-[#9CA3AF] text-center">
        For individual email invitations, use the &quot;By Email&quot; tab above.
      </p>
    </div>
  );
}

// ── Email tab ─────────────────────────────────────────────────────────────────
function EmailTab() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [input,    setInput]    = useState('');
  const [emails,   setEmails]   = useState<string[]>([]);
  const [error,    setError]    = useState('');
  const [sent,     setSent]     = useState(false);
  const [sending,  setSending]  = useState(false);
  const [sentCount, setSentCount] = useState(0);

  function add() {
    const v = input.trim().toLowerCase();
    if (!isEmail(v)) { setError('Enter a valid email address.'); return; }
    if (emails.includes(v)) { setError('Already added.'); return; }
    setEmails(p => [...p, v]);
    setInput('');
    setError('');
    inputRef.current?.focus();
  }

  function remove(e: string) { setEmails(p => p.filter(x => x !== e)); }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  }

  async function sendAll() {
    if (!emails.length) return;
    setSending(true);
    setError('');
    let sent = 0;
    for (const email of emails) {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: 'student' }),
      });
      if (res.ok) sent++;
    }
    setSentCount(sent);
    setSending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <Check className="h-7 w-7 text-green-600" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[16px] font-bold text-[#1A1D23]">Invites Sent!</p>
          <p className="mt-1 text-[13px] text-[#6B7280]">
            {sentCount} student{sentCount !== 1 ? 's' : ''} will receive an email invitation.
          </p>
        </div>
        <button
          onClick={() => { setEmails([]); setSent(false); setSentCount(0); }}
          className="mt-1 rounded-xl border border-[#E8ECF4] px-5 py-2 text-[13px] font-semibold text-[#1A1D23] transition-colors hover:border-[#CBD5E1] hover:bg-[#F9FBFE]"
        >
          Send more invites
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B7280]">
        Add one or more student emails, then send invitations in one click.
      </p>

      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            ref={inputRef}
            type="email"
            placeholder="student@example.com"
            value={input}
            onChange={e => { setInput(e.target.value); setError(''); }}
            onKeyDown={onKey}
            className="h-10 w-full rounded-xl border border-[#E8ECF4] bg-white ps-9 pe-4 text-[13px] text-[#1A1D23] placeholder:text-[#9CA3AF] outline-none transition-all focus:border-[#1E88E5] focus:ring-4 focus:ring-[#1E88E5]/10"
          />
        </div>
        <button
          onClick={add}
          className="shrink-0 rounded-xl bg-[#1E88E5] px-4 text-[13px] font-semibold text-white transition-all hover:bg-[#1976D2]"
        >
          Add
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-[12px] text-red-500">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      {/* Email chips */}
      {emails.length > 0 && (
        <div className="rounded-xl border border-[#E8ECF4] bg-[#F9FBFE] p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            {emails.length} to invite
          </p>
          <div className="flex max-h-[120px] flex-wrap gap-1.5 overflow-y-auto">
            {emails.map(e => (
              <span
                key={e}
                className="flex items-center gap-1.5 rounded-full border border-[#E8ECF4] bg-white py-1 pe-2 ps-3 text-[12px] text-[#1A1D23] shadow-sm"
              >
                {e}
                <button
                  onClick={() => remove(e)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[#9CA3AF] transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Send button */}
      <div className="flex items-center justify-between border-t border-[#E8ECF4] pt-4">
        {emails.length > 0
          ? <p className="text-[12px] text-[#6B7280]">{emails.length} email{emails.length !== 1 ? 's' : ''} ready</p>
          : <span />
        }
        <button
          onClick={() => { void sendAll(); }}
          disabled={emails.length === 0 || sending}
          className="flex items-center gap-2 rounded-xl bg-[#1E88E5] px-5 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-blue-200 transition-all hover:-translate-y-px hover:bg-[#1976D2] disabled:pointer-events-none disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          {sending ? 'Sending…' : `Send ${emails.length > 0 ? `${emails.length} ` : ''}Invite${emails.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ── Bulk tab ──────────────────────────────────────────────────────────────────
function BulkTab() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging,    setDragging]    = useState(false);
  const [fileName,    setFileName]    = useState('');
  const [emails,      setEmails]      = useState<string[]>([]);
  const [parseError,  setParseError]  = useState('');
  const [sent,        setSent]        = useState(false);
  const [sending,     setSending]     = useState(false);
  const [sentCount,   setSentCount]   = useState(0);

  function processFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseError('Only .xlsx, .xls, or .csv files are accepted.');
      return;
    }
    setFileName(file.name);
    setParseError('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const buf   = e.target?.result as ArrayBuffer;
        const found = parseEmailsFromBuffer(buf);
        if (found.length === 0) setParseError('No valid email addresses found in the file.');
        else setEmails(found);
      } catch {
        setParseError('Could not read file. Make sure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  function remove(email: string) { setEmails(p => p.filter(x => x !== email)); }

  function reset() { setEmails([]); setFileName(''); setParseError(''); setSent(false); setSentCount(0); }

  async function sendAll() {
    if (!emails.length) return;
    setSending(true);
    let count = 0;
    for (const email of emails) {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: 'student' }),
      });
      if (res.ok) count++;
    }
    setSentCount(count);
    setSending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <Check className="h-7 w-7 text-green-600" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-[16px] font-bold text-[#1A1D23]">Invites Sent!</p>
          <p className="mt-1 text-[13px] text-[#6B7280]">
            {sentCount} of {emails.length} students from <strong>{fileName}</strong> will receive invitations.
          </p>
        </div>
        <button
          onClick={reset}
          className="mt-1 rounded-xl border border-[#E8ECF4] px-5 py-2 text-[13px] font-semibold text-[#1A1D23] transition-colors hover:border-[#CBD5E1] hover:bg-[#F9FBFE]"
        >
          Upload another file
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[#6B7280]">
        Upload a spreadsheet with a column of email addresses. All valid emails will be extracted automatically.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed py-9 text-center transition-all ${
          dragging
            ? 'border-[#1E88E5] bg-blue-50'
            : emails.length > 0
            ? 'border-green-400 bg-green-50'
            : 'border-[#E8ECF4] bg-[#F9FBFE] hover:border-[#1E88E5] hover:bg-[#EBF5FF]'
        }`}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />

        {emails.length > 0 ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-100">
              <FileSpreadsheet className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-green-700">{fileName}</p>
              <p className="text-[12px] text-green-600">{emails.length} valid emails found</p>
            </div>
            <span className="rounded-full border border-green-200 bg-white px-3 py-1 text-[11px] font-medium text-green-600">
              Click to replace
            </span>
          </>
        ) : (
          <>
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${dragging ? 'bg-[#1E88E5]' : 'bg-[#EBF0F8]'}`}>
              <Upload className={`h-6 w-6 transition-colors ${dragging ? 'text-white' : 'text-[#6B7280]'}`} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#1A1D23]">Drop your file here</p>
              <p className="text-[12px] text-[#9CA3AF]">or click to browse</p>
            </div>
            <div className="flex items-center gap-1.5">
              {['.xlsx', '.xls', '.csv'].map(ext => (
                <span key={ext} className="rounded-full border border-[#E8ECF4] bg-white px-2 py-0.5 text-[10px] font-medium text-[#6B7280]">
                  {ext}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {parseError && (
        <p className="flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {parseError}
        </p>
      )}

      {/* Email preview */}
      {emails.length > 0 && (
        <div className="rounded-xl border border-[#E8ECF4] bg-[#F9FBFE] p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
            Preview — {emails.length} emails
          </p>
          <div className="flex max-h-[110px] flex-wrap gap-1.5 overflow-y-auto">
            {emails.map(e => (
              <span
                key={e}
                className="flex items-center gap-1.5 rounded-full border border-[#E8ECF4] bg-white py-1 pe-2 ps-3 text-[12px] text-[#1A1D23] shadow-sm"
              >
                {e}
                <button
                  onClick={() => remove(e)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[#9CA3AF] transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Send */}
      <div className="flex items-center justify-between border-t border-[#E8ECF4] pt-4">
        {emails.length > 0
          ? <p className="text-[12px] text-[#6B7280]">{emails.length} email{emails.length !== 1 ? 's' : ''} ready</p>
          : <span />
        }
        <button
          onClick={() => { void sendAll(); }}
          disabled={emails.length === 0 || sending}
          className="flex items-center gap-2 rounded-xl bg-[#1E88E5] px-5 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-blue-200 transition-all hover:-translate-y-px hover:bg-[#1976D2] disabled:pointer-events-none disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          {sending ? 'Sending…' : `Send ${emails.length > 0 ? `${emails.length} ` : ''}Invite${emails.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ── Invite modal ──────────────────────────────────────────────────────────────
function InviteStudentsModal({ open, onClose, inviteLink }: { open: boolean; onClose: () => void; inviteLink: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('link');

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="flex flex-col gap-0 overflow-hidden rounded-2xl p-0 shadow-[0_24px_64px_rgba(15,23,42,0.18)] sm:max-w-[520px] max-h-[90vh]">
        {/* Header */}
        <DialogHeader className="shrink-0 border-b border-[#E8ECF4] px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E3F0FD]">
              <UserPlus className="h-[18px] w-[18px] text-[#1E88E5]" strokeWidth={2.5} />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-bold text-[#1A1D23]">Invite Students</DialogTitle>
              <p className="text-[12px] text-[#9CA3AF]">Choose your preferred invitation method</p>
            </div>
          </div>
        </DialogHeader>

        {/* Tab bar */}
        <div className="shrink-0 flex border-b border-[#E8ECF4] bg-[#F4F7FC] px-6 pt-4">
          {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center gap-1.5 pb-3 pe-4 ps-1 text-[13px] font-semibold transition-colors ${
                activeTab === id
                  ? 'text-[#1E88E5]'
                  : 'text-[#9CA3AF] hover:text-[#6B7280]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {activeTab === id && (
                <span className="absolute bottom-0 start-0 end-4 h-[2px] rounded-full bg-[#1E88E5]" />
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5">
          {activeTab === 'link'  && <LinkTab inviteLink={inviteLink} />}
          {activeTab === 'email' && <EmailTab />}
          {activeTab === 'bulk'  && <BulkTab  />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StudentsPage() {
  const [students,   setStudents]   = useState<CurrentUser[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [search,     setSearch]     = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState(`${APP_URL}/register`);

  useEffect(() => {
    Promise.all([getStudents(), getViolations(), getMyInstitution()]).then(([s, v, inst]) => {
      setStudents(s);
      setViolations(v);
      if (inst) setInviteLink(`${APP_URL}/register?institution=${inst.id}`);
    });
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
        subEn="Students enrolled across your exams"
        subAr="الطلاب المسجلون في اختباراتك"
        action={
          <button
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1E88E5] px-4 py-2.5 text-[14px] font-semibold text-white shadow-md shadow-blue-200 transition-all hover:-translate-y-px hover:bg-[#1976D2] hover:shadow-lg hover:shadow-blue-200"
          >
            <UserPlus className="h-4 w-4" />
            Invite Students
          </button>
        }
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
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-[#EBF0F8] bg-[#F9FBFE]">
              <tr>
                <th className="px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Student</th>
                <th className="hidden px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF] md:table-cell">Email</th>
                <th className="px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Trust Score</th>
                <th className="hidden px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF] sm:table-cell">Violations</th>
                <th className="px-4 py-3 text-start text-[12px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF0F8]">
              {filtered.map(s => {
                const vCount     = violations.filter(v => v.studentId === s.id).length;
                const trustScore = Math.max(40, 100 - vCount * 15);
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
                    <td className="px-4 py-3.5">
                      <span className={`text-[13px] font-semibold ${trustScore >= 80 ? 'text-green-600' : trustScore >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                        {trustScore}%
                      </span>
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

      <InviteStudentsModal open={inviteOpen} onClose={() => setInviteOpen(false)} inviteLink={inviteLink} />
    </div>
  );
}
