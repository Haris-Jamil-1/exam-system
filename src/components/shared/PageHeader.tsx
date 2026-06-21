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

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
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
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
