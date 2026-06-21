'use client';
import { LayoutDashboard, FileText, Award, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DashboardShell, type NavItem, type DashboardUser } from '@/components/shared/DashboardShell';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const currentUser = useCurrentUser();

  const user: DashboardUser = {
    name: currentUser?.name ?? 'Student',
    role: 'Student',
    initials: currentUser?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? 'S',
    avatarColor: '#16A34A',
  };

  const navItems: NavItem[] = [
    { label: t('dashboard'), href: '/student', icon: LayoutDashboard },
    { label: t('myExams'), href: '/student/exams', icon: FileText },
    { label: t('results'), href: '/student/results', icon: Award },
    { label: t('settings'), href: '/student/settings', icon: Settings },
  ];

  return (
    <DashboardShell navItems={navItems} user={user} searchPlaceholder="Search my exams…">
      {children}
    </DashboardShell>
  );
}
