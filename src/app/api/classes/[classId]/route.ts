import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClassById, updateClass, archiveClass } from '@/lib/data';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';

export async function GET(_req: Request, { params }: { params: Promise<{ classId: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { classId } = await params;
  const cls = await getClassById(classId);
  if (!cls) return notFound('Class not found');
  return NextResponse.json(cls);
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  archived: z.boolean().optional(),
});

export const PATCH = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ classId: string }> },
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { classId } = await params;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, archived } = parsed.data;
  if (name === undefined && archived === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  let cls = name !== undefined ? await updateClass(classId, name) : await getClassById(classId);
  if (!cls) return forbidden();
  if (archived !== undefined) {
    cls = await archiveClass(classId, archived);
    if (!cls) return forbidden();
  }

  return NextResponse.json(cls);
});
