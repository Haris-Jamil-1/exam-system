import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// '/models' is the self-hosted proctoring model assets (MediaPipe wasm/task, coco-ssd) in
// public/models — static files, not a protected route. Without it, the role-path check below
// redirected every in-exam model fetch to /student (HTML), so both vision models silently
// failed to load and face/multi-face/gaze/object detection never ran at all.
const PUBLIC_PREFIXES = ['/', '/login', '/register', '/invite', '/classes/join', '/api', '/_next', '/favicon', '/auth', '/models'];

const ROLE_PATHS: Record<string, string[]> = {
  admin:   ['/admin'],
  teacher: ['/teacher'],
  student: ['/student', '/exam'],
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes and static assets
  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) {
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

  // Validates JWT server-side — never use getSession() here (it's unauthenticated)
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const role = user.user_metadata?.role as string | undefined;
  const allowed = ROLE_PATHS[role ?? ''] ?? [];

  // /super (platform Super Admin panel) is authenticated-only here; the real
  // gate is the User.isSuperAdmin DB flag checked by every /api/super route —
  // non-supers reaching the page just see a 403 message.
  if (pathname.startsWith('/super')) {
    return response;
  }

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
