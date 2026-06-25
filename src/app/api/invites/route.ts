import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';
import { adminSupabase } from '@/lib/supabase/admin';
import { getAuthUser, unauthorized, forbidden } from '@/lib/api-auth';

const resend = new Resend(process.env.RESEND_API_KEY);

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

  if (user.role === 'teacher' && role !== 'student') return forbidden();
  if (user.role === 'student') return forbidden();

  const invite = await prisma.inviteToken.create({
    data: {
      email,
      role,
      institutionId: user.institutionId,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const redirectTo = `${appUrl}/auth/callback?invite=${invite.id}`;

  // Generate invite link without sending Supabase's default email
  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo,
      data: { role, institutionId: user.institutionId },
    },
  });

  if (linkError || !linkData) {
    await prisma.inviteToken.delete({ where: { id: invite.id } }).catch(() => {});
    return NextResponse.json({ error: linkError?.message ?? 'Failed to generate invite link' }, { status: 500 });
  }

  const inviteUrl = linkData.properties?.action_link;
  if (!inviteUrl) {
    await prisma.inviteToken.delete({ where: { id: invite.id } }).catch(() => {});
    return NextResponse.json({ error: 'Failed to get invite URL' }, { status: 500 });
  }

  const roleLabel = role === 'teacher' ? 'Teacher' : 'Student';
  const { error: emailError } = await resend.emails.send({
    from: 'ExamPro <onboarding@resend.dev>',
    to: email,
    subject: `You're invited to ExamPro as a ${roleLabel}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff">
        <div style="margin-bottom:24px">
          <div style="display:inline-flex;width:44px;height:44px;background:#1E88E5;border-radius:10px;align-items:center;justify-content:center">
            <span style="color:#fff;font-size:20px;font-weight:700">E</span>
          </div>
          <span style="margin-left:10px;font-size:18px;font-weight:700;color:#1A1D23;vertical-align:middle">ExamPro</span>
        </div>
        <h2 style="font-size:22px;font-weight:700;color:#1A1D23;margin:0 0 8px">You've been invited</h2>
        <p style="color:#6B7280;font-size:15px;margin:0 0 24px">
          You've been invited to join ExamPro as a <strong>${roleLabel}</strong>.
          Click the button below to accept your invitation and set up your account.
        </p>
        <a href="${inviteUrl}" style="display:inline-block;background:#1E88E5;color:#fff;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none">
          Accept Invitation
        </a>
        <p style="color:#9CA3AF;font-size:13px;margin:24px 0 0">
          This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
        </p>
      </div>
    `,
  });

  if (emailError) {
    console.error('[invites] Resend error:', emailError);
    await prisma.inviteToken.delete({ where: { id: invite.id } }).catch(() => {});
    return NextResponse.json({ error: 'Failed to send invite email' }, { status: 500 });
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
