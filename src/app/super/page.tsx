// Dedicated login + panel for the platform Super Admin (/super). Unlike every
// institution-scoped dashboard (teacher/student/admin), this route is reachable
// while logged out — see PUBLIC_PREFIXES in middleware.ts — because it hosts its
// own login form (SuperLoginForm) rather than redirecting to the shared /login.
//
// Access is decided here, server-side, in one place: getAuthUser() reads the
// live Prisma row's `isSuperAdmin` flag (never the account's email address —
// any account with that flag set works, not one hardcoded address). This is
// the same pattern used by getSuperAdmin() for the /api/super/* routes, so the
// page and its data endpoints can never disagree about who's authorized.
import { getAuthUser } from '@/lib/api-auth';
import { SuperLoginForm } from '@/components/auth/SuperLoginForm';
import { SuperAdminPanel } from './SuperAdminPanel';

export default async function SuperPage() {
  const user = await getAuthUser();

  if (!user) {
    return <SuperLoginForm />;
  }

  if (!user.isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
        <div className="text-center text-gray-400">
          <p className="text-sm">This account does not have platform Super Admin access.</p>
        </div>
      </div>
    );
  }

  return <SuperAdminPanel />;
}
