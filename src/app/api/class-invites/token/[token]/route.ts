import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deriveInviteStatus } from '@/lib/class-permissions';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await prisma.classInvite.findUnique({
    where: { token },
    include: { class: { select: { name: true, institutionId: true } } },
  });

  if (!invite) {
    return NextResponse.json({ error: 'Invalid invite token' }, { status: 404 });
  }

  const status = deriveInviteStatus(invite, new Date());
  const accountExists = await prisma.user.findFirst({
    where: { email: invite.email, role: 'student', institutionId: invite.class.institutionId },
    select: { id: true },
  }).then(u => Boolean(u));

  return NextResponse.json({
    email: invite.email,
    className: invite.class.name,
    status,
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    accountExists,
  });
}
