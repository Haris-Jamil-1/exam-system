import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getSuperAdmin, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';

// Super Admin suspend/unsuspend (follow-up task 3): soft flag only — sets
// suspendedAt, never deletes. Suspended users (or all users of a suspended
// institution) are treated as unauthenticated by getAuthUser.

const schema = z.object({
  kind: z.enum(['institution', 'user']),
  id: z.string(),
  suspend: z.boolean(),
});

export const POST = withErrorHandling(async (request: Request) => {
  const superAdmin = await getSuperAdmin();
  if (!superAdmin) return forbidden();

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { kind, id, suspend } = parsed.data;
  const suspendedAt = suspend ? new Date() : null;

  if (kind === 'institution') {
    const inst = await prisma.institution.findUnique({ where: { id }, select: { id: true } });
    if (!inst) return notFound('Institution not found');
    await prisma.institution.update({ where: { id }, data: { suspendedAt } });
  } else {
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, isSuperAdmin: true },
    });
    if (!target) return notFound('User not found');
    // Super admins cannot suspend each other from the panel — prevents a
    // single compromised account from locking out platform control entirely.
    if (target.isSuperAdmin) {
      return NextResponse.json({ error: 'Cannot suspend a super admin' }, { status: 409 });
    }
    await prisma.user.update({ where: { id }, data: { suspendedAt } });
  }

  return NextResponse.json({ kind, id, suspendedAt });
});
