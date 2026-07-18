'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Clock, CheckCircle2, Loader2, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type InviteInfo = {
  email: string;
  role: 'teacher' | 'student';
  institutionName: string;
  expiresAt: string;
  acceptedAt: string | null;
};

const schema = z.object({
  name: z.string().min(2, 'Full name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
type FormData = z.infer<typeof schema>;

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'used'>('loading');
  const [submitError, setSubmitError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    fetch(`/api/invites/token/${token}`)
      .then(async res => {
        if (!res.ok) { setStatus('invalid'); return; }
        const data = await res.json() as InviteInfo;
        if (data.acceptedAt) { setStatus('used'); setInvite(data); return; }
        if (new Date(data.expiresAt) < new Date()) { setStatus('expired'); setInvite(data); return; }
        setInvite(data);
        setStatus('valid');
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  async function onSubmit(data: FormData) {
    setSubmitError('');
    const res = await fetch(`/api/invites/accept/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name, password: data.password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setSubmitError(body.error ?? 'Something went wrong. Please try again.');
      return;
    }

    const { email, role } = await res.json() as { email: string; role: string };

    const supabase = createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: data.password });
    if (signInErr) {
      setSubmitError('Account created but sign-in failed. Please go to login and sign in manually.');
      return;
    }

    document.cookie = `exam_role=${role}; path=/; max-age=86400`;
    router.push(`/${role}`);
    router.refresh();
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col items-center justify-center gap-3 p-4">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <p className="text-muted-foreground text-sm">Validating invite…</p>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Invalid Invite Link</h2>
          <p className="text-sm text-muted-foreground">This link is not valid. Please ask your administrator to resend the invitation.</p>
          <Button variant="outline" onClick={() => router.push('/login')}>Go to Login</Button>
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            <Clock className="h-8 w-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Invite Expired</h2>
          <p className="text-sm text-muted-foreground">This invitation expired on {new Date(invite!.expiresAt).toLocaleDateString()}. Please request a new invite.</p>
          <Button variant="outline" onClick={() => router.push('/login')}>Go to Login</Button>
        </div>
      </div>
    );
  }

  if (status === 'used') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center space-y-4">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Invite Already Accepted</h2>
          <p className="text-sm text-muted-foreground">This invitation was already used. Sign in to access your account.</p>
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-xl bg-blue-600 items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">E</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Evalix</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Complete your account</h2>
            <p className="text-sm text-gray-500 mt-1">
              You&apos;ve been invited as a <strong className="capitalize">{invite?.role}</strong> at <strong>{invite?.institutionName}</strong>.
            </p>
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 flex items-center justify-between text-sm">
            <span className="text-gray-500 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Signing up as
            </span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{invite?.email}</span>
              <Badge variant="info" className="capitalize">{invite?.role}</Badge>
            </div>
          </div>

          {submitError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" placeholder="Your full name" autoFocus {...register('name')} />
              {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput id="password" placeholder="At least 8 characters" {...register('password')} />
              {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <PasswordInput id="confirmPassword" placeholder="Repeat your password" {...register('confirmPassword')} />
              {errors.confirmPassword && <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {isSubmitting ? 'Setting up…' : 'Accept Invitation'}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground">
            Invitation expires {new Date(invite!.expiresAt).toLocaleDateString()}.
          </p>
        </div>
      </div>
    </div>
  );
}
