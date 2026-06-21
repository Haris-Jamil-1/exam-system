'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

const schema = z
  .object({
    name: z.string().min(2, 'Name is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine(d => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function InvitePage() {
  const router = useRouter();
  // In Phase 2: decode token to get institution + role
  const mockInvite = { institution: 'State University', role: 'teacher', email: 'newteacher@university.edu' };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  function onSubmit(data: FormData) {
    const user = {
      id: 'teacher-new',
      name: data.name,
      email: mockInvite.email,
      role: mockInvite.role as 'teacher',
      institutionId: 'inst-1',
    };
    localStorage.setItem('exam_user', JSON.stringify(user));
    router.push('/teacher');
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
            <h2 className="text-xl font-semibold text-gray-900">Accept Invitation</h2>
            <p className="text-sm text-gray-500 mt-1">Complete your account setup</p>
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 mb-6 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Institution</span>
              <span className="font-medium text-gray-900">{mockInvite.institution}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Role</span>
              <Badge variant="info" className="capitalize">{mockInvite.role}</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Email</span>
              <span className="font-medium text-gray-900">{mockInvite.email}</span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your Full Name</Label>
              <Input id="name" placeholder="Dr. John Smith" {...register('name')} />
              {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Set Password</Label>
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
              {isSubmitting ? 'Setting up...' : 'Complete Registration'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
