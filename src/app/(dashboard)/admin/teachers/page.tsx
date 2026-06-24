'use client';
import { useEffect, useState } from 'react';
import { getTeachersList } from '@/lib/data';
import {
  UserPlus, Copy, Check, X, Mail, MoreHorizontal,
  GraduationCap, FileText, Users, ExternalLink,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const DEPT_COLOR: Record<string, string> = {
  'Computer Science': '#1E88E5',
  Mathematics:        '#7C3AED',
  Physics:            '#16A34A',
  Chemistry:          '#D97706',
  History:            '#E53935',
};

type Teacher = {
  id: string; name: string; email: string; department: string;
  exams: number; students: number; status: 'active' | 'invited';
};

const INSTITUTION_ID = 'inst-1';
const INSTITUTION_NAME = 'University of Technology';

function generateInviteToken(institutionId: string): string {
  const payload = { institutionId, institutionName: INSTITUTION_NAME, expires: '2026-07-21' };
  return btoa(JSON.stringify(payload)).replace(/=/g, '').slice(0, 24);
}

const INVITE_TOKEN = generateInviteToken(INSTITUTION_ID);
const INVITE_LINK  = `https://exampro.app/join?inst=${INSTITUTION_ID}&token=${INVITE_TOKEN}`;

export default function AdminTeachersPage() {
  const [teachers, setTeachers]     = useState<Teacher[]>([]);
  const [search, setSearch]         = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied]         = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [sentEmails, setSentEmails] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    getTeachersList().then(t => setTeachers(t as Teacher[]));
  }, []);

  function copyLink() {
    navigator.clipboard.writeText(INVITE_LINK).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        subEn={`${INSTITUTION_NAME} · ${teachers.length} teachers`}
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
          <button onClick={() => setShowInvite(false)} className="absolute top-4 end-4 rounded-lg p-1.5 text-[#9CA3AF] hover:bg-[#F4F7FC] hover:text-[#1A1D23]">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDE9FE]">
              <UserPlus className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-[#1A1D23]">Invite a Teacher</h2>
              <p className="text-[12px] text-[#6B7280]">Share the link or send directly via email</p>
            </div>
          </div>

          {/* Invite link */}
          <div className="mb-4">
            <p className="mb-2 text-[12px] font-semibold text-[#6B7280] uppercase tracking-wide">Invite Link</p>
            <div className="flex items-center gap-2 rounded-xl border border-[#E8ECF4] bg-[#F4F7FC] px-4 py-3">
              <ExternalLink className="h-4 w-4 flex-shrink-0 text-[#9CA3AF]" />
              <p className="min-w-0 flex-1 truncate text-[13px] text-[#1A1D23] font-mono">{INVITE_LINK}</p>
              <button
                onClick={copyLink}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  copied ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-[#7C3AED] text-white hover:bg-[#6D28D9]'
                }`}
              >
                {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-[#9CA3AF]">Link expires July 21, 2026 · Anyone with this link can join as a teacher</p>
          </div>

          {/* Email invite */}
          <div>
            <p className="mb-2 text-[12px] font-semibold text-[#6B7280] uppercase tracking-wide">Or send via email</p>
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
                <button className="rounded-lg p-1.5 text-[#9CA3AF] hover:bg-[#F4F7FC] hover:text-[#1A1D23]">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
