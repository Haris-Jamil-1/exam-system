import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// '/models' is the self-hosted proctoring model assets (MediaPipe wasm/task, coco-ssd) in
// public/models — static files, not a protected route. Without it, the role-path check below
// redirected every in-exam model fetch to /student (HTML), so both vision models silently
// failed to load and face/multi-face/gaze/object detection never ran at all.
//
// '/super' hosts its own dedicated login form (unlike every institution dashboard, which
// redirects to the shared /login) — it has to be reachable while logged out. The actual
// access decision (User.isSuperAdmin, not this middleware) happens server-side in
// src/app/super/page.tsx on every render, same as getSuperAdmin() gates /api/super/*.
const PUBLIC_PREFIXES = ['/', '/login', '/register', '/invite', '/classes/join', '/api', '/_next', '/favicon', '/auth', '/models', '/super'];

// Any other file served straight out of /public (images, fonts, etc.) — same class of bug as
// '/models' above: a literal-prefix allowlist silently 307s every new static asset that isn't
// added to it by name. Matching on extension instead means new public/ assets never need a
// middleware change to load.
const STATIC_ASSET_RE = /\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|json|woff2?|ttf|map|mp4|webm|wasm|task)$/i;

const ROLE_PATHS: Record<string, string[]> = {
  admin:   ['/admin'],
  teacher: ['/teacher'],
  student: ['/student', '/exam'],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes and static assets
  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/')) || STATIC_ASSET_RE.test(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Validates the JWT server-side — never use getSession() here (it's unauthenticated).
  // getClaims() verifies the ES256 signature locally against the project's cached JWKS
  // (~1ms) instead of getUser()'s HTTPS round trip to the Auth API (~300ms measured).
  // This middleware runs on EVERY request the app makes — including every Server Action
  // POST — so that round trip was being paid once per action on top of the action's own.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (!claims?.sub) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const role = (claims.user_metadata as { role?: string } | undefined)?.role;
  const allowed = ROLE_PATHS[role ?? ''] ?? [];

  if (!allowed.some(prefix => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = role ? `/${role}` : '/login';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
