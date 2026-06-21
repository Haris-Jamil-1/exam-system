import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Cairo } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { DesktopGuard } from '@/components/shared/DesktopGuard';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
});

const cairo = Cairo({
  subsets: ['arabic'],
  variable: '--font-cairo',
});

export const metadata: Metadata = {
  title: 'ExamPro — AI-Powered Exam Proctoring',
  description: 'AI-powered exam proctoring platform for universities, institutes and certification bodies',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body className={`${plusJakarta.variable} ${cairo.variable} font-sans antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <DesktopGuard>
            {children}
          </DesktopGuard>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
