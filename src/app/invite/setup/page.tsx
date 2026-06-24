'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CurrentUser } from '@/types';

const schema = z.object({
  name: z.string().min(2, 'Full name is required (at least 2 characters)'),
});
type FormData = z.infer<typeof schema>;

function persistSession(user: CurrentUser) {
  localStorage.setItem('exam_user', JSON.stringify(user));
  document.cookie = `exam_role=${user.role}; path=/; max-age=86400`;
}

export default function InviteSetupPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setError('');

    // Update display name via API
    const res = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name }),
    });

    if (!res.ok) {
      setError('Failed to save your name. Please try again.');
      return;
    }

    const user = (await res.json()) as CurrentUser;
    persistSession(user);
    router.push(`/${user.role}`);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-xl bg-blue-600 items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">E</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ExamPro</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Welcome to ExamPro</h2>
            <p className="text-sm text-gray-500 mt-1">
              Your account is ready. Just tell us your name to finish setup.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Full Name</Label>
              <Input
                id="name"
                placeholder="Dr. John Smith"
                autoFocus
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-red-500">{errors.name.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Continue to Dashboard'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
