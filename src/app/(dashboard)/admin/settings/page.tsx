'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Check, Building2 } from 'lucide-react';

export default function AdminSettingsPage() {
  const currentUser = useCurrentUser();
  const [saved, setSaved] = useState(false);
  const [notifications, setNotifications] = useState({
    examApprovals:   true,
    teacherInvites:  true,
    violationAlerts: true,
    weeklyReport:    true,
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

  const notifItems = [
    { key: 'examApprovals',   label: 'Exam approval requests',   desc: 'Notify when a teacher submits an exam for your review' },
    { key: 'teacherInvites',  label: 'Teacher invite accepted',  desc: 'Notify when an invited teacher joins the institution' },
    { key: 'violationAlerts', label: 'High-severity violations', desc: 'Instant alert for critical proctoring events during live exams' },
    { key: 'weeklyReport',    label: 'Weekly institution report', desc: 'Summary of exam activity and trust scores every Monday' },
  ];

  return (
    <div className="mx-auto max-w-[640px] space-y-6 p-6">
      {/* Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDE9FE]">
              <Building2 className="h-5 w-5 text-[#7C3AED]" strokeWidth={2} />
            </div>
            <CardTitle>Profile Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input {...register('name')} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" {...register('email')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Institution</Label>
              <Input {...register('institution')} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">Institution name is managed at the platform level.</p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <div className="flex items-center gap-2">
                <Badge variant="info">Institution Admin</Badge>
                <span className="text-xs text-muted-foreground">· Full access within your institution</span>
              </div>
            </div>
            <Button type="submit" className="gap-2 bg-[#7C3AED] hover:bg-[#6D28D9]">
              {saved ? <><Check className="h-4 w-4" /> Saved!</> : 'Save Changes'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      {/* Notifications */}
      <Card>
        <CardHeader><CardTitle>Notification Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {notifItems.map(n => (
            <div key={n.key} className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{n.label}</p>
                <p className="text-xs text-muted-foreground">{n.desc}</p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={notifications[n.key as keyof typeof notifications]}
                  onChange={e => setNotifications(prev => ({ ...prev, [n.key]: e.target.checked }))}
                  className="sr-only peer"
                />
                <div className="h-5 w-9 rounded-full bg-gray-200 peer-checked:bg-[#7C3AED] transition-colors after:absolute after:start-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 after:content-['']" />
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />

      {/* Security */}
      <Card>
        <CardHeader><CardTitle>Security</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Current Password</Label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label>New Password</Label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <div className="space-y-2">
            <Label>Confirm New Password</Label>
            <Input type="password" placeholder="••••••••" />
          </div>
          <Button variant="outline">Change Password</Button>
        </CardContent>
      </Card>
    </div>
  );
}
