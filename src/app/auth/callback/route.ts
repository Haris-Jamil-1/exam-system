import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const isSetupFlow = searchParams.get('setup') === '1';
  const inviteTokenId = searchParams.get('invite');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const existing = await prisma.user.findUnique({ where: { supabaseId: user.id } });
        let isNewUser = false;

        if (!existing) {
          isNewUser = true;
          const meta = user.user_metadata;
          if (meta?.role && meta?.institutionId) {
            await prisma.user.create({
              data: {
                supabaseId: user.id,
                // Use email prefix as placeholder; replaced at /invite/setup
                name: (meta.name as string | undefined) ?? user.email!.split('@')[0],
                email: user.email!,
                role: meta.role as 'admin' | 'teacher' | 'student',
                institutionId: meta.institutionId as string,
              },
            });

            // Mark invite token as accepted if provided
            if (inviteTokenId) {
              await prisma.inviteToken.update({
                where: { id: inviteTokenId },
                data: { acceptedAt: new Date() },
              }).catch(() => {});
            }
          }
        }

        // New invited users must set their display name first
        if (isNewUser && isSetupFlow) {
          return NextResponse.redirect(`${origin}/invite/setup`);
        }

        const role = (user.user_metadata?.role as string | undefined) ?? existing?.role;
        const redirectTo = role ? `/${role}` : next;
        return NextResponse.redirect(`${origin}${redirectTo}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
