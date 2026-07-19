'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import {
  ShieldCheck, ArrowRight, Check, Menu, X, ChevronDown,
  ScanFace, Sparkles, BarChart3, Radio, Layers, Zap,
  Clock, Camera, Lock as LockIcon, Eye,
} from 'lucide-react';

const BRAND = {
  900: '#0D47A1',
  800: '#125EA8',
  700: '#1E88E5',
  600: '#1976D2',
  500: '#42A5F5',
  100: '#E3F0FD',
  50: '#F4F7FC',
};

const navLinks = [
  { key: 'features', href: '#features' },
  { key: 'howItWorks', href: '#how-it-works' },
] as const;

const iconStripKeys = [
  { key: 'aiProctoring', icon: ScanFace },
  { key: 'autoQuestionGeneration', icon: Sparkles },
  { key: 'realTimeMonitoring', icon: Radio },
  { key: 'advancedAnalytics', icon: BarChart3 },
] as const;

const featureKeys = [
  { key: 'aiProctoring', icon: ScanFace },
  { key: 'autoQuestionGeneration', icon: Sparkles },
  { key: 'realTimeMonitoring', icon: Radio },
  { key: 'advancedAnalytics', icon: BarChart3 },
  { key: 'instantResults', icon: Zap },
] as const;

const deepDiveKeys = [
  { key: 'questionGeneration', icon: Sparkles },
  { key: 'proctoring', icon: ScanFace },
  { key: 'monitoring', icon: Eye },
  { key: 'multiTenant', icon: Layers },
] as const;

const trustPointKeys = ['p1', 'p2', 'p3'] as const;
const stepKeys = ['s1', 's2', 's3'] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F4F7FC] font-sans text-[#1A1D23]">
      <FadeUpKeyframes />
      <Navbar />
      <main>
        <Hero />
        <Features />
        <DeepDive />
        <Trust />
        <HowItWorks />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}

function FadeUpKeyframes() {
  return (
    <style>{`
      @keyframes fadeUp {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .fade-up {
        opacity: 0;
        animation: fadeUp 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
    `}</style>
  );
}

function LanguageToggle() {
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  function setLocaleCookie(next: 'en' | 'ar') {
    setOpen(false);
    if (next === locale) return;
    document.cookie = `locale=${next}; path=/; max-age=31536000`;
    window.location.reload();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-full border border-[#E8ECF4] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#1A1D23] transition-colors hover:border-[#CBD5E1]"
      >
        <span aria-hidden>🇸🇦</span>
        {locale === 'ar' ? 'English' : 'العربية'}
        <ChevronDown className="h-3.5 w-3.5 text-[#6B7280]" />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-10 mt-2 w-40 overflow-hidden rounded-xl border border-[#E8ECF4] bg-white py-1 shadow-lg">
          <button
            onClick={() => setLocaleCookie('en')}
            className={`block w-full px-4 py-2 text-start text-[14px] font-medium hover:bg-[#F4F7FC] ${locale === 'en' ? 'text-[#1E88E5]' : 'text-[#1A1D23]'}`}
          >
            English
          </button>
          <button
            onClick={() => setLocaleCookie('ar')}
            className={`block w-full px-4 py-2 text-start text-[14px] font-medium hover:bg-[#F4F7FC] ${locale === 'ar' ? 'text-[#1E88E5]' : 'text-[#1A1D23]'}`}
          >
            العربية
          </button>
        </div>
      )}
    </div>
  );
}

function Navbar() {
  const t = useTranslations('landing');
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`sticky top-0 z-50 border-b bg-white transition-shadow duration-300 ${
      scrolled ? 'border-[#E8ECF4] shadow-[0_4px_20px_rgba(15,23,42,0.06)]' : 'border-[#E8ECF4] shadow-none'
    }`}>
      <div className="mx-auto flex h-[72px] max-w-[1180px] items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl shadow-sm" style={{ backgroundColor: BRAND[700] }}>
            <ShieldCheck className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-bold tracking-tight text-[#1A1D23]">Evalix</span>
        </Link>

        <div className="hidden items-center gap-9 md:flex">
          {navLinks.map(link => (
            <a key={link.key} href={link.href} className="text-[15px] font-medium text-[#6B7280] transition-colors duration-200 hover:text-[#1E88E5]">
              {t(`nav.${link.key}`)}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <LanguageToggle />
          <Link href="/login" className="text-[15px] font-medium text-[#6B7280] transition-colors duration-200 hover:text-[#1A1D23]">
            {t('nav.signIn')}
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md"
            style={{ backgroundColor: BRAND[700] }}
          >
            {t('nav.getStarted')} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-lg p-2 text-[#6B7280] transition-colors hover:bg-slate-100 hover:text-[#1A1D23] md:hidden"
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-[#E8ECF4] bg-white md:hidden">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-1 px-6 py-4">
            {navLinks.map(link => (
              <a
                key={link.key}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-[#6B7280] hover:bg-slate-50 hover:text-[#1A1D23]"
              >
                {t(`nav.${link.key}`)}
              </a>
            ))}
            <div className="mt-2 flex items-center justify-between px-3 py-2">
              <span className="text-[14px] text-[#6B7280]">{t('nav.language')}</span>
              <LanguageToggle />
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-[#E8ECF4] pt-4">
              <Link href="/login" className="rounded-lg px-3 py-2.5 text-center text-[15px] font-medium text-[#6B7280] hover:bg-slate-50">
                {t('nav.signIn')}
              </Link>
              <Link href="/register" className="rounded-full px-3 py-2.5 text-center text-[15px] font-semibold text-white" style={{ backgroundColor: BRAND[700] }}>
                {t('nav.getStartedFree')}
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function Hero() {
  const t = useTranslations('landing');

  return (
    <section className="overflow-hidden px-6 pb-[80px] pt-[72px]">
      <div className="mx-auto grid max-w-[1180px] items-center gap-16 lg:grid-cols-2">
        <div>
          <div
            className="fade-up inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
            style={{ backgroundColor: BRAND[100], color: BRAND[700] }}
          >
            {t('hero.eyebrow')}
          </div>

          <h1
            className="fade-up mt-5 max-w-[560px] text-[38px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[#1A1D23] sm:text-[46px] lg:text-[52px]"
            style={{ animationDelay: '0.08s' }}
          >
            {t.rich('hero.headline', {
              highlight: chunks => <span style={{ color: BRAND[700] }}>{chunks}</span>,
            })}
          </h1>

          <p
            className="fade-up mt-5 max-w-[480px] text-[17px] leading-[1.6] text-[#6B7280]"
            style={{ animationDelay: '0.16s' }}
          >
            {t('hero.subheading')}
          </p>

          <div
            className="fade-up mt-8 flex flex-col items-start gap-3 sm:flex-row"
            style={{ animationDelay: '0.24s' }}
          >
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-px hover:shadow-lg"
              style={{ backgroundColor: BRAND[700] }}
            >
              {t('hero.ctaPrimary')}
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-[#E8ECF4] bg-white px-7 py-3.5 text-[15px] font-semibold text-[#1A1D23] transition-all duration-200 hover:-translate-y-px hover:border-[#CBD5E1] hover:shadow-sm"
            >
              {t('hero.ctaSecondary')}
            </a>
          </div>

          <div
            className="fade-up mt-10 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4"
            style={{ animationDelay: '0.32s' }}
          >
            {iconStripKeys.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.key} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: BRAND[100] }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: BRAND[700] }} strokeWidth={2.25} />
                  </span>
                  <span className="text-[13px] font-medium leading-tight text-[#6B7280]">{t(`hero.iconStrip.${f.key}`)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <HeroMockup />
      </div>
    </section>
  );
}

function HeroMockup() {
  const t = useTranslations('landing');

  return (
    <div className="fade-up relative mx-auto w-full max-w-[480px]" style={{ animationDelay: '0.3s' }}>
      <div
        className="absolute -inset-10 -z-10 rounded-full opacity-70 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${BRAND[100]}, transparent)` }}
        aria-hidden
      />

      <div className="relative aspect-[928/964] overflow-hidden rounded-2xl border border-[#E8ECF4] bg-white shadow-[0_20px_50px_rgba(30,136,229,0.14)]">
        <Image
          src="/hero-proctoring.jpg"
          alt=""
          fill
          sizes="(max-width: 1024px) 90vw, 480px"
          className="object-cover"
          priority
        />
      </div>

      <div className="absolute -end-6 -top-6 w-[190px] rounded-xl border border-[#E8ECF4] bg-white p-3.5 shadow-[0_12px_28px_rgba(30,136,229,0.14)] sm:-end-10">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: BRAND[100] }}>
            <Camera className="h-4 w-4" style={{ color: BRAND[700] }} />
          </span>
          <div>
            <p className="text-[12.5px] font-semibold text-[#1A1D23]">{t('hero.mockup.liveProctoring')}</p>
            <p className="flex items-center gap-1 text-[11px] font-medium" style={{ color: BRAND[600] }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRAND[600] }} /> {t('hero.mockup.active')}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-[#6B7280]">{t('hero.mockup.faceDetected')}</p>
      </div>

      <div className="absolute -bottom-10 -start-4 w-[210px] rounded-xl border border-[#E8ECF4] bg-white p-3.5 shadow-[0_12px_28px_rgba(30,136,229,0.14)] sm:-start-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[#1A1D23]">
            <Clock className="h-3.5 w-3.5" style={{ color: BRAND[700] }} />
            <span className="text-[11.5px] font-medium text-[#6B7280]">{t('hero.mockup.timeRemaining')}</span>
          </div>
          <span className="font-mono text-[13px] font-bold text-[#1A1D23]" dir="ltr">48:12</span>
        </div>
        <div className="mt-2.5 space-y-1.5">
          {['identityVerified', 'fullscreenEnforced', 'monitoringActive'].map(item => (
            <div key={item} className="flex items-center gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: BRAND[100] }}>
                <Check className="h-2.5 w-2.5" style={{ color: BRAND[700] }} strokeWidth={3.5} />
              </span>
              <span className="text-[11.5px] text-[#374151]">{t(`hero.mockup.${item}`)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Features() {
  const t = useTranslations('landing');

  return (
    <section id="features" className="px-6 py-[80px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-14 max-w-[600px] text-center">
          <h2 className="text-[30px] font-bold tracking-[-0.01em] text-[#1A1D23] sm:text-[36px]">
            {t('features.heading')}
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-[#6B7280]">
            {t('features.subheading')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featureKeys.map(f => {
            const Icon = f.icon;
            return (
              <div
                key={f.key}
                className="group rounded-2xl border border-[#EBF0F8] bg-white p-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(15,23,42,0.10)]"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: BRAND[100] }}>
                  <Icon className="h-[22px] w-[22px]" style={{ color: BRAND[700] }} strokeWidth={2} />
                </div>
                <h3 className="mb-2 text-[17px] font-semibold text-[#1A1D23]">{t(`features.items.${f.key}.title`)}</h3>
                <p className="text-[14px] font-normal leading-[1.7] text-[#6B7280]">{t(`features.items.${f.key}.description`)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DeepDive() {
  const t = useTranslations('landing');

  return (
    <section className="px-6 py-[80px]" style={{ backgroundColor: BRAND[50] }}>
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-14 max-w-[600px] text-center">
          <h2 className="text-[30px] font-bold tracking-[-0.01em] text-[#1A1D23] sm:text-[36px]">
            {t('deepDive.heading')}
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-[#6B7280]">
            {t('deepDive.subheading')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {deepDiveKeys.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.key} className="flex gap-5 rounded-2xl border border-[#E8ECF4] bg-white p-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: BRAND[700] }}>
                  <Icon className="h-[22px] w-[22px] text-white" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="mb-2 text-[16.5px] font-semibold text-[#1A1D23]">{t(`deepDive.items.${f.key}.title`)}</h3>
                  <p className="text-[14px] font-normal leading-[1.7] text-[#6B7280]">{t(`deepDive.items.${f.key}.description`)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const t = useTranslations('landing');

  return (
    <section className="px-6 py-[72px]">
      <div className="mx-auto max-w-[880px] text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: BRAND[600] }}>
          {t('trust.eyebrow')}
        </p>
        <h2 className="mx-auto mt-3 max-w-[520px] text-[28px] font-bold tracking-[-0.01em] text-[#1A1D23] sm:text-[32px]">
          {t('trust.heading')}
        </h2>

        <div className="mt-10 grid gap-5 text-start sm:grid-cols-3">
          {trustPointKeys.map(key => (
            <div key={key} className="flex gap-3 rounded-2xl border border-[#EBF0F8] bg-white p-5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: BRAND[100] }}>
                <LockIcon className="h-3.5 w-3.5" style={{ color: BRAND[700] }} />
              </span>
              <p className="text-[13.5px] leading-[1.6] text-[#374151]">{t(`trust.points.${key}`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const t = useTranslations('landing');

  return (
    <section id="how-it-works" className="px-6 py-[80px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-14 max-w-[500px] text-center">
          <h2 className="text-[30px] font-bold tracking-[-0.01em] text-[#1A1D23]">{t('howItWorks.heading')}</h2>
          <p className="mt-4 text-[16px] text-[#6B7280]">{t('howItWorks.subheading')}</p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {stepKeys.map((key, i) => (
            <div key={key} className="rounded-2xl border border-[#EBF0F8] bg-white p-7 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div
                className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl text-[18px] font-extrabold text-white"
                style={{ backgroundColor: BRAND[700] }}
              >
                {i + 1}
              </div>
              <h3 className="mb-2 text-[16px] font-semibold text-[#1A1D23]">{t(`howItWorks.steps.${key}.title`)}</h3>
              <p className="text-[14px] leading-[1.7] text-[#6B7280]">{t(`howItWorks.steps.${key}.desc`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  const t = useTranslations('landing');

  return (
    <section className="px-6 pb-[80px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="rounded-2xl px-6 py-20 text-center" style={{ backgroundColor: BRAND[900] }}>
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-[14px] font-semibold text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            {t('cta.badge')}
          </div>
          <h2 className="mx-auto max-w-[600px] text-[32px] font-extrabold leading-[1.2] tracking-[-0.01em] text-white sm:text-[40px]">
            {t('cta.heading')}
          </h2>
          <p className="mx-auto mt-5 max-w-[520px] text-[17px] leading-[1.6] text-white/75">
            {t('cta.subheading')}
          </p>
          <Link
            href="/register"
            className="group mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-[15px] font-semibold shadow-lg transition-all duration-200 hover:-translate-y-px hover:shadow-xl"
            style={{ color: BRAND[700] }}
          >
            {t('cta.button')}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const t = useTranslations('landing');

  return (
    <footer className="border-t border-[#E8ECF4] bg-white px-6 py-14">
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: BRAND[700] }}>
                <ShieldCheck className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-[16px] font-bold text-[#1A1D23]">Evalix</span>
            </Link>
            <p className="mt-3 max-w-[220px] text-[13px] leading-[1.6] text-[#9CA3AF]">
              {t('footer.tagline')}
            </p>
          </div>

          <div>
            <p className="mb-3 text-[13px] font-semibold text-[#1A1D23]">{t('footer.product')}</p>
            <ul className="space-y-2.5">
              <li><a href="#features" className="text-[14px] text-[#6B7280] hover:text-[#1E88E5]">{t('nav.features')}</a></li>
              <li><a href="#how-it-works" className="text-[14px] text-[#6B7280] hover:text-[#1E88E5]">{t('nav.howItWorks')}</a></li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-[13px] font-semibold text-[#1A1D23]">{t('footer.account')}</p>
            <ul className="space-y-2.5">
              <li><Link href="/login" className="text-[14px] text-[#6B7280] hover:text-[#1E88E5]">{t('nav.signIn')}</Link></li>
              <li><Link href="/register" className="text-[14px] text-[#6B7280] hover:text-[#1E88E5]">{t('nav.getStartedFree')}</Link></li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-[13px] font-semibold text-[#1A1D23]">{t('footer.roles')}</p>
            <ul className="space-y-2.5 text-[14px] text-[#6B7280]">
              <li>{t('footer.roleStudents')}</li>
              <li>{t('footer.roleTeachers')}</li>
              <li>{t('footer.roleAdmins')}</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#E8ECF4] pt-8 sm:flex-row">
          <p className="text-[13px] text-[#9CA3AF]">{t('footer.copyright')}</p>
        </div>
      </div>
    </footer>
  );
}
