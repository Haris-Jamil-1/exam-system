'use client';
import { useLocale } from 'next-intl';

export function LanguageToggle() {
  const locale = useLocale();

  function setLocale(next: 'en' | 'ar') {
    if (next === locale) return;
    document.cookie = `locale=${next}; path=/; max-age=31536000`;
    // Full reload ensures html[dir], fonts, and all translations re-render cleanly.
    window.location.reload();
  }

  return (
    <div className="flex items-center rounded-xl border border-[#E8ECF4] bg-white p-0.5">
      <button
        onClick={() => setLocale('en')}
        className={`rounded-lg px-2.5 py-1.5 text-[13px] font-bold transition-colors ${
          locale === 'en' ? 'bg-[#1E88E5] text-white' : 'text-[#6B7280] hover:text-[#1A1D23]'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLocale('ar')}
        className={`rounded-lg px-2.5 py-1.5 text-[15px] font-bold leading-none transition-colors ${
          locale === 'ar' ? 'bg-[#1E88E5] text-white' : 'text-[#6B7280] hover:text-[#1A1D23]'
        }`}
        aria-label="العربية"
      >
        ع
      </button>
    </div>
  );
}
