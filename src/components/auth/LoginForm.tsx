'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CurrentUser } from '@/types';

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

// Defined outside component — React Compiler immutability rule
function persistSession(user: CurrentUser) {
  localStorage.setItem('exam_user', JSON.stringify(user));
  document.cookie = `exam_role=${user.role}; path=/; max-age=86400`;
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    setValue,
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

    // Fetch Prisma User record to populate localStorage
    const res = await fetch('/api/users/me');
    if (!res.ok) {
      setError('Account not found. Contact your administrator.');
      await supabase.auth.signOut();
      return;
    }

    const user = (await res.json()) as CurrentUser;
    persistSession(user);
    router.push(`/${user.role}`);
    router.refresh();
  }

  async function loginAsDemo(role: 'admin' | 'teacher' | 'student') {
    const emails: Record<string, string> = {
      admin:   'admin@demo.exampro.com',
      teacher: 'teacher@demo.exampro.com',
      student: 'student@demo.exampro.com',
    };
    setValue('email', emails[role]);
    setValue('password', 'Demo@1234');
    await handleSubmit(onSubmit)();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            {...register('email')}
          />
          {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            {...register('password')}
          />
          {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs text-gray-400">
          <span className="bg-white px-2">Quick demo access</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" onClick={() => loginAsDemo('teacher')} className="text-xs">
          Login as Teacher
        </Button>
        <Button variant="outline" size="sm" onClick={() => loginAsDemo('student')} className="text-xs">
          Login as Student
        </Button>
        <Button variant="outline" size="sm" onClick={() => loginAsDemo('admin')} className="text-xs">
          Login as Admin
        </Button>
      </div>
    </div>
  );
}
