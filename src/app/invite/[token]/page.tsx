'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';

type InviteInfo = {
  email: string;
  role: 'teacher' | 'student';
  institutionName: string;
  expiresAt: string;
  acceptedAt: string | null;
};

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite]   = useState<InviteInfo | null>(null);
  const [status, setStatus]   = useState<'loading' | 'valid' | 'invalid' | 'expired' | 'used'>('loading');

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

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Validating invite…</p>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border p-8 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-semibold">Invalid Invite Link</h2>
          <p className="text-sm text-muted-foreground">This link is not valid. Please ask your administrator to resend the invitation.</p>
          <Button variant="outline" onClick={() => router.push('/login')}>Go to Login</Button>
        </div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border p-8 text-center space-y-4">
          <Clock className="h-10 w-10 text-amber-500 mx-auto" />
          <h2 className="text-lg font-semibold">Invite Expired</h2>
          <p className="text-sm text-muted-foreground">This invitation expired on {new Date(invite!.expiresAt).toLocaleDateString()}. Please request a new invite.</p>
          <Button variant="outline" onClick={() => router.push('/login')}>Go to Login</Button>
        </div>
      </div>
    );
  }

  if (status === 'used') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border p-8 text-center space-y-4">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <h2 className="text-lg font-semibold">Invite Already Accepted</h2>
          <p className="text-sm text-muted-foreground">This invitation was already used. Sign in to access your account.</p>
          <Button onClick={() => router.push('/login')}>Go to Login</Button>
        </div>
      </div>
    );
  }

  // Valid invite — show info and redirect to login (account was already created via Supabase email)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-xl bg-blue-600 items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">E</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ExamPro</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">You&apos;ve been invited</h2>
            <p className="text-sm text-gray-500 mt-1">
              Check your email for the sign-in link sent to <strong>{invite?.email}</strong>.
            </p>
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Institution</span>
              <span className="font-medium text-gray-900">{invite?.institutionName}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Role</span>
              <Badge variant="info" className="capitalize">{invite?.role}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-900">{invite?.email}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Expires</span>
              <span className="text-gray-900">{new Date(invite!.expiresAt).toLocaleDateString()}</span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Click the link in your email to activate your account. The link expires in 7 days.
          </p>

          <Button variant="outline" className="w-full" onClick={() => router.push('/login')}>
            Already have an account? Sign in
          </Button>
        </div>
      </div>
    </div>
  );
}
