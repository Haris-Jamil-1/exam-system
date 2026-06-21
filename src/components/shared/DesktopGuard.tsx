'use client';
import { useState, useEffect } from 'react';
import { Monitor } from 'lucide-react';

function detectMobileOrTablet(): boolean {
  const ua = navigator.userAgent;
  const mobileUA = /android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua);
  const tabletUA = /ipad|tablet|(android(?!.*mobile))/i.test(ua);
  const narrowAndTouch = navigator.maxTouchPoints > 1 && window.innerWidth < 1024;
  return mobileUA || tabletUA || narrowAndTouch;
}

export function DesktopGuard({ children }: { children: React.ReactNode }) {
  // null = SSR / not yet determined; false = desktop OK; true = blocked
  const [blocked, setBlocked] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    return detectMobileOrTablet();
  });

  // Only add resize listener — no direct setState in effect body
  useEffect(() => {
    function onResize() { setBlocked(detectMobileOrTablet()); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // SSR or first paint — render nothing to avoid hydration mismatch
  if (blocked === null) return null;

  if (blocked) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#F4F7FC] p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#1E88E5]/10 mb-6">
          <Monitor className="h-10 w-10 text-[#1E88E5]" />
        </div>
        <h1 className="text-2xl font-bold text-[#1A1D23] mb-3">Desktop Required</h1>
        <p className="text-[15px] text-[#6B7280] max-w-xs leading-relaxed">
          This exam platform can only be accessed on a <strong>desktop or laptop</strong> computer.
          Please switch to a desktop browser to continue.
        </p>
        <div className="mt-8 rounded-xl border border-[#E8ECF4] bg-white p-4 max-w-xs w-full text-[13px] text-[#6B7280]">
          <p className="font-semibold text-[#1A1D23] mb-2">Why desktop only?</p>
          <ul className="space-y-1 text-start list-disc ps-4">
            <li>Proctoring requires webcam + microphone</li>
            <li>Fullscreen mode is enforced during exams</li>
            <li>Screen size needed for question navigation</li>
          </ul>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
