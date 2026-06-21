import Link from 'next/link';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = { title: 'Sign In — ExamPro' };

export default function LoginPage() {
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
      <LoginForm />
    </div>
  );
}
