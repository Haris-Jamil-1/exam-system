'use client';
import { useEffect } from 'react';
import { useProctoringStore } from '@/store/proctoringStore';
import { AlertTriangle, X } from 'lucide-react';

export function ViolationAlert() {
  const { isWarningVisible, violationCount, dismissWarning } = useProctoringStore();

  useEffect(() => {
    if (isWarningVisible) {
      const id = setTimeout(dismissWarning, 4000);
      return () => clearTimeout(id);
    }
  }, [isWarningVisible, dismissWarning]);

  if (!isWarningVisible) return null;

  return (
    <div className="fixed top-4 start-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-2">
      <div className="bg-red-600 text-white rounded-xl shadow-2xl px-6 py-4 flex items-center gap-4 max-w-sm">
        <AlertTriangle className="h-6 w-6 shrink-0" />
        <div>
          <p className="font-semibold text-sm">Proctoring Violation</p>
          <p className="text-xs text-red-200 mt-0.5">
            Warning {violationCount}: Please stay focused on the exam window.
          </p>
        </div>
        <button
          onClick={dismissWarning}
          className="ms-auto text-red-200 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
