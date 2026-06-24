'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import type { CurrentUser } from '@/types';

const schema = z
  .object({
    institutionName: z.string().min(2, 'Institution name is required'),
    adminName: z.string().min(2, 'Name is required'),
    email: z.string().email('Invalid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine(d => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

function persistAdminSession(user: CurrentUser) {
  localStorage.setItem('exam_user', JSON.stringify(user));
  document.cookie = 'exam_role=admin; path=/; max-age=86400';
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setError('');

    // Create institution + Supabase user + Prisma user via server API
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        institutionName: data.institutionName,
        adminName: data.adminName,
        email: data.email,
        password: data.password,
      }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? 'Registration failed. Please try again.');
      return;
    }

    const user = (await res.json()) as CurrentUser;

    // Sign in via browser client to establish the session cookie
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      setError(authError.message);
      return;
    }

    persistAdminSession(user);
    router.push('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="institutionName">Institution Name</Label>
        <Input
          id="institutionName"
          placeholder="State University"
          {...register('institutionName')}
        />
        {errors.institutionName && (
          <p className="text-sm text-red-500">{errors.institutionName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="adminName">Your Full Name</Label>
        <Input id="adminName" placeholder="Dr. Jane Smith" {...register('adminName')} />
        {errors.adminName && <p className="text-sm text-red-500">{errors.adminName.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Work Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="admin@university.edu"
          {...register('email')}
        />
        {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
        {errors.password && <p className="text-sm text-red-500">{errors.password.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="••••••••"
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account...' : 'Create Account'}
      </Button>
    </form>
  );
}
