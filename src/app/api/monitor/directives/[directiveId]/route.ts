import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';

// Students fulfil directives aimed at their own attempt: a snapshot directive
// gets a resultPath, a warning gets acknowledged, force_submit gets marked
// fulfilled just before the client submits. Only pending directives can move.

const patchSchema = z.object({
  status: z.enum(['fulfilled', 'failed']),
  resultPath: z.string().max(300).optional(),
});

export const PATCH = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ directiveId: string }> },
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { directiveId } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const directive = await prisma.monitorDirective.findUnique({
    where: { id: directiveId },
    select: { id: true, status: true, attempt: { select: { studentId: true } } },
  });
  if (!directive) return notFound('Directive not found');
  if (user.role !== 'student' || directive.attempt.studentId !== user.id) return forbidden();
  if (directive.status !== 'pending') {
    return NextResponse.json({ error: 'Directive already resolved' }, { status: 409 });
  }

  const updated = await prisma.monitorDirective.update({
    where: { id: directiveId },
    data: {
      status: parsed.data.status,
      resultPath: parsed.data.resultPath ?? null,
      fulfilledAt: new Date(),
    },
  });
  return NextResponse.json(updated);
});
