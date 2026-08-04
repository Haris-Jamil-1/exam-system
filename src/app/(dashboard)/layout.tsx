import { redirect } from 'next/navigation';
import { getSessionIdentity } from '@/lib/session';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Defence in depth behind the middleware's own role gate. Resolved through the
  // shared session helper so it verifies the JWT locally instead of paying another
  // ~300ms HTTPS round trip to the Auth API on every dashboard document request.
  const { supabaseId } = await getSessionIdentity();

  if (!supabaseId) {
    redirect('/login');
  }

  return <>{children}</>;
}
