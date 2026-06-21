'use client';
import { useEffect, useState } from 'react';
import { LayoutDashboard, GraduationCap, FileText, ClipboardCheck, BarChart3, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DashboardShell, type NavItem, type DashboardUser } from '@/components/shared/DashboardShell';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getItems, getPendingExams } from '@/lib/data';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const currentUser = useCurrentUser();
  const [itemPendingCount, setItemPendingCount] = useState(0);
  const [examPendingCount, setExamPendingCount] = useState(0);

  useEffect(() => {
    getItems({ status: 'review' }).then(items => setItemPendingCount(items.length));
    getPendingExams().then(exams => setExamPendingCount(exams.length));
  }, []);

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
    { label: t('analytics'), href: '/admin/analytics', icon: BarChart3 },
    { label: t('settings'), href: '/admin/settings', icon: Settings },
  ];

  return (
    <DashboardShell navItems={navItems} user={user} searchPlaceholder="Search teachers, exams…">
      {children}
    </DashboardShell>
  );
}
