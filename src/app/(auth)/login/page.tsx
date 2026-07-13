import Link from 'next/link';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = { title: 'Sign In — ExamPro' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Sign in to your account</h2>
        <p className="text-sm text-gray-500 mt-1">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-blue-600 hover:underline font-medium">
            Register your institution
          </Link>
        </p>
      </div>
      {reset === 'success' && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          Your password has been updated. Sign in with your new password.
        </div>
      )}
      <LoginForm />
      <p className="text-sm text-gray-500 mt-4 text-center">
        <Link href="/auth/forgot-password" className="text-blue-600 hover:underline font-medium">
          Forgot your password?
        </Link>
      </p>
    </div>
  );
}
