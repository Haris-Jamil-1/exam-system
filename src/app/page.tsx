'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, ArrowRight, Check, Menu, X, ChevronDown,
  ScanFace, Sparkles, BarChart3, Radio, Layers, Zap,
  Clock, Camera, Lock as LockIcon, Eye,
} from 'lucide-react';

const GREEN = {
  900: '#073B22',
  800: '#0A5730',
  700: '#0B6B3A',
  600: '#0F8C4E',
  500: '#16A34A',
  100: '#E7F5EC',
  50: '#F4FBF6',
};

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
];

const iconStrip = [
  { icon: ScanFace, label: 'AI Proctoring' },
  { icon: Sparkles, label: 'Auto Question Generation' },
  { icon: Radio, label: 'Real-Time Monitoring' },
  { icon: BarChart3, label: 'Advanced Analytics' },
];

const featureCards = [
  {
    icon: ScanFace,
    title: 'AI Proctoring',
    description: 'Detects face absence, multiple people, gaze deviation, and background audio in real time, with enforced fullscreen and tab-lock — all running on-device.',
  },
  {
    icon: Sparkles,
    title: 'Auto Question Generation',
    description: "Generate exam-ready questions with Claude from your own course material, aligned to specific learning objectives and reviewed before they go live.",
  },
  {
    icon: Radio,
    title: 'Real-Time Monitoring',
    description: "Watch every active exam from one dashboard, get instant violation alerts, and snapshot, warn, or force-submit a student's session in a click.",
  },
  {
    icon: BarChart3,
    title: 'Advanced Analytics',
    description: 'Facility index, discrimination index, and reliability stats computed per exam, plus a per-student trust score built from every proctoring signal.',
  },
  {
    icon: Zap,
    title: 'Instant Results',
    description: 'Objective questions are scored the moment an exam is submitted; essay and coding answers get an AI-suggested grade a teacher confirms before it counts.',
  },
];

const deepDive = [
  {
    icon: Sparkles,
    title: 'AI-Powered Question Generation',
    description: "Point Evalix at your course material and Claude drafts exam-ready questions across multiple formats — MCQ, essay, coding, and more — tagged to the right learning objective and held as drafts until a teacher approves them.",
  },
  {
    icon: ScanFace,
    title: 'Real-Time Proctoring',
    description: 'Face presence, multiple-face detection, gaze tracking, background audio, fullscreen enforcement, and tab-switch detection all run locally in the browser and report violations the moment they happen.',
  },
  {
    icon: Eye,
    title: 'Live Monitoring Dashboard',
    description: "Teachers see every student's status update live, review flagged moments with full context, and can send a warning, capture a snapshot, or force-submit — all from one screen.",
  },
  {
    icon: Layers,
    title: 'Multi-Tenant, Role-Based Access',
    description: 'Every institution gets its own isolated space, with dedicated permissions for students, teachers, admins, and a platform-wide super-admin tier.',
  },
];

const trustPoints = [
  'Proctoring runs on-device — raw video and audio are never uploaded, only violation events.',
  'AI never finalizes a grade by itself — every essay and coding score needs a teacher’s confirmation.',
  "Every institution's data is isolated, with role-based access enforced for students, teachers, and admins.",
];

const steps = [
  { step: '1', title: 'Register your institution', desc: 'Sign up and invite teachers instantly via secure email links.' },
  { step: '2', title: 'Create & configure exams', desc: 'Build question banks manually or let AI generate questions from your documents.' },
  { step: '3', title: 'Monitor in real time', desc: 'Watch live status, receive violation alerts, and review trust scores after exams.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-[#0F1A14]">
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

/**
 * Presentational-only affordance per explicit design spec: the landing page has no
 * translated copy yet, so this toggles its own visual state without touching the
 * app's real next-intl locale/cookie (which would RTL-flip untranslated English text).
 */
function LanguageAffordance() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<'en' | 'ar'>('en');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-full border border-[#E1EDE5] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#0F1A14] transition-colors hover:border-[#C9E3D2]"
      >
        <span aria-hidden>🇸🇦</span>
        {active === 'en' ? 'العربية' : 'English'}
        <ChevronDown className="h-3.5 w-3.5 text-[#6B7280]" />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-10 mt-2 w-40 overflow-hidden rounded-xl border border-[#E1EDE5] bg-white py-1 shadow-lg">
          <button
            onClick={() => { setActive('en'); setOpen(false); }}
            className={`block w-full px-4 py-2 text-start text-[14px] font-medium hover:bg-[#F4FBF6] ${active === 'en' ? 'text-[#0B6B3A]' : 'text-[#0F1A14]'}`}
          >
            English
          </button>
          <button
            onClick={() => { setActive('ar'); setOpen(false); }}
            className={`block w-full px-4 py-2 text-start text-[14px] font-medium hover:bg-[#F4FBF6] ${active === 'ar' ? 'text-[#0B6B3A]' : 'text-[#0F1A14]'}`}
          >
            العربية
          </button>
        </div>
      )}
    </div>
  );
}

function Navbar() {
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
          <div className="flex h-9 w-9 items-center justify-center rounded-xl shadow-sm" style={{ backgroundColor: GREEN[700] }}>
            <ShieldCheck className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-bold tracking-tight text-[#0F1A14]">Evalix</span>
        </Link>

        <div className="hidden items-center gap-9 md:flex">
          {navLinks.map(link => (
            <a key={link.label} href={link.href} className="text-[15px] font-medium text-[#5B6472] transition-colors duration-200 hover:text-[#0B6B3A]">
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <LanguageAffordance />
          <Link href="/login" className="text-[15px] font-medium text-[#5B6472] transition-colors duration-200 hover:text-[#0F1A14]">
            Sign In
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md"
            style={{ backgroundColor: GREEN[700] }}
          >
            Get Started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-lg p-2 text-[#5B6472] transition-colors hover:bg-slate-100 hover:text-[#0F1A14] md:hidden"
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
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-[#5B6472] hover:bg-slate-50 hover:text-[#0F1A14]"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex items-center justify-between px-3 py-2">
              <span className="text-[14px] text-[#5B6472]">Language</span>
              <LanguageAffordance />
            </div>
            <div className="mt-3 flex flex-col gap-2 border-t border-[#E8ECF4] pt-4">
              <Link href="/login" className="rounded-lg px-3 py-2.5 text-center text-[15px] font-medium text-[#5B6472] hover:bg-slate-50">
                Sign In
              </Link>
              <Link href="/register" className="rounded-full px-3 py-2.5 text-center text-[15px] font-semibold text-white" style={{ backgroundColor: GREEN[700] }}>
                Get Started Free
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

function Hero() {
  return (
    <section className="overflow-hidden px-6 pb-[80px] pt-[72px]">
      <div className="mx-auto grid max-w-[1180px] items-center gap-16 lg:grid-cols-2">
        <div>
          <div
            className="fade-up inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
            style={{ backgroundColor: GREEN[100], color: GREEN[700] }}
          >
            AI-Powered · Secure · Online Exams
          </div>

          <h1
            className="fade-up mt-5 max-w-[560px] text-[38px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[#0F1A14] sm:text-[46px] lg:text-[52px]"
            style={{ animationDelay: '0.08s' }}
          >
            The Smarter Way to Run{' '}
            <span style={{ color: GREEN[700] }}>Secure</span> Online Exams
          </h1>

          <p
            className="fade-up mt-5 max-w-[480px] text-[17px] leading-[1.6] text-[#5B6472]"
            style={{ animationDelay: '0.16s' }}
          >
            AI-powered proctoring, automatic question generation, and real-time
            analytics — all in one trusted platform.
          </p>

          <div
            className="fade-up mt-8 flex flex-col items-start gap-3 sm:flex-row"
            style={{ animationDelay: '0.24s' }}
          >
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-semibold text-white shadow-md transition-all duration-200 hover:-translate-y-px hover:shadow-lg"
              style={{ backgroundColor: GREEN[700] }}
            >
              Get Started Free
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-[#E1EDE5] bg-white px-7 py-3.5 text-[15px] font-semibold text-[#0F1A14] transition-all duration-200 hover:-translate-y-px hover:border-[#C9E3D2] hover:shadow-sm"
            >
              See How It Works
            </a>
          </div>

          <div
            className="fade-up mt-10 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4"
            style={{ animationDelay: '0.32s' }}
          >
            {iconStrip.map(f => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: GREEN[100] }}>
                    <Icon className="h-3.5 w-3.5" style={{ color: GREEN[700] }} strokeWidth={2.25} />
                  </span>
                  <span className="text-[13px] font-medium leading-tight text-[#5B6472]">{f.label}</span>
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
  return (
    <div className="fade-up relative mx-auto w-full max-w-[480px]" style={{ animationDelay: '0.3s' }}>
      <div
        className="absolute -inset-10 -z-10 rounded-full opacity-70 blur-3xl"
        style={{ background: `radial-gradient(closest-side, ${GREEN[100]}, transparent)` }}
        aria-hidden
      />

      <div className="overflow-hidden rounded-2xl border border-[#E1EDE5] bg-white shadow-[0_20px_50px_rgba(7,59,34,0.12)]">
        <div className="flex items-center gap-1.5 border-b border-[#E8ECF4] bg-[#FAFCFA] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#F87171]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#4ADE80]" />
          <span className="ms-3 text-[12px] font-medium text-[#9CA3AF]">Evalix — Live Exam Session</span>
          <span
            className="ms-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: GREEN[600] }}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> LIVE
          </span>
        </div>

        <div className="space-y-4 p-5 pb-16">
          <div className="flex items-center justify-between rounded-xl border border-[#E8ECF4] bg-[#FAFCFA] px-4 py-3">
            <div className="flex items-center gap-2 text-[#0F1A14]">
              <Clock className="h-4 w-4" style={{ color: GREEN[700] }} />
              <span className="text-[13px] font-medium text-[#5B6472]">Time Remaining</span>
            </div>
            <span className="font-mono text-[15px] font-bold text-[#0F1A14]">48:12</span>
          </div>

          <div className="space-y-2.5">
            {['Identity verified', 'Fullscreen enforced', 'Monitoring active'].map(item => (
              <div key={item} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: GREEN[100] }}>
                  <Check className="h-3 w-3" style={{ color: GREEN[700] }} strokeWidth={3} />
                </span>
                <span className="text-[13.5px] text-[#374151]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute -end-6 -top-6 w-[190px] rounded-xl border border-[#E1EDE5] bg-white p-3.5 shadow-[0_12px_28px_rgba(7,59,34,0.14)] sm:-end-10">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: GREEN[100] }}>
            <Camera className="h-4 w-4" style={{ color: GREEN[700] }} />
          </span>
          <div>
            <p className="text-[12.5px] font-semibold text-[#0F1A14]">Live Proctoring</p>
            <p className="flex items-center gap-1 text-[11px] font-medium" style={{ color: GREEN[600] }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: GREEN[600] }} /> Active
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-[#6B7280]">Face detected · No violations</p>
      </div>

      <div className="absolute -bottom-16 -start-4 w-[200px] rounded-xl border border-[#E1EDE5] bg-white p-3.5 shadow-[0_12px_28px_rgba(7,59,34,0.14)] sm:-start-10">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EDE9FE]">
            <Sparkles className="h-4 w-4 text-[#7C3AED]" />
          </span>
          <p className="text-[12.5px] font-semibold text-[#0F1A14]">AI Grading</p>
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-[#6B7280]">Essay graded by AI · Awaiting teacher review</p>
      </div>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="px-6 py-[80px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-14 max-w-[600px] text-center">
          <h2 className="text-[30px] font-bold tracking-[-0.01em] text-[#0F1A14] sm:text-[36px]">
            Everything you need, built in
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-[#5B6472]">
            A complete toolkit for secure, intelligent online examinations — without stitching together five different tools.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featureCards.map(f => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-2xl border border-[#EBF3EE] bg-white p-7 shadow-[0_2px_8px_rgba(7,59,34,0.05)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(7,59,34,0.10)]"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: GREEN[100] }}>
                  <Icon className="h-[22px] w-[22px]" style={{ color: GREEN[700] }} strokeWidth={2} />
                </div>
                <h3 className="mb-2 text-[17px] font-semibold text-[#0F1A14]">{f.title}</h3>
                <p className="text-[14px] font-normal leading-[1.7] text-[#5B6472]">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DeepDive() {
  return (
    <section className="px-6 py-[80px]" style={{ backgroundColor: GREEN[50] }}>
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-14 max-w-[600px] text-center">
          <h2 className="text-[30px] font-bold tracking-[-0.01em] text-[#0F1A14] sm:text-[36px]">
            Built around how exams actually run
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-[#5B6472]">
            Four core systems power every exam on Evalix, end to end.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {deepDive.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="flex gap-5 rounded-2xl border border-[#E1EDE5] bg-white p-7 shadow-[0_2px_8px_rgba(7,59,34,0.05)]">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: GREEN[700] }}>
                  <Icon className="h-[22px] w-[22px] text-white" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="mb-2 text-[16.5px] font-semibold text-[#0F1A14]">{f.title}</h3>
                  <p className="text-[14px] font-normal leading-[1.7] text-[#5B6472]">{f.description}</p>
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
  return (
    <section className="px-6 py-[72px]">
      <div className="mx-auto max-w-[880px] text-center">
        <p className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: GREEN[600] }}>
          Used by educators worldwide
        </p>
        <h2 className="mx-auto mt-3 max-w-[520px] text-[28px] font-bold tracking-[-0.01em] text-[#0F1A14] sm:text-[32px]">
          Designed around real academic integrity
        </h2>

        <div className="mt-10 grid gap-5 text-start sm:grid-cols-3">
          {trustPoints.map(point => (
            <div key={point} className="flex gap-3 rounded-2xl border border-[#EBF3EE] bg-white p-5">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: GREEN[100] }}>
                <LockIcon className="h-3.5 w-3.5" style={{ color: GREEN[700] }} />
              </span>
              <p className="text-[13.5px] leading-[1.6] text-[#374151]">{point}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-[80px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="mx-auto mb-14 max-w-[500px] text-center">
          <h2 className="text-[30px] font-bold tracking-[-0.01em] text-[#0F1A14]">How it works</h2>
          <p className="mt-4 text-[16px] text-[#5B6472]">Get from sign-up to a live proctored exam in minutes</p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {steps.map(s => (
            <div key={s.step} className="rounded-2xl border border-[#EBF3EE] bg-white p-7 text-center shadow-[0_2px_8px_rgba(7,59,34,0.05)]">
              <div
                className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl text-[18px] font-extrabold text-white"
                style={{ backgroundColor: GREEN[700] }}
              >
                {s.step}
              </div>
              <h3 className="mb-2 text-[16px] font-semibold text-[#0F1A14]">{s.title}</h3>
              <p className="text-[14px] leading-[1.7] text-[#5B6472]">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="px-6 pb-[80px]">
      <div className="mx-auto max-w-[1180px]">
        <div className="rounded-2xl px-6 py-20 text-center" style={{ backgroundColor: GREEN[900] }}>
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-[14px] font-semibold text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            Start free. Upgrade anytime.
          </div>
          <h2 className="mx-auto max-w-[600px] text-[32px] font-extrabold leading-[1.2] tracking-[-0.01em] text-white sm:text-[40px]">
            Ready to modernize your exams?
          </h2>
          <p className="mx-auto mt-5 max-w-[520px] text-[17px] leading-[1.6] text-white/75">
            Join institutions running secure, AI-proctored exams with Evalix. Set up your first exam in under three minutes.
          </p>
          <Link
            href="/register"
            className="group mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-[15px] font-semibold shadow-lg transition-all duration-200 hover:-translate-y-px hover:shadow-xl"
            style={{ color: GREEN[700] }}
          >
            Get Started Free
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#E8ECF4] bg-white px-6 py-14">
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: GREEN[700] }}>
                <ShieldCheck className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-[16px] font-bold text-[#0F1A14]">Evalix</span>
            </Link>
            <p className="mt-3 max-w-[220px] text-[13px] leading-[1.6] text-[#9CA3AF]">
              AI-powered proctoring and exam generation for institutions.
            </p>
          </div>

          <div>
            <p className="mb-3 text-[13px] font-semibold text-[#0F1A14]">Product</p>
            <ul className="space-y-2.5">
              <li><a href="#features" className="text-[14px] text-[#5B6472] hover:text-[#0B6B3A]">Features</a></li>
              <li><a href="#how-it-works" className="text-[14px] text-[#5B6472] hover:text-[#0B6B3A]">How It Works</a></li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-[13px] font-semibold text-[#0F1A14]">Account</p>
            <ul className="space-y-2.5">
              <li><Link href="/login" className="text-[14px] text-[#5B6472] hover:text-[#0B6B3A]">Sign In</Link></li>
              <li><Link href="/register" className="text-[14px] text-[#5B6472] hover:text-[#0B6B3A]">Get Started Free</Link></li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-[13px] font-semibold text-[#0F1A14]">Roles</p>
            <ul className="space-y-2.5 text-[14px] text-[#5B6472]">
              <li>Students</li>
              <li>Teachers</li>
              <li>Institution Admins</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-[#E8ECF4] pt-8 sm:flex-row">
          <p className="text-[13px] text-[#9CA3AF]">© 2026 Evalix. AI-Powered Exam Proctoring Platform.</p>
        </div>
      </div>
    </footer>
  );
}
