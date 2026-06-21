'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Check, GraduationCap, ShieldCheck, FileText,
  Bell, Lock, User,
} from 'lucide-react';

export default function StudentSettingsPage() {
  const currentUser = useCurrentUser();
  const [saved, setSaved]       = useState(false);
  const [pwSaved, setPwSaved]   = useState(false);
  const [notifications, setNotifications] = useState({
    examReminders: true,
    resultsReady:  true,
    violations:    false,
    weeklyDigest:  false,
  });

  const { register, reset, handleSubmit } = useForm({
    defaultValues: { name: '', email: '', institution: 'University of Technology' },
  });

  useEffect(() => {
    if (currentUser) {
      reset({ name: currentUser.name, email: currentUser.email, institution: 'University of Technology' });
    }
  }, [currentUser, reset]);

  function onSubmit() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  function onPwSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 2000);
  }

  const notifItems = [
    { key: 'examReminders', label: 'Exam reminders',    desc: '15-min reminder before a scheduled exam starts' },
    { key: 'resultsReady',  label: 'Results published', desc: 'Notify when your exam results are available' },
    { key: 'violations',    label: 'Violation notices',  desc: 'Post-exam report of any flagged proctoring events' },
    { key: 'weeklyDigest',  label: 'Weekly digest',      desc: 'Summary of upcoming exams and recent scores' },
  ];

  const initials = currentUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'S';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.01em] text-[#1A1D23]">Settings</h1>
        <p className="mt-1 text-[13px] text-[#6B7280]">Manage your profile, preferences and security</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ── Left column (2/3) ── */}
        <div className="space-y-6 lg:col-span-2">

          {/* Profile form */}
          <div className="rounded-2xl border border-[#EBF0F8] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-3 border-b border-[#EBF0F8] px-6 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DCFCE7]">
                <User className="h-4 w-4 text-[#16A34A]" strokeWidth={2} />
              </div>
              <h2 className="text-[15px] font-bold text-[#1A1D23]">Profile</h2>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold text-[#1A1D23]">Full Name</Label>
                  <Input {...register('name')} className="rounded-xl border-[#E8ECF4] focus:border-[#16A34A] focus:ring-[#16A34A]/10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold text-[#1A1D23]">Email</Label>
                  <Input type="email" {...register('email')} className="rounded-xl border-[#E8ECF4] focus:border-[#16A34A] focus:ring-[#16A34A]/10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold text-[#1A1D23]">Institution</Label>
                <Input {...register('institution')} disabled className="rounded-xl bg-[#F4F7FC] border-[#E8ECF4] text-[#9CA3AF]" />
                <p className="text-[12px] text-[#9CA3AF]">You are enrolled at this institution.</p>
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#DCFCE7] border border-[#BBF7D0] px-3 py-1 text-[12px] font-semibold text-[#16A34A]">Student</span>
                  <span className="text-[12px] text-[#9CA3AF]">· Exam access within your institution</span>
                </div>
                <Button type="submit" size="sm" className="gap-1.5 rounded-xl bg-[#16A34A] hover:bg-[#15803D]">
                  {saved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save Changes'}
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
            <div className="h-20" style={{ background: 'linear-gradient(135deg, #16A34A 0%, #059669 100%)' }} />
            <div className="px-5 pb-5">
              <div className="-mt-8 mb-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-4 border-white bg-[#16A34A] text-[20px] font-extrabold text-white shadow-md">
                  {initials}
                </div>
              </div>
              <p className="text-[16px] font-bold text-[#1A1D23]">{currentUser?.name ?? 'Student'}</p>
              <p className="text-[13px] text-[#9CA3AF]">{currentUser?.email ?? ''}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="rounded-full bg-[#DCFCE7] border border-[#BBF7D0] px-2.5 py-0.5 text-[11px] font-semibold text-[#16A34A]">Student</span>
                <span className="text-[11px] text-[#9CA3AF]">University of Technology</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#F4F7FC] p-3">
                {[
                  { label: 'Exams', value: '12', icon: FileText, color: '#1E88E5' },
                  { label: 'Avg',   value: '84%', icon: GraduationCap, color: '#7C3AED' },
                  { label: 'Trust', value: '98',  icon: ShieldCheck, color: '#16A34A' },
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
                    <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-[#16A34A] transition-colors after:absolute after:start-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 after:content-['']" />
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
