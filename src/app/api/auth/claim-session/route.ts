import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionIdentity } from '@/lib/session';
import { withErrorHandling, unauthorized } from '@/lib/api-auth';

/**
 * Called once, right after a successful sign-in (see LoginForm). Deliberately
 * does NOT go through getAuthUser() — that gate is what rejects a *stale*
 * session's requests once a newer login has claimed the slot, and this brand
 * new login is exactly the request that needs to perform that claim, so
 * checking the old activeSessionId here would lock the new login out of its
 * own takeover.
 *
 * Only students are session-fenced (single active session, anti-cheating);
 * teachers/admins can have as many concurrent sessions as they like, so this
 * is a harmless no-op for them.
 */
export const POST = withErrorHandling(async () => {
  const { supabaseId, sessionId } = await getSessionIdentity();
  if (!supabaseId || !sessionId) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { supabaseId },
    select: { id: true, role: true },
  });
  if (!user) return unauthorized();

  if (user.role === 'student') {
    await prisma.user.update({
      where: { id: user.id },
      data: { activeSessionId: sessionId },
    });
  }

  return NextResponse.json({ ok: true });
});
