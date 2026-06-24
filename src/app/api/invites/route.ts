import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminSupabase } from '@/lib/supabase/admin';
import { getAuthUser, unauthorized, forbidden } from '@/lib/api-auth';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['teacher', 'student']),
});

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, role } = parsed.data;

  // Role-based permission: admins invite teachers, teachers invite students
  if (user.role === 'teacher' && role !== 'student') return forbidden();
  if (user.role === 'student') return forbidden();

  // Create InviteToken record
  const invite = await prisma.inviteToken.create({
    data: {
      email,
      role,
      institutionId: user.institutionId,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const redirectTo = `${appUrl}/auth/callback?setup=1&invite=${invite.id}`;

  // Send invite via Supabase — creates user + sends email
  const { error } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      role,
      institutionId: user.institutionId,
      inviteTokenId: invite.id,
    },
  });

  if (error) {
    // Clean up invite token on failure
    await prisma.inviteToken.delete({ where: { id: invite.id } }).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: invite.id, email, role }, { status: 201 });
}

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role === 'student') return forbidden();

  const { searchParams } = new URL(request.url);
  const tokenId = searchParams.get('id');

  if (tokenId) {
    const token = await prisma.inviteToken.findUnique({ where: { id: tokenId } });
    if (!token) return NextResponse.json({ error: 'Invalid invite' }, { status: 404 });
    return NextResponse.json(token);
  }

  const invites = await prisma.inviteToken.findMany({
    where: { institutionId: user.institutionId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(invites);
}
