import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSuperAdmin, forbidden } from '@/lib/api-auth';

// Super Admin: teachers and students of one institution (follow-up task 3).

export async function GET(
  request: Request,
  { params }: { params: Promise<{ institutionId: string }> },
) {
  const superAdmin = await getSuperAdmin();
  if (!superAdmin) return forbidden();

  const { institutionId } = await params;
  const users = await prisma.user.findMany({
    where: { institutionId, role: { in: ['teacher', 'student', 'admin'] } },
    select: { id: true, name: true, email: true, role: true, suspendedAt: true, createdAt: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json({ users });
}
