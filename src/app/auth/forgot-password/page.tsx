import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata = { title: 'Forgot Password — ExamPro' };

export default function ForgotPasswordPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Reset your password</h2>
        <p className="text-sm text-gray-500 mt-1">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-sm text-gray-500 mt-6 text-center">
        <Link href="/login" className="text-blue-600 hover:underline font-medium">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
