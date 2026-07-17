'use client';
import { useEffect, useRef, useState } from 'react';
import { getTeachersList, getMyInstitution, setUserSuspension, createBulkTeacherInvites } from '@/lib/data';
import { parseBulkEmails } from '@/lib/class-permissions';
import { parseEmailsFromBuffer } from '@/lib/bulk-email-file-parse';
import {
  UserPlus, Check, X, Mail, MoreHorizontal, Send, Upload, FileSpreadsheet, AlertCircle,
  GraduationCap, FileText, Users,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const DEPT_COLOR: Record<string, string> = {
  'Computer Science': '#1E88E5',
  Mathematics:        '#7C3AED',
  Physics:            '#16A34A',
  Chemistry:          '#D97706',
  History:            '#E53935',
};

type Teacher = {
  id: string; name: string; email: string; department: string;
  exams: number; students: number; status: 'active' | 'invited' | 'suspended';
};

type BulkResult = { email: string; outcome: string };

const OUTCOME_LABEL: Record<string, string> = {
  invited: 'Invited',
  already_member: 'Already a teacher here',
  already_invited: 'Already invited',
  cross_institution: 'Belongs to another institution',
  failed: 'Failed to send',
};

export default function AdminTeachersPage() {
  const [teachers, setTeachers]         = useState<Teacher[]>([]);
  const [institutionName, setInstitutionName] = useState('');
  const [search, setSearch]             = useState('');
  const [showInvite, setShowInvite]     = useState(false);
  const [inviteTab, setInviteTab]       = useState<'email' | 'bulk'>('email');
  const [emailInput, setEmailInput]     = useState('');
  const [sentEmails, setSentEmails]     = useState<string[]>([]);
  const [inviteError, setInviteError]   = useState('');
  const [busyId, setBusyId]             = useState<string | null>(null);

  // Bulk invite (paste or CSV/XLSX upload)
  const fileRef = useRef<HTMLInputElement>(null);
  const [bulkText, setBulkText]         = useState('');
  const [fileEmails, setFileEmails]     = useState<string[] | null>(null);
  const [fileName, setFileName]         = useState('');
  const [fileError, setFileError]       = useState('');
  const [bulkSending, setBulkSending]   = useState(false);
  const [bulkResults, setBulkResults]   = useState<BulkResult[] | null>(null);

  function refresh() {
    Promise.all([getTeachersList(), getMyInstitution()]).then(([t, inst]) => {
      setTeachers(t as Teacher[]);
      if (inst) setInstitutionName(inst.name);
    });
  }

  useEffect(refresh, []);

  async function handleToggleSuspend(teacher: Teacher) {
    const suspend = teacher.status !== 'suspended';
    if (!confirm(`${suspend ? 'Deactivate' : 'Reactivate'} ${teacher.name}'s account?${suspend ? ' Their classes will be archived.' : ''}`)) return;
    setBusyId(teacher.id);
    try {
      const updated = await setUserSuspension(teacher.id, suspend);
      if (updated) {
        setTeachers(prev => prev.map(t => t.id === teacher.id ? { ...t, status: suspend ? 'suspended' : 'active' } : t));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function sendInvite() {
    const email = emailInput.trim();
    if (!email || !email.includes('@')) return;
    setInviteError('');
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role: 'teacher' }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      setInviteError(body.error ?? 'Failed to send invite.');
      return;
    }
    setSentEmails(prev => [...prev, email]);
    setEmailInput('');
  }

  const pastedEmails = parseBulkEmails(bulkText);
  const bulkEmails = fileEmails ?? pastedEmails;

  function processFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setFileError('Only .xlsx, .xls, or .csv files are accepted.');
      return;
    }
    setFileName(file.name);
    setFileError('');
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const buf = e.target?.result as ArrayBuffer;
        const found = parseEmailsFromBuffer(buf);
        if (found.length === 0) setFileError('No valid email addresses found in the file.');
        else setFileEmails(found);
      } catch {
        setFileError('Could not read file. Make sure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  function clearFile() {
    setFileEmails(null);
    setFileName('');
    setFileError('');
  }

  async function sendBulkInvites() {
    if (bulkEmails.length === 0) return;
    setBulkSending(true);
    try {
      const results = await createBulkTeacherInvites(bulkEmails);
      setBulkResults(results ?? []);
      setBulkText('');
      clearFile();
      refresh();
    } finally {
      setBulkSending(false);
    }
  }

  function closeInviteModal() {
    setShowInvite(false);
    setInviteError('');
    setBulkResults(null);
    setBulkText('');
    clearFile();
  }

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase()) ||
    t.department.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        en="Teachers"
        ar="المعلمون"
        subEn={`${institutionName} · ${teachers.length} teachers`}
        subAr="إدارة المعلمين ودعواتهم"
        action={
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#7C3AED] px-4 py-2.5 text-[14px] font-semibold text-white shadow-md shadow-purple-200 transition-all hover:-translate-y-px hover:bg-[#6D28D9]"
          >
            <UserPlus className="h-4 w-4" />
            Invite Teacher
          </button>
        }
      />

      {/* Invite modal */}
      {showInvite && (
        <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_4px_24px_rgba(0,0,0,0.10)] p-6 relative">
          <button onClick={closeInviteModal} className="absolute top-4 end-4 rounded-lg p-1.5 text-[#9CA3AF] hover:bg-[#F4F7FC] hover:text-[#1A1D23]">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDE9FE]">
              <UserPlus className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-[#1A1D23]">Invite Teachers</h2>
              <p className="text-[12px] text-[#6B7280]">Invitations are sent by email only</p>
            </div>
          </div>

          {/* Tab bar */}
          <div className="mb-5 flex border-b border-[#E8ECF4]">
            {([['email', 'Single Email'], ['bulk', 'Bulk Invite']] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setInviteTab(id)}
                className={`relative pb-3 pe-5 text-[13px] font-semibold transition-colors ${
                  inviteTab === id ? 'text-[#7C3AED]' : 'text-[#9CA3AF] hover:text-[#6B7280]'
                }`}
              >
                {label}
                {inviteTab === id && <span className="absolute bottom-0 start-0 end-4 h-[2px] rounded-full bg-[#7C3AED]" />}
              </button>
            ))}
          </div>

          {inviteTab === 'email' && (
            <div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
                  <input
                    type="email"
                    placeholder="teacher@university.edu"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendInvite()}
                    className="w-full rounded-xl border border-[#E8ECF4] bg-white py-2.5 ps-10 pe-4 text-[14px] text-[#1A1D23] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-4 focus:ring-[#7C3AED]/10 focus:border-[#7C3AED]"
                  />
                </div>
                <button
                  onClick={sendInvite}
                  className="rounded-xl bg-[#7C3AED] px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-[#6D28D9]"
                >
                  Send
                </button>
              </div>
              {inviteError && (
                <p className="mt-2 text-[12px] text-red-500">{inviteError}</p>
              )}
              {sentEmails.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sentEmails.map(email => (
                    <span key={email} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-3 py-1 text-[12px] font-semibold text-emerald-700">
                      <Check className="h-3 w-3" /> Sent to {email}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {inviteTab === 'bulk' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wide">Paste emails</p>
                <Textarea
                  rows={4}
                  placeholder={'teacher1@example.com\nteacher2@example.com'}
                  value={bulkText}
                  onChange={e => { setBulkText(e.target.value); clearFile(); }}
                  className="rounded-xl border-[#E8ECF4]"
                />
              </div>

              <div className="space-y-2">
                <p className="text-[12px] font-semibold text-[#6B7280] uppercase tracking-wide">Or upload a spreadsheet</p>
                <div
                  onClick={() => fileRef.current?.click()}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#E8ECF4] bg-[#F9FBFE] px-4 py-3 hover:border-[#7C3AED] hover:bg-[#F5F0FE]"
                >
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
                  {fileEmails ? (
                    <>
                      <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-emerald-700">{fileName} — {fileEmails.length} emails</span>
                      <button onClick={e => { e.stopPropagation(); clearFile(); }} className="text-[#9CA3AF] hover:text-red-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 flex-shrink-0 text-[#9CA3AF]" />
                      <span className="text-[13px] text-[#6B7280]">Click to browse — .xlsx, .xls, or .csv</span>
                    </>
                  )}
                </div>
                {fileError && (
                  <p className="flex items-center gap-1.5 text-[12px] text-red-500">
                    <AlertCircle className="h-3.5 w-3.5" /> {fileError}
                  </p>
                )}
              </div>

              {bulkResults && (
                <div className="space-y-1 rounded-xl border border-[#E8ECF4] bg-[#F9FBFE] p-3 max-h-40 overflow-y-auto">
                  {bulkResults.map(r => (
                    <p key={r.email} className="text-[12px] text-[#1A1D23]">
                      <span className="font-medium">{r.email}</span> — {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[#E8ECF4] pt-4">
                {bulkEmails.length > 0
                  ? <p className="text-[12px] text-[#6B7280]">{bulkEmails.length} email{bulkEmails.length !== 1 ? 's' : ''} ready</p>
                  : <span />}
                <button
                  onClick={() => { void sendBulkInvites(); }}
                  disabled={bulkEmails.length === 0 || bulkSending}
                  className="flex items-center gap-2 rounded-xl bg-[#7C3AED] px-5 py-2.5 text-[13px] font-semibold text-white shadow-md shadow-purple-200 transition-all hover:-translate-y-px hover:bg-[#6D28D9] disabled:pointer-events-none disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                  {bulkSending ? 'Sending…' : `Send ${bulkEmails.length > 0 ? `${bulkEmails.length} ` : ''}Invite${bulkEmails.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <GraduationCap className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
        <input
          placeholder="Search by name, email or department…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-[#E8ECF4] bg-white py-2.5 ps-10 pe-4 text-[14px] text-[#1A1D23] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-4 focus:ring-[#7C3AED]/10 focus:border-[#7C3AED]"
        />
      </div>

      {/* Teacher list */}
      <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
        <div className="border-b border-[#EBF0F8] px-5 py-4">
          <h2 className="text-[15px] font-bold text-[#1A1D23]">{filtered.length} Teachers</h2>
        </div>
        <ul className="divide-y divide-[#EBF0F8]">
          {filtered.map(teacher => {
            const initials = teacher.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            const color = DEPT_COLOR[teacher.department] ?? '#6B7280';
            return (
              <li key={teacher.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#F9FBFE]">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ backgroundColor: color }}>
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold text-[#1A1D23]">{teacher.name}</p>
                    {teacher.status === 'invited' && (
                      <span className="rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-600">Pending</span>
                    )}
                    {teacher.status === 'active' && (
                      <span className="rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Active</span>
                    )}
                    {teacher.status === 'suspended' && (
                      <span className="rounded-full bg-red-50 border border-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">Suspended</span>
                    )}
                  </div>
                  <p className="text-[12px] text-[#9CA3AF]">{teacher.email}</p>
                  <p className="text-[11px] text-[#C4C9D4]">{teacher.department}</p>
                </div>
                <div className="hidden text-end sm:block">
                  <div className="flex items-center gap-4 text-[13px] text-[#6B7280]">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 text-[#9CA3AF]" />
                      {teacher.exams} exams
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-[#9CA3AF]" />
                      {teacher.students} students
                    </span>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      disabled={busyId === teacher.id}
                      className="rounded-lg p-1.5 text-[#9CA3AF] hover:bg-[#F4F7FC] hover:text-[#1A1D23]"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleToggleSuspend(teacher)}
                      className={teacher.status === 'suspended' ? '' : 'text-red-600 focus:text-red-600'}
                    >
                      {teacher.status === 'suspended' ? 'Reactivate Account' : 'Deactivate Account'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
