'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Clock, CheckCircle2, LogIn, Loader2, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type InviteInfo = {
  email: string;
  className: string;
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: string;
  acceptedAt: string | null;
  accountExists: boolean;
};

type Status = 'loading' | 'invalid' | 'expired' | 'used' | 'needs_login' | 'signup' | 'enrolled' | 'error';

const schema = z.object({
  name: z.string().min(2, 'Full name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
type FormData = z.infer<typeof schema>;

// Defined outside the component — React Compiler immutability rule (see LoginForm.tsx's
// persistSession for the same pattern).
function persistStudentRoleCookie() {
  document.cookie = `exam_role=student; path=/; max-age=86400`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-xl bg-blue-600 items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">E</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ExamPro</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">{children}</div>;
}

function IconBadge({ icon: Icon, tone }: { icon: React.ComponentType<{ className?: string }>; tone: 'red' | 'amber' | 'emerald' | 'blue' }) {
  const bg = { red: 'bg-red-50', amber: 'bg-amber-50', emerald: 'bg-emerald-50', blue: 'bg-blue-50' }[tone];
  const fg = { red: 'text-red-500', amber: 'text-amber-500', emerald: 'text-emerald-500', blue: 'text-blue-500' }[tone];
  return (
    <div className={`inline-flex h-16 w-16 items-center justify-center rounded-full ${bg}`}>
      <Icon className={`h-8 w-8 ${fg}`} />
    </div>
  );
}

export default function ClassJoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [submitError, setSubmitError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const tryAutoAccept = useCallback(async () => {
    const res = await fetch(`/api/class-invites/accept/${token}`, { method: 'POST' });
    if (res.status === 401) { setStatus('needs_login'); return; }
    if (res.ok) { setStatus('enrolled'); return; }
    setStatus('error');
  }, [token]);

  useEffect(() => {
    fetch(`/api/class-invites/token/${token}`)
      .then(async res => {
        if (!res.ok) { setStatus('invalid'); return; }
        const data = await res.json() as InviteInfo;
        setInvite(data);
        if (data.status === 'accepted') { setStatus('used'); return; }
        if (data.status === 'expired') { setStatus('expired'); return; }
        if (data.accountExists) { await tryAutoAccept(); return; }
        setStatus('signup');
      })
      .catch(() => setStatus('invalid'));
  }, [token, tryAutoAccept]);

  async function onSubmit(data: FormData) {
    setSubmitError('');
    const res = await fetch(`/api/class-invites/accept/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name, password: data.password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setSubmitError(body.error ?? 'Something went wrong. Please try again.');
      return;
    }

    const { email } = await res.json() as { email: string };
    const supabase = createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: data.password });
    if (signInErr) {
      setSubmitError('Account created but sign-in failed. Please go to login and sign in manually.');
      return;
    }

    persistStudentRoleCookie();
    router.push('/student');
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

  if (status === 'invalid' || status === 'error') {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-4">
            <IconBadge icon={AlertTriangle} tone="red" />
            <h2 className="text-lg font-semibold text-gray-900">Invalid Invite Link</h2>
            <p className="text-sm text-muted-foreground">This link is not valid. Please ask your teacher to resend the invitation.</p>
            <Button variant="outline" onClick={() => router.push('/login')}>Go to Login</Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (status === 'expired') {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-4">
            <IconBadge icon={Clock} tone="amber" />
            <h2 className="text-lg font-semibold text-gray-900">Invite Expired</h2>
            <p className="text-sm text-muted-foreground">This invitation expired on {new Date(invite!.expiresAt).toLocaleDateString()}. Please ask your teacher for a new invite.</p>
            <Button variant="outline" onClick={() => router.push('/login')}>Go to Login</Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (status === 'used' || status === 'enrolled') {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-4">
            <IconBadge icon={CheckCircle2} tone="emerald" />
            <h2 className="text-lg font-semibold text-gray-900">
              {status === 'enrolled' ? `You've joined ${invite?.className ?? 'the class'}` : 'Invite Already Accepted'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {status === 'enrolled' ? 'Head to your dashboard to see it.' : 'This invitation was already used. Sign in to access your account.'}
            </p>
            <Button onClick={() => router.push('/student')}>Go to Dashboard</Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (status === 'needs_login') {
    return (
      <Shell>
        <Card>
          <div className="text-center space-y-4">
            <IconBadge icon={LogIn} tone="blue" />
            <h2 className="text-lg font-semibold text-gray-900">Sign in to join</h2>
            <p className="text-sm text-muted-foreground">
              Sign in as <strong>{invite?.email}</strong> to join <strong>{invite?.className}</strong>.
            </p>
            <Button onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/classes/join/${token}`)}`)}>
              Sign In
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  // status === 'signup' — brand-new student, no account yet
  return (
    <Shell>
      <Card>
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Complete your account</h2>
            <p className="text-sm text-gray-500 mt-1">
              You&apos;ve been invited to join <strong>{invite?.className}</strong> on ExamPro.
            </p>
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 flex items-center justify-between text-sm">
            <span className="text-gray-500 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Signing up as
            </span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{invite?.email}</span>
              <Badge variant="info">Student</Badge>
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
              {isSubmitting ? 'Joining…' : 'Join Class'}
            </Button>
          </form>
        </div>
      </Card>
    </Shell>
  );
}
