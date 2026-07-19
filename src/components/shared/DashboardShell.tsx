'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Shield, Search, Bell, Menu, X, ChevronDown, LogOut,
  AlertTriangle, ClipboardCheck, UserPlus, CheckCircle2, Radio, Clock, XCircle,
  type LucideIcon,
} from 'lucide-react';
import { LanguageToggle } from './LanguageToggle';
import { createClient } from '@/lib/supabase/client';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
}

export interface DashboardUser {
  name: string;
  role: string;
  initials: string;
  avatarColor: string;
  avatarUrl?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  read?: boolean;
}

interface DashboardShellProps {
  navItems: NavItem[];
  user: DashboardUser;
  notificationItems?: NotificationItem[];
  searchPlaceholder?: string;
  children: React.ReactNode;
}

const ICON_MAP: Record<string, LucideIcon> = {
  AlertTriangle, ClipboardCheck, UserPlus, CheckCircle2, Radio, Clock, XCircle, Bell,
};

type RawNotif = { id: string; title: string; body: string; time: string; icon: string; iconBg: string; iconColor: string; read: boolean };

function mapRaw(n: RawNotif): NotificationItem {
  return { ...n, icon: ICON_MAP[n.icon] ?? Bell };
}

function useNotifications() {
  const [items, setItems] = useState<NotificationItem[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/notifications');
        if (!res.ok) return;
        const data: RawNotif[] = await res.json();
        setItems(data.map(mapRaw));
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  return items;
}

// Read avatar from localStorage (updated by settings pages)
function useStoredAvatar() {
  const [url, setUrl] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('exam_avatar') : null
  );
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'exam_avatar') setUrl(e.newValue);
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return url;
}

export function DashboardShell({
  navItems,
  user,
  notificationItems,
  searchPlaceholder = 'Search…',
  children,
}: DashboardShellProps) {
  const storedAvatar = useStoredAvatar();
  const pathname = usePathname();
  const router   = useRouter();
  const t        = useTranslations('nav');

  const [mobileOpen, setMobileOpen]   = useState(false);
  const [notifOpen, setNotifOpen]     = useState(false);
  const [readIds, setReadIds]         = useState<Set<string>>(new Set());

  const bellRef  = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const liveItems = useNotifications();
  const items = notificationItems ?? liveItems;
  const unread = items.filter(n => !readIds.has(n.id));

  // Close panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current  && !bellRef.current.contains(e.target as Node)
      ) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  function markAllRead() {
    setReadIds(new Set(items.map(n => n.id)));
  }

  function isActive(href: string) {
    const segments = href.split('/').filter(Boolean);
    return segments.length === 1 ? pathname === href : pathname.startsWith(href);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem('exam_user');
    document.cookie = 'exam_role=; path=/; max-age=0';
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-[#F4F7FC] font-sans">
      {/* Sidebar backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      {/* ── Sidebar ── */}
      <aside className={`fixed inset-y-0 start-0 z-50 flex w-[260px] flex-col border-e border-[#E8ECF4] bg-white transition-transform duration-300 lg:!translate-x-0 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
      }`}>
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-[#E8ECF4] px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1E88E5] shadow-sm shadow-blue-200">
              <Shield className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[17px] font-bold tracking-tight text-[#1A1D23]">Evalix</span>
          </Link>
          <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-[#6B7280] hover:bg-slate-100 lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-[#9CA3AF]">
            {t('menu')}
          </p>
          <ul className="space-y-1">
            {navItems.map(({ label, href, icon: Icon, badge }) => {
              const active = isActive(href);
              return (
                <li key={label}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors duration-150 ${
                      active ? 'bg-[#E3F0FD] text-[#1E88E5]' : 'text-[#6B7280] hover:bg-slate-50 hover:text-[#1A1D23]'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={active ? 2.4 : 2} />
                    <span className="flex-1">{label}</span>
                    {badge !== undefined && badge > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User card */}
        <div className="border-t border-[#E8ECF4] p-3">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            {storedAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={storedAvatar} alt={user.name} className="flex h-9 w-9 flex-shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-white" style={{ backgroundColor: user.avatarColor }}>
                {user.initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#1A1D23]">{user.name}</p>
              <p className="truncate text-[11px] text-[#9CA3AF]">{user.role}</p>
            </div>
            <button onClick={signOut} className="rounded-lg p-2 text-[#9CA3AF] transition-colors hover:bg-slate-100 hover:text-[#1A1D23]" aria-label={t('signOut')} title={t('signOut')}>
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="lg:ps-[260px]">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-[#E8ECF4] bg-white px-4 sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-[#6B7280] hover:bg-slate-100 lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>

          {/* Search */}
          <div className="relative hidden flex-1 sm:block sm:max-w-md">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#9CA3AF]" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-[#E8ECF4] bg-[#F4F7FC] py-2.5 pe-4 ps-11 text-[14px] text-[#1A1D23] outline-none transition-all placeholder:text-[#9CA3AF] focus:border-[#1E88E5] focus:bg-white focus:ring-4 focus:ring-[#1E88E5]/10"
            />
          </div>

          <div className="ms-auto flex items-center gap-2 sm:gap-3">
            <LanguageToggle />

            {/* Bell + notification panel */}
            <div className="relative">
              <button
                ref={bellRef}
                onClick={() => setNotifOpen(o => !o)}
                className={`relative rounded-xl border p-2.5 text-[#6B7280] transition-colors hover:bg-slate-50 hover:text-[#1A1D23] ${
                  notifOpen ? 'border-[#1E88E5] bg-blue-50 text-[#1E88E5]' : 'border-[#E8ECF4] bg-white'
                }`}
                aria-label="Notifications"
              >
                <Bell className="h-[18px] w-[18px]" />
                {unread.length > 0 && (
                  <span className="absolute -top-1 end-[-4px] flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unread.length > 9 ? '9+' : unread.length}
                  </span>
                )}
              </button>

              {/* Dropdown panel */}
              {notifOpen && (
                <div
                  ref={panelRef}
                  // Anchored dropdown on ≥sm screens; full-width fixed sheet under the topbar on
                  // phones, where a 360px panel anchored to the bell would overflow the viewport
                  // and overlap/clip against the other header icons.
                  className="fixed inset-x-3 top-[72px] z-50 rounded-2xl border border-[#E8ECF4] bg-white shadow-[0_8px_32px_rgba(15,23,42,0.12)] sm:absolute sm:inset-x-auto sm:end-0 sm:top-[calc(100%+8px)] sm:w-[360px]"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-[#E8ECF4] px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Bell className="h-4 w-4 text-[#1A1D23]" strokeWidth={2} />
                      <span className="text-[14px] font-bold text-[#1A1D23]">Notifications</span>
                      {unread.length > 0 && (
                        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{unread.length}</span>
                      )}
                    </div>
                    {unread.length > 0 && (
                      <button onClick={markAllRead} className="text-[12px] font-semibold text-[#1E88E5] hover:text-[#1976D2]">
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Items */}
                  <ul className="max-h-[380px] overflow-y-auto divide-y divide-[#F4F7FC]">
                    {items.map(n => {
                      const Icon = n.icon;
                      const isRead = readIds.has(n.id);
                      return (
                        <li
                          key={n.id}
                          className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors hover:bg-[#F9FBFE] ${isRead ? 'opacity-60' : ''}`}
                          onClick={() => setReadIds(prev => new Set([...prev, n.id]))}
                        >
                          <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: n.iconBg }}>
                            <Icon className="h-4 w-4" style={{ color: n.iconColor }} strokeWidth={2} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-[13px] font-semibold text-[#1A1D23] ${!isRead ? '' : 'font-medium'}`}>{n.title}</p>
                              {!isRead && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#1E88E5]" />}
                            </div>
                            <p className="mt-0.5 text-[12px] leading-[1.5] text-[#6B7280]">{n.body}</p>
                            <p className="mt-1 text-[11px] text-[#9CA3AF]">{n.time}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {/* Footer */}
                  <div className="border-t border-[#E8ECF4] px-4 py-3 text-center">
                    <button onClick={() => setNotifOpen(false)} className="text-[13px] font-semibold text-[#1E88E5] hover:text-[#1976D2]">
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User chip */}
            <div className="flex items-center gap-2.5 rounded-xl border border-[#E8ECF4] bg-white py-1.5 pe-2.5 ps-1.5">
              {storedAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={storedAvatar} alt={user.name} className="h-8 w-8 rounded-lg object-cover" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-bold text-white" style={{ backgroundColor: user.avatarColor }}>
                  {user.initials}
                </span>
              )}
              <span className="hidden text-start sm:block">
                <span className="block text-[13px] font-semibold leading-tight text-[#1A1D23]">{user.name}</span>
                <span className="block text-[11px] leading-tight text-[#9CA3AF]">{user.role}</span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-[#9CA3AF] sm:block" />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
