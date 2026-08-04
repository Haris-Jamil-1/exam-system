'use client';
import { useLocale } from 'next-intl';

interface PageHeaderProps {
  en: string;
  ar: string;
  subEn?: string;
  subAr?: string;
  action?: React.ReactNode;
}

export function PageHeader({ en, ar, subEn, subAr, action }: PageHeaderProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';

  const mainTitle = isAr ? ar : en;
  const secondaryTitle = isAr ? en : ar;
  const mainSub = isAr ? subAr : subEn;
  const secondarySub = isAr ? subEn : subAr;

  // Stacks below `sm`. The action slot is often a row of several buttons (the item-bank page
  // passes four plus a badge, ~750px), and as a non-shrinking sibling of the title it forced
  // page-level horizontal overflow on phones. Stacking plus `min-w-0` on the title lets that row
  // wrap instead. Layout at `sm` and above is unchanged.
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1
            className="text-[22px] font-extrabold tracking-[-0.01em] text-[#1A1D23]"
            dir={isAr ? 'rtl' : 'ltr'}
            lang={isAr ? 'ar' : 'en'}
          >
            {mainTitle}
          </h1>
          <span
            className="text-[18px] font-bold text-[#9CA3AF]"
            dir={isAr ? 'ltr' : 'rtl'}
            lang={isAr ? 'en' : 'ar'}
          >
            {secondaryTitle}
          </span>
        </div>
        {(mainSub || secondarySub) && (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {mainSub && (
              <p
                className="text-[13px] text-[#6B7280]"
                dir={isAr ? 'rtl' : 'ltr'}
              >
                {mainSub}
              </p>
            )}
            {secondarySub && (
              <p
                className="text-[12px] text-[#B0BAC9]"
                dir={isAr ? 'ltr' : 'rtl'}
              >
                {secondarySub}
              </p>
            )}
          </div>
        )}
      </div>
      {action && <div className="shrink-0 max-w-full">{action}</div>}
    </div>
  );
}
