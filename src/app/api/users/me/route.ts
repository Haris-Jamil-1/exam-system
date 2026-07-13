import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, withErrorHandling } from '@/lib/api-auth';

function userResponse(u: { id: string; name: string; email: string; role: string; institutionId: string; avatarUrl: string | null }) {
  return NextResponse.json({
    id: u.id, name: u.name, email: u.email,
    role: u.role, institutionId: u.institutionId,
    avatarUrl: u.avatarUrl ?? undefined,
  });
}

export async function GET() {
  // getAuthUser() (not a bare supabase.auth.getUser() check) is what applies the suspendedAt
  // gate — a deactivated user's session-bootstrap call must fail here too, not just on routes
  // that happen to use it already.
  const user = await getAuthUser();
  if (!user) return unauthorized();
  return userResponse(user);
}

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  avatarUrl: z.string().url().optional(),
});

export const PATCH = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const prismaUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.avatarUrl && { avatarUrl: parsed.data.avatarUrl }),
    },
  });

  return userResponse(prismaUser);
});
