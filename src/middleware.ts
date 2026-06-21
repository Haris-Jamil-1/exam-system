import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Which roles may access which path prefixes
const ROLE_PATHS: Record<string, string[]> = {
  admin:   ['/admin'],
  teacher: ['/teacher'],
  student: ['/student', '/exam'],
};

// Routes that need no auth at all
const PUBLIC_PREFIXES = ['/login', '/register', '/invite', '/api', '/_next', '/favicon'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public routes and static assets
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) || pathname === '/') {
    return NextResponse.next();
  }

  const role = request.cookies.get('exam_role')?.value;

  // No session → go to login
  if (!role) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Role exists but tries to access another role's routes → redirect to own dashboard
  const allowed = ROLE_PATHS[role] ?? [];
  const isAllowed = allowed.some(prefix => pathname.startsWith(prefix));

  if (!isAllowed) {
    const dashboard = role === 'admin' ? '/admin' : role === 'teacher' ? '/teacher' : '/student';
    const url = request.nextUrl.clone();
    url.pathname = dashboard;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
