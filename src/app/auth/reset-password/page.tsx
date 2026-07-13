import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata = { title: 'Set New Password — ExamPro' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // No active recovery session and no explicit error param still reads as "expired" — there is
  // no valid state in which this page has anything useful to do without one.
  const expired = error === 'expired' || !user;

  if (expired) {
    return (
      <div className="text-center space-y-4">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
        <h2 className="text-xl font-semibold text-gray-900">Link expired or invalid</h2>
        <p className="text-sm text-gray-500">
          This password reset link has expired or was already used. Request a new one to continue.
        </p>
        <Link
          href="/auth/forgot-password"
          className="inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Set a new password</h2>
        <p className="text-sm text-gray-500 mt-1">
          Choose a new password for your account.
        </p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
