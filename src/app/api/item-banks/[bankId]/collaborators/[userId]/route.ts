import { NextResponse } from 'next/server';
import { z } from 'zod';
import { removeCollaborator, addCollaborator } from '@/lib/data/item-banks';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';

export const DELETE = withErrorHandling(async (_request: Request, { params }: { params: Promise<{ bankId: string; userId: string }> }) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { bankId, userId } = await params;
  try {
    const ok = await removeCollaborator(bankId, userId);
    if (!ok) return notFound();
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Forbidden') return forbidden();
    return NextResponse.json({ error: message }, { status: 400 });
  }
});

const updateSchema = z.object({ permissionRole: z.enum(['editor', 'viewer']) });

export const PATCH = withErrorHandling(async (request: Request, { params }: { params: Promise<{ bankId: string; userId: string }> }) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { bankId, userId } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const collaborator = await addCollaborator(bankId, userId, parsed.data.permissionRole);
    return NextResponse.json(collaborator);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Not found') return notFound();
    if (message === 'Forbidden' || message.startsWith('Forbidden')) return forbidden();
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
