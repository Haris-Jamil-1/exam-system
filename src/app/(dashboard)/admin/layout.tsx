'use client';
import { LayoutDashboard, GraduationCap, FileText, ClipboardCheck, BarChart3, Settings, BookOpen, Library, Users2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DashboardShell, type NavItem, type DashboardUser } from '@/components/shared/DashboardShell';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useServerData } from '@/hooks/useServerData';
import { getAdminNavCounts } from '@/lib/data';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const currentUser = useCurrentUser();
  // One action instead of two, and it now refetches whenever anything is
  // approved/rejected anywhere in the shell — the badges used to be fetched once
  // per mount and stayed wrong until a hard reload.
  const { data: counts } = useServerData(() => getAdminNavCounts(), []);
  const itemPendingCount = counts?.itemsPending ?? 0;
  const examPendingCount = counts?.examsPending ?? 0;

  const user: DashboardUser = {
    name: currentUser?.name ?? 'Admin',
    role: 'Institution Admin',
    initials: currentUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'A',
    avatarColor: '#7C3AED',
  };

  const navItems: NavItem[] = [
    { label: t('dashboard'), href: '/admin', icon: LayoutDashboard },
    { label: t('teachers'), href: '/admin/teachers', icon: GraduationCap },
    { label: t('exams'), href: '/admin/exams', icon: FileText, badge: examPendingCount || undefined },
    { label: t('itemReview'), href: '/admin/items', icon: ClipboardCheck, badge: itemPendingCount || undefined },
    { label: 'Item Banks', href: '/admin/item-banks', icon: Library },
    { label: 'Classes', href: '/admin/classes', icon: Users2 },
    { label: t('analytics'), href: '/admin/analytics', icon: BarChart3 },
    { label: 'Curriculum', href: '/admin/curriculum', icon: BookOpen },
    { label: t('settings'), href: '/admin/settings', icon: Settings },
  ];

  return (
    <DashboardShell navItems={navItems} user={user} searchPlaceholder="Search teachers, exams…">
      {children}
    </DashboardShell>
  );
}
