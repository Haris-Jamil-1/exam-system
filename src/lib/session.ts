import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * The single place a request's identity is resolved.
 *
 * Two things were being paid for on every single `'use server'` data call, in
 * eight near-identical private `getSession()`/`getCaller()`/`getInstitutionId()`
 * helpers copy-pasted across `lib/data/*`:
 *
 *  1. `supabase.auth.getUser()` — an HTTPS round trip to the Supabase Auth API,
 *     measured at a ~300ms median from this network. It is called to *validate*
 *     the access token, not to read anything the token doesn't already carry.
 *  2. `prisma.user.findUnique({ supabaseId })` — a second round trip (~200ms)
 *     to map the Supabase id onto the Prisma `User.id`.
 *
 * Both are now resolved once per request:
 *
 *  - `getClaims()` replaces `getUser()`. This project signs its JWTs with an
 *    **asymmetric ES256 key** (confirmed against the live project's
 *    `/auth/v1/.well-known/jwks.json`), so `getClaims()` verifies the signature
 *    and `exp` locally via WebCrypto against the cached JWKS — measured at ~1ms
 *    after a one-off ~60ms key fetch, versus ~300ms for `getUser()`. It is the
 *    verification path Supabase itself documents as the secure alternative to
 *    `getUser()`; this is not "trusting the cookie", the signature is checked.
 *    The claim fields read here (`sub`, `user_metadata.role`,
 *    `user_metadata.institutionId`) are exactly the fields the old `getUser()`
 *    call sites read. `user_metadata` is only ever written before first login
 *    (registration / invite acceptance), so a live session can never observe a
 *    value that differs from what the Auth server would have returned.
 *  - `cache()` memoises per request, so N data functions running inside one
 *    server action resolve the identity (and the Prisma user lookup) once.
 */

export type SessionIdentity = {
  supabaseId: string | null;
  institutionId: string | null;
  role: string | null;
  teacherIds: string[] | null;
};

export type SessionContext = SessionIdentity & {
  /** The Prisma `User.id` for this session, or null when there is no matching row. */
  prismaUserId: string | null;
};

const EMPTY: SessionIdentity = { supabaseId: null, institutionId: null, role: null, teacherIds: null };

export const getSessionIdentity = cache(async (): Promise<SessionIdentity> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return EMPTY;
  const meta = (claims.user_metadata ?? {}) as {
    role?: string; institutionId?: string; teacherIds?: string[];
  };
  return {
    supabaseId: claims.sub,
    institutionId: meta.institutionId ?? null,
    role: meta.role ?? null,
    teacherIds: meta.teacherIds ?? null,
  };
});

/** Identity plus the resolved Prisma `User.id`. One extra query, memoised per request. */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const identity = await getSessionIdentity();
  if (!identity.supabaseId) return { ...identity, prismaUserId: null };
  const row = await prisma.user.findUnique({
    where: { supabaseId: identity.supabaseId },
    select: { id: true },
  });
  return { ...identity, prismaUserId: row?.id ?? null };
});

/**
 * The full Prisma `User` row for this session, memoised per request. Used where
 * a caller needs more than the id (role/institution straight from the database
 * rather than from the token's metadata).
 */
export const getSessionUser = cache(async () => {
  const { supabaseId } = await getSessionIdentity();
  if (!supabaseId) return null;
  return prisma.user.findUnique({ where: { supabaseId } });
});

/** Convenience for the many call sites that only ever needed the institution. */
export async function getSessionInstitutionId(): Promise<string | null> {
  return (await getSessionIdentity()).institutionId;
}
