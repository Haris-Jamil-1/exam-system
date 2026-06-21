'use client';
import { LayoutDashboard, FileText, Library, Activity, Users, BarChart3, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DashboardShell, type NavItem, type DashboardUser } from '@/components/shared/DashboardShell';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const currentUser = useCurrentUser();

  const user: DashboardUser = {
    name: currentUser?.name ?? 'Teacher',
    role: 'Teacher',
    initials: currentUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'T',
    avatarColor: '#1E88E5',
  };

  const navItems: NavItem[] = [
    { label: t('dashboard'), href: '/teacher', icon: LayoutDashboard },
    { label: t('exams'), href: '/teacher/exams', icon: FileText },
    { label: t('items'), href: '/teacher/items', icon: Library },
    { label: t('monitor'), href: '/teacher/monitor', icon: Activity },
    { label: t('students'), href: '/teacher/students', icon: Users },
    { label: t('analytics'), href: '/teacher/analytics', icon: BarChart3 },
    { label: t('settings'), href: '/teacher/settings', icon: Settings },
  ];

  return (
    <DashboardShell navItems={navItems} user={user} searchPlaceholder="Search exams, students…">
      {children}
    </DashboardShell>
  );
}
