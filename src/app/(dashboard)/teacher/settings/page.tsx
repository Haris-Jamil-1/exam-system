'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { Check, User, Lock, Bell, FileText, GraduationCap, ShieldCheck, Camera } from 'lucide-react';
import { getMyInstitution } from '@/lib/data/users';
import { getTeacherDashboardData } from '@/lib/data/analytics';

type ProfileFormValues = { name: string; email: string; institution: string };

export default function TeacherSettingsPage() {
  const currentUser = useCurrentUser();
  const [saved, setSaved]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [saveError, setSaveError] = useState('');
  const [pwSaved, setPwSaved] = useState(false);
  const [institutionName, setInstitutionName] = useState('');
  const [stats, setStats] = useState<{ activeExams: number; totalStudents: number; avgTrust: string } | null>(null);
  const [notifications, setNotifications] = useState({
    violationAlerts: true,
    examStart:       true,
    examEnd:         true,
    weeklyReport:    false,
  });

  const { register, reset, handleSubmit } = useForm<ProfileFormValues>({
    defaultValues: { name: '', email: '', institution: '' },
  });

  useEffect(() => {
    getMyInstitution().then(inst => {
      const name = inst?.name ?? '';
      setInstitutionName(name);
      if (currentUser) {
        reset({ name: currentUser.name, email: currentUser.email, institution: name });
      }
    });
  }, [currentUser, reset]);

  useEffect(() => {
    getTeacherDashboardData().then(d => {
      const byKey = Object.fromEntries(d.stats.map(s => [s.key, s.value]));
      setStats({
        activeExams: Number(byKey.activeExams ?? 0),
        totalStudents: Number(byKey.totalStudents ?? 0),
        avgTrust: String(byKey.avgTrust ?? '—'),
      });
    });
  }, []);

  async function onSubmit(values: ProfileFormValues) {
    const name = values.name.trim();
    if (!name) return;
    setSaveError('');
    setSaving(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        setSaveError(body.error ?? 'Failed to save changes.');
        return;
      }
      const updated = await res.json() as { name: string };
      // Keep the locally cached session (useCurrentUser reads this on mount) in sync so the
      // updated name shows up elsewhere in the shell without requiring a full reload.
      if (currentUser) {
        localStorage.setItem('exam_user', JSON.stringify({ ...currentUser, name: updated.name }));
      }
      reset({ name: updated.name, email: values.email, institution: values.institution });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }
  function onPwSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 2000);
  }

  const notifItems = [
    { key: 'violationAlerts', label: 'Violation alerts',      desc: 'Notify when a student triggers a proctoring violation' },
    { key: 'examStart',       label: 'Exam start reminders',  desc: '15-min reminder before a scheduled exam begins' },
    { key: 'examEnd',         label: 'Exam completion',       desc: 'Notify when all students have submitted' },
    { key: 'weeklyReport',    label: 'Weekly analytics report', desc: 'Summary of exam performance sent every Monday' },
  ];

  const { avatarUrl, openPicker, onFileChange, inputRef, removeAvatar } = useAvatarUpload();
  const initials = currentUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'T';

  return (
    <div className="space-y-6">
      <PageHeader en="Settings" ar="الإعدادات" subEn="Manage your profile, preferences and security" subAr="إدارة ملفك الشخصي وتفضيلاتك" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left column (2/3) ── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Profile form */}
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-3 border-b border-[#EBF0F8] px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E3F0FD]">
                <User className="h-4 w-4 text-[#1E88E5]" strokeWidth={2} />
              </div>
              <h2 className="text-[15px] font-bold text-[#1A1D23]">Profile</h2>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold text-[#1A1D23]">Full Name</Label>
                  <Input {...register('name')} className="rounded-xl border-[#E8ECF4] focus:border-[#1E88E5] focus:ring-[#1E88E5]/10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold text-[#1A1D23]">Email</Label>
                  <Input type="email" {...register('email')} disabled className="rounded-xl bg-[#F4F7FC] border-[#E8ECF4] text-[#9CA3AF]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold text-[#1A1D23]">Institution</Label>
                <Input {...register('institution')} disabled className="rounded-xl bg-[#F4F7FC] border-[#E8ECF4] text-[#9CA3AF]" />
                <p className="text-[12px] text-[#9CA3AF]">Contact your admin to change institution or email details.</p>
              </div>
              {saveError && (
                <p className="text-[12px] text-red-500">{saveError}</p>
              )}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#E3F0FD] border border-[#BFDBFE] px-3 py-1 text-[12px] font-semibold text-[#1E88E5]">Teacher</span>
                  <span className="text-[12px] text-[#9CA3AF]">· Exam creation &amp; proctoring</span>
                </div>
                <Button type="submit" size="sm" disabled={saving} className="gap-1.5 rounded-xl bg-[#1E88E5] hover:bg-[#1976D2]">
                  {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : saving ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>

          {/* Security */}
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-3 border-b border-[#EBF0F8] px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FEF3C7]">
                <Lock className="h-4 w-4 text-[#D97706]" strokeWidth={2} />
              </div>
              <h2 className="text-[15px] font-bold text-[#1A1D23]">Security</h2>
            </div>
            <form onSubmit={onPwSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold text-[#1A1D23]">Current Password</Label>
                  <Input type="password" placeholder="••••••••" className="rounded-xl border-[#E8ECF4]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold text-[#1A1D23]">New Password</Label>
                  <Input type="password" placeholder="••••••••" className="rounded-xl border-[#E8ECF4]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold text-[#1A1D23]">Confirm</Label>
                  <Input type="password" placeholder="••••••••" className="rounded-xl border-[#E8ECF4]" />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <Button type="submit" variant="outline" size="sm" className="rounded-xl gap-1.5">
                  {pwSaved ? <><Check className="h-3.5 w-3.5" /> Updated!</> : 'Change Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* ── Right column (1/3) ── */}
        <div className="space-y-6">
          {/* Profile card */}
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="h-20" style={{ background: 'linear-gradient(135deg, #1E88E5 0%, #1565C0 100%)' }} />
            <div className="px-5 pb-5">
              <div className="-mt-8 mb-3 flex items-end gap-2">
                <div className="relative">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-2xl border-4 border-white object-cover shadow-md" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white bg-[#1E88E5] text-[20px] font-extrabold text-white shadow-md">
                      {initials}
                    </div>
                  )}
                  <button onClick={openPicker} className="absolute -bottom-1 -end-1 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-[#E8ECF4] shadow-sm hover:bg-gray-50">
                    <Camera className="h-3.5 w-3.5 text-[#6B7280]" />
                  </button>
                  <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
                </div>
                {avatarUrl && (
                  <button onClick={removeAvatar} className="text-[11px] text-red-400 hover:text-red-600 mb-1">Remove</button>
                )}
              </div>
              <p className="text-[16px] font-bold text-[#1A1D23]">{currentUser?.name ?? 'Teacher'}</p>
              <p className="text-[13px] text-[#9CA3AF]">{currentUser?.email ?? ''}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full bg-[#E3F0FD] border border-[#BFDBFE] px-2.5 py-0.5 text-[11px] font-semibold text-[#1E88E5]">Teacher</span>
                <span className="text-[11px] text-[#9CA3AF]">{institutionName}</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#F4F7FC] p-3">
                {[
                  { label: 'Active Exams', value: stats ? String(stats.activeExams) : '—', icon: FileText, color: '#1E88E5' },
                  { label: 'Students', value: stats ? String(stats.totalStudents) : '—', icon: GraduationCap, color: '#7C3AED' },
                  { label: 'Avg Trust', value: stats ? (stats.avgTrust === '—' ? '—' : `${stats.avgTrust}%`) : '—', icon: ShieldCheck, color: '#16A34A' },
                ].map(s => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="text-center">
                      <Icon className="mx-auto h-4 w-4 mb-1" style={{ color: s.color }} strokeWidth={2} />
                      <p className="text-[14px] font-extrabold text-[#1A1D23]">{s.value}</p>
                      <p className="text-[10px] text-[#9CA3AF]">{s.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-3 border-b border-[#EBF0F8] px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E3F0FD]">
                <Bell className="h-4 w-4 text-[#1E88E5]" strokeWidth={2} />
              </div>
              <h2 className="text-[15px] font-bold text-[#1A1D23]">Notifications</h2>
            </div>
            <div className="p-5 space-y-4">
              {notifItems.map(n => (
                <div key={n.key} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#1A1D23]">{n.label}</p>
                    <p className="text-[11px] text-[#9CA3AF] leading-[1.5]">{n.desc}</p>
                  </div>
                  <label className="relative inline-flex flex-shrink-0 cursor-pointer items-center mt-0.5">
                    <input
                      type="checkbox"
                      checked={notifications[n.key as keyof typeof notifications]}
                      onChange={e => setNotifications(prev => ({ ...prev, [n.key]: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-[#1E88E5] transition-colors after:absolute after:start-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 after:content-['']" />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
