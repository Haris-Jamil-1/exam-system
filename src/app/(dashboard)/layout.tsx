import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const role = cookieStore.get('exam_role')?.value;

  if (!role) {
    redirect('/login');
  }

  return <>{children}</>;
}
