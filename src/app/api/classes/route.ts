import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMyClasses, createClass } from '@/lib/data';
import { getAuthUser, unauthorized, forbidden, withErrorHandling } from '@/lib/api-auth';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const classes = await getMyClasses();
  return NextResponse.json(classes);
}

const createClassSchema = z.object({
  name: z.string().min(1).max(100),
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'teacher') return forbidden();

  const parsed = createClassSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cls = await createClass(parsed.data.name);
  if (!cls) return forbidden();
  return NextResponse.json(cls, { status: 201 });
});
