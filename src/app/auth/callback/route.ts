import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Ensure Prisma User record exists for this Supabase account
        const existing = await prisma.user.findUnique({ where: { supabaseId: user.id } });

        if (!existing) {
          // Invite-accepted user — create the Prisma record now
          const meta = user.user_metadata;
          if (meta?.role && meta?.institutionId) {
            await prisma.user.create({
              data: {
                supabaseId: user.id,
                name: (meta.name as string | undefined) ?? user.email!.split('@')[0],
                email: user.email!,
                role: meta.role as 'admin' | 'teacher' | 'student',
                institutionId: meta.institutionId as string,
              },
            });
          }
        }

        const role = (user.user_metadata?.role as string | undefined) ?? existing?.role;
        const redirectTo = role ? `/${role}` : next;
        return NextResponse.redirect(`${origin}${redirectTo}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
