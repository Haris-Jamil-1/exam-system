import type { ReactNode } from 'react';

// Chrome for /auth/forgot-password and /auth/reset-password — mirrors src/app/(auth)/layout.tsx.
// Harmless for /auth/callback, which is a route handler with no rendered UI.
export default function AuthPagesLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 rounded-xl bg-blue-600 items-center justify-center mb-4">
            <span className="text-white font-bold text-xl">E</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">ExamPro</h1>
          <p className="text-sm text-gray-500 mt-1">AI-Powered Exam Proctoring Platform</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
