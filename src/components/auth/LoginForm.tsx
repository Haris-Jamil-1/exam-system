'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CurrentUser, Role } from '@/types';

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

const demoUsers: Record<string, CurrentUser> = {
  teacher: {
    id: 'teacher-1',
    name: 'Dr. Sarah Mitchell',
    email: 'sarah.mitchell@university.edu',
    role: 'teacher',
    institutionId: 'inst-1',
  },
  student: {
    id: 'student-1',
    name: 'Alex Thompson',
    email: 'alex.thompson@student.edu',
    role: 'student',
    institutionId: 'inst-1',
  },
  admin: {
    id: 'admin-1',
    name: 'Dr. Ahmad Hassan',
    email: 'ahmad.hassan@university.edu',
    role: 'admin',
    institutionId: 'inst-1',
  },
};

function loginAs(role: Role, router: ReturnType<typeof useRouter>) {
  const user = demoUsers[role];
  localStorage.setItem('exam_user', JSON.stringify(user));
  document.cookie = `exam_role=${role}; path=/; max-age=86400`;
  router.push(`/${role}`);
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  function onSubmit(data: FormData) {
    setError('');
    const match = Object.values(demoUsers).find(u => u.email === data.email);
    if (match && data.password.length >= 6) {
      loginAs(match.role as Role, router);
    } else {
      setError('Invalid credentials. Use the demo buttons below to get started.');
    }
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
        <Button variant="outline" size="sm" onClick={() => loginAs('teacher', router)} className="text-xs">
          Login as Teacher
        </Button>
        <Button variant="outline" size="sm" onClick={() => loginAs('student', router)} className="text-xs">
          Login as Student
        </Button>
        <Button variant="outline" size="sm" onClick={() => loginAs('admin', router)} className="text-xs">
          Login as Admin
        </Button>
      </div>
    </div>
  );
}
