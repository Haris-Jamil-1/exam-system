import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { isRateLimited } from '@/lib/class-permissions';
import { withErrorHandling } from '@/lib/api-auth';

const schema = z.object({ email: z.string().email() });

const RATE_LIMIT = { max: 3, windowMs: 15 * 60_000 };

export const POST = withErrorHandling(async (request: Request) => {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT.windowMs);
  const recentAttempts = await prisma.passwordResetAttempt.findMany({
    where: { email, createdAt: { gt: windowStart } },
    select: { createdAt: true },
  });

  if (isRateLimited(recentAttempts.map(a => a.createdAt), now, RATE_LIMIT)) {
    return NextResponse.json(
      { error: 'Too many reset requests. Please try again later.' },
      { status: 429 },
    );
  }

  await prisma.passwordResetAttempt.create({ data: { email } });

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
  });

  // Never reveal whether the email exists or whether Supabase itself errored —
  // log server-side, still respond with the same generic success shape.
  if (error) {
    console.error('[forgot-password] resetPasswordForEmail error:', error);
  }

  return NextResponse.json({ ok: true });
});
