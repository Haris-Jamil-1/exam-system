import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { invitedBy: { include: { institution: true } } },
  });

  if (!invite) {
    return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
  }

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    institutionName: invite.invitedBy.institution.name,
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
  });
}
