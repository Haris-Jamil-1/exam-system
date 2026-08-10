import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, Cairo } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { DirectionProvider } from '@radix-ui/react-direction';
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
  title: 'Evalix — AI-Powered Exam Proctoring',
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
          {/* Radix primitives (Tabs, Select, ...) default their own internal `dir` to "ltr"
              regardless of the document's actual direction, via @radix-ui/react-direction's
              useDirection() — they do NOT inherit from html[dir]. Without this provider, every
              Radix component silently renders/behaves LTR under an Arabic UI (this is what broke
              tab order and Select's internal layout, not a Tailwind/logical-property issue).
              package.json pins @radix-ui/react-direction to the exact version several Radix
              packages themselves depend on (1.1.2, not our own installed range) — several of
              them declare that exact pin rather than a caret range, so without the override npm
              installs a second, separate copy nested under each of those packages; this
              provider's context then never reaches their internal useDirection() calls, since
              they're reading from a different module instance/Context object entirely. */}
          <DirectionProvider dir={dir}>
            {children}
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
