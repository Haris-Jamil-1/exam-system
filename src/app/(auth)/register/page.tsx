import Link from 'next/link';
import { RegisterForm } from '@/components/auth/RegisterForm';

export const metadata = { title: 'Register — ExamPro' };

export default function RegisterPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Create institution account</h2>
        <p className="text-sm text-gray-500 mt-1">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}
