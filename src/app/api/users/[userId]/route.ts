import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setUserSuspension } from '@/lib/data';
import { getAuthUser, unauthorized, forbidden, withErrorHandling } from '@/lib/api-auth';

const schema = z.object({
  suspend: z.boolean(),
});

export const PATCH = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'admin') return forbidden();
  const { userId } = await params;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await setUserSuspension(userId, parsed.data.suspend);
  if (!updated) return forbidden();
  return NextResponse.json(updated);
});
