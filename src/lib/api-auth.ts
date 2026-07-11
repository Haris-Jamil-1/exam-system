import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const prismaUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    include: { institution: { select: { suspendedAt: true } } },
  });
  if (!prismaUser) return null;
  // Soft suspension (follow-up task 3): a suspended user, or any user of a
  // suspended institution, is treated as unauthenticated. Super admins are
  // exempt from their host institution's suspension (never from their own).
  if (prismaUser.suspendedAt) return null;
  if (prismaUser.institution.suspendedAt && !prismaUser.isSuperAdmin) return null;
  return prismaUser;
}

/**
 * Platform-level Super Admin gate (follow-up task 3). Deliberately its own
 * check against User.isSuperAdmin — NOT part of the role-based RBAC, and not
 * reachable via institution-admin permissions. Returns the user or null.
 */
export async function getSuperAdmin() {
  const user = await getAuthUser();
  return user?.isSuperAdmin ? user : null;
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function notFound(msg = 'Not found') {
  return NextResponse.json({ error: msg }, { status: 404 });
}

export function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Wraps a route handler so malformed/missing request bodies (bad JSON,
 * wrong Content-Type on a form-data route, etc.) return a clean 4xx JSON
 * error instead of an uncaught exception bubbling up as a bare non-JSON
 * crash. Any other unexpected error still returns JSON (500) rather than
 * a bare crash, but isn't reclassified as a 4xx.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (err) {
      const isBodyParseError =
        err instanceof SyntaxError ||
        (err instanceof TypeError && /content-type|body|FormData|JSON/i.test(err.message));
      if (isBodyParseError) {
        return NextResponse.json({ error: 'Malformed request body' }, { status: 400 });
      }
      console.error('[api] unhandled error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
