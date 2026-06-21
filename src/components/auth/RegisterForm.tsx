'use client';
import { useForm } from 'react-hook-form';

type NewAdmin = { id: string; name: string; email: string; role: 'admin'; institutionId: string };
function persistAdminSession(user: NewAdmin) {
  localStorage.setItem('exam_user', JSON.stringify(user));
  document.cookie = 'exam_role=admin; path=/; max-age=86400';
}
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

export function RegisterForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  function onSubmit(data: FormData) {
    persistAdminSession({
      id: 'admin-new',
      name: data.adminName,
      email: data.email,
      role: 'admin',
      institutionId: 'inst-new',
    });
    router.push('/admin');
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
