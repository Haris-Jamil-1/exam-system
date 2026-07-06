import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const prismaUser = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  return prismaUser;
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
