'use client';
// Dedicated sign-in for the platform Super Admin panel (/super) — deliberately
// separate from the institution-scoped LoginForm (teacher/student/admin all
// share that one; this one is for platform-level access only).
//
// This form only authenticates — it has no notion of role or isSuperAdmin at
// all, and never should: the actual authorization decision is made server-side
// by src/app/super/page.tsx (via getAuthUser()'s User.isSuperAdmin flag) on the
// next render, not here. A successful sign-in with any valid Supabase account
// just reloads /super; if that account isn't a super admin, the page itself
// shows an access-denied message instead of the panel.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

export function SuperLoginForm() {
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setError('');
    const supabase = createClient();

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      setError(authError.message);
      return;
    }

    // Hard navigation (not router.push/refresh) so the request round-trips through
    // middleware + a fresh server render of page.tsx, which is what actually decides
    // whether this session gets the panel or an access-denied message.
    window.location.assign('/super');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-gray-800 bg-gray-900 p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <h1 className="text-lg font-semibold text-white">Super Admin Access</h1>
          <p className="text-sm text-gray-400">Platform-level sign-in — not for institution accounts.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-300">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="border-gray-700 bg-gray-800 text-white placeholder:text-gray-500"
              {...register('email')}
            />
            {errors.email && <p className="text-sm text-red-400">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-300">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              className="border-gray-700 bg-gray-800 text-white placeholder:text-gray-500"
              {...register('password')}
            />
            {errors.password && <p className="text-sm text-red-400">{errors.password.message}</p>}
          </div>

          {error && (
            <div className="rounded-md border border-red-900 bg-red-950 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full bg-red-600 hover:bg-red-700" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}
