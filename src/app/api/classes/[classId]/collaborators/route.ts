import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClassCollaborators, addClassCollaborator } from '@/lib/data/classes';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';

export async function GET(_req: Request, { params }: { params: Promise<{ classId: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { classId } = await params;
  const collaborators = await getClassCollaborators(classId);
  return NextResponse.json(collaborators);
}

const addSchema = z.object({
  userId: z.string().min(1),
  permissionRole: z.enum(['editor', 'viewer']),
});

export const POST = withErrorHandling(async (request: Request, { params }: { params: Promise<{ classId: string }> }) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { classId } = await params;
  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const collaborator = await addClassCollaborator(classId, parsed.data.userId, parsed.data.permissionRole);
    return NextResponse.json(collaborator);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Not found') return notFound();
    if (message === 'Forbidden' || message.startsWith('Forbidden')) return forbidden();
    return NextResponse.json({ error: message }, { status: 400 });
  }
});
