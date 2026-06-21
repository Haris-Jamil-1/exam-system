'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Shield, ArrowRight, Check, Menu, X,
  ScanFace, Sparkles, BarChart3, Lock,
} from 'lucide-react';

const navLinks = ['Features', 'Pricing', 'About'];

const trustBadges = [
  'Trusted AI Proctoring',
  'Auto Question Generation',
  'Real-Time Alerts',
];

const features = [
  {
    icon: ScanFace,
    title: 'AI Proctoring',
    description: 'Detects face absence, multiple people, gaze deviation, and suspicious audio in real time — on device, no video upload.',
    iconBg: '#E3F0FD',
    iconColor: '#1E88E5',
  },
  {
    icon: Sparkles,
    title: 'AI Question Generation',
    description: 'Upload any document and let AI instantly generate exam-ready questions across 8 question types.',
    iconBg: '#EDE9FE',
    iconColor: '#7C3AED',
  },
  {
    icon: BarChart3,
    title: 'Live Analytics',
    description: 'Track performance, difficulty, reliability, and per-student trust scores with live dashboards.',
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
  },
  {
    icon: Lock,
    title: 'Secure Architecture',
    description: 'Role-based access, encryption, and full audit logging keep institution data safe and compliant.',
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F4F7FC] font-sans text-[#1A1D23]">
      <FadeUpKeyframes />
      <Navbar />
      <main>
        <Hero />
        <Features />
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

function Navbar() {
  const [scrolled, setScrolled]   = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav className={`sticky top-0 z-50 border-b bg-white transition-shadow duration-300 ${
      scrolled ? 'border-[#E8ECF4] shadow-[0_4px_20px_rgba(15,23,42,0.06)]' : 'border-[#E8ECF4] shadow-none'
    }`}>
      <div className="mx-auto flex h-[72px] max-w-[1100px] items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1E88E5] shadow-sm shadow-blue-200">
            <Shield className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-bold tracking-tight text-[#1A1D23]">ExamPro</span>
        </Link>

        {/* Center links */}
        <div className="hidden items-center gap-9 md:flex">
          {navLinks.map(link => (
            <a key={link} href={`#${link.toLowerCase()}`} className="text-[15px] font-medium text-[#6B7280] transition-colors duration-200 hover:text-[#1E88E5]">
              {link}
            </a>
          ))}
        </div>

        {/* Right CTAs */}
        <div className="hidden items-center gap-4 md:flex">
          <Link href="/login" className="text-[15px] font-medium text-[#6B7280] transition-colors duration-200 hover:text-[#1A1D23]">
            Sign In
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1E88E5] px-5 py-2.5 text-[15px] font-semibold text-white shadow-sm shadow-blue-200 transition-all duration-200 hover:-translate-y-px hover:bg-[#1976D2] hover:shadow-md hover:shadow-blue-200"
          >
            Get Started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="rounded-lg p-2 text-[#6B7280] transition-colors hover:bg-slate-100 hover:text-[#1A1D23] md:hidden"
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-[#E8ECF4] bg-white md:hidden">
          <div className="mx-auto flex max-w-[1100px] flex-col gap-1 px-6 py-4">
            {navLinks.map(link => (
              <a
                key={link}
                href={`#${link.toLowerCase()}`}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-[#6B7280] hover:bg-slate-50 hover:text-[#1A1D23]"
              >
                {link}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-[#E8ECF4] pt-4">
              <Link href="/login" className="rounded-lg px-3 py-2.5 text-center text-[15px] font-medium text-[#6B7280] hover:bg-slate-50">
                Sign In
              </Link>
              <Link href="/register" className="rounded-full bg-[#1E88E5] px-3 py-2.5 text-center text-[15px] font-semibold text-white">
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
    <section className="px-6 py-[120px]">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center text-center">
        <h1
          className="fade-up max-w-[820px] text-[40px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[#1A1D23] sm:text-[48px] lg:text-[56px]"
          style={{ animationDelay: '0.08s' }}
        >
          The Smartest Way to Run{' '}
          <span className="bg-gradient-to-r from-[#1E88E5] to-[#42A5F5] bg-clip-text text-transparent">
            Secure
          </span>{' '}
          Exams
        </h1>

        <p
          className="fade-up mt-5 max-w-[540px] text-[18px] font-normal leading-[1.6] text-[#6B7280]"
          style={{ animationDelay: '0.16s' }}
        >
          AI-powered proctoring, automatic question generation, and real-time
          analytics — all in one platform.
        </p>

        <div
          className="fade-up mt-10 flex flex-col items-center gap-3 sm:flex-row"
          style={{ animationDelay: '0.24s' }}
        >
          <Link
            href="/register"
            className="group inline-flex items-center gap-2 rounded-full bg-[#1E88E5] px-7 py-3.5 text-[15px] font-semibold text-white shadow-md shadow-blue-200 transition-all duration-200 hover:-translate-y-px hover:bg-[#1976D2] hover:shadow-lg hover:shadow-blue-200"
          >
            Get Started Free
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-full border border-[#E8ECF4] bg-white px-7 py-3.5 text-[15px] font-semibold text-[#1A1D23] transition-all duration-200 hover:-translate-y-px hover:border-[#CBD5E1] hover:shadow-sm"
          >
            See How It Works
          </a>
        </div>

        <div
          className="fade-up mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          style={{ animationDelay: '0.32s' }}
        >
          {trustBadges.map((label, i) => (
            <React.Fragment key={label}>
              {i > 0 && <span className="hidden text-[#CBD5E1] sm:inline" aria-hidden>·</span>}
              <span className="flex items-center gap-1.5 text-[14px] text-[#6B7280]">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#DCFCE7]">
                  <Check className="h-2.5 w-2.5 text-[#16A34A]" strokeWidth={3.5} />
                </span>
                {label}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* Stats strip */}
        <div className="mt-16 grid w-full max-w-[600px] grid-cols-3 gap-4 rounded-2xl border border-[#EBF0F8] bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
          {[
            { value: '50+',    label: 'Institutions' },
            { value: '12,000+',label: 'Exams Proctored' },
            { value: '98.3%',  label: 'Trust Accuracy' },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <p className="text-[22px] font-extrabold text-[#1A1D23]">{stat.value}</p>
              <p className="mt-0.5 text-[12px] text-[#9CA3AF]">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="px-6 py-[80px]">
      <div className="mx-auto max-w-[1100px]">
        <div className="mx-auto mb-14 max-w-[600px] text-center">
          <h2 className="text-[30px] font-bold tracking-[-0.01em] text-[#1A1D23] sm:text-[36px]">
            Everything you need, built in
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-[#6B7280]">
            A complete toolkit for secure, intelligent online examinations — without stitching together five different tools.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {features.map(f => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="group rounded-2xl border border-[#EBF0F8] bg-white p-7 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(15,23,42,0.10)]"
              >
                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: f.iconBg }}>
                  <Icon className="h-[22px] w-[22px]" style={{ color: f.iconColor }} strokeWidth={2} />
                </div>
                <h3 className="mb-2 text-[17px] font-semibold text-[#1A1D23]">{f.title}</h3>
                <p className="text-[14px] font-normal leading-[1.7] text-[#6B7280]">{f.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="px-6 py-[80px]">
      <div className="mx-auto max-w-[1100px]">
        <div className="mx-auto mb-14 max-w-[500px] text-center">
          <h2 className="text-[30px] font-bold tracking-[-0.01em] text-[#1A1D23]">How it works</h2>
          <p className="mt-4 text-[16px] text-[#6B7280]">Get from sign-up to a live proctored exam in minutes</p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { step: '1', title: 'Register your institution', desc: 'Sign up and invite teachers instantly via secure email links.', color: '#1E88E5', bg: '#E3F0FD' },
            { step: '2', title: 'Create & configure exams',  desc: 'Build question banks manually or let AI generate questions from your documents.', color: '#7C3AED', bg: '#EDE9FE' },
            { step: '3', title: 'Monitor in real time',       desc: 'Watch live feeds, receive violation alerts, and review trust scores after exams.', color: '#16A34A', bg: '#DCFCE7' },
          ].map(s => (
            <div key={s.step} className="rounded-2xl border border-[#EBF0F8] bg-white p-7 shadow-[0_2px_8px_rgba(0,0,0,0.05)] text-center">
              <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl text-[18px] font-extrabold text-white" style={{ backgroundColor: s.color }}>
                {s.step}
              </div>
              <h3 className="mb-2 text-[16px] font-semibold text-[#1A1D23]">{s.title}</h3>
              <p className="text-[14px] leading-[1.7] text-[#6B7280]">{s.desc}</p>
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
      <div className="mx-auto max-w-[1100px]">
        <div className="rounded-2xl bg-[#0D47A1] px-6 py-20 text-center">
          <div className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-[14px] font-semibold text-white/90">
            <Sparkles className="h-3.5 w-3.5" />
            Start free. Upgrade anytime.
          </div>
          <h2 className="mx-auto max-w-[600px] text-[32px] font-extrabold leading-[1.2] tracking-[-0.01em] text-white sm:text-[40px]">
            Ready to modernize your exams?
          </h2>
          <p className="mx-auto mt-5 max-w-[520px] text-[17px] leading-[1.6] text-white/75">
            Join institutions running secure, AI-proctored exams with ExamPro. Set up your first exam in under three minutes.
          </p>
          <Link
            href="/register"
            className="group mt-9 inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 text-[15px] font-semibold text-[#1E88E5] shadow-lg transition-all duration-200 hover:-translate-y-px hover:bg-blue-50 hover:shadow-xl"
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
    <footer className="border-t border-[#E8ECF4] bg-white px-6 py-10">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1E88E5]">
            <Shield className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[16px] font-bold text-[#1A1D23]">ExamPro</span>
        </div>
        <p className="text-[13px] text-[#9CA3AF]">© 2026 ExamPro. AI-Powered Exam Proctoring Platform.</p>
      </div>
    </footer>
  );
}
