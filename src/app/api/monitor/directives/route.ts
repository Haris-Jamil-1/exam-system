import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';

// Teacher → student monitor actions (Phase 3, doc 04). POST creates a
// directive (teacher/admin, institution + ownership scoped — the row is also
// the audit log of who pulled what on whom). GET lists directives for an
// attempt: students their own pending ones (Realtime fallback polling),
// teachers any attempt in their scope (snapshot completion polling).

const createSchema = z.object({
  attemptId: z.string(),
  kind: z.enum(['snapshot', 'warning', 'force_submit']),
  message: z.string().max(500).optional(),
});

async function loadScopedAttempt(attemptId: string, user: { id: string; role: string; institutionId: string }) {
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, studentId: true, status: true, exam: { select: { id: true, teacherId: true, institutionId: true } } },
  });
  if (!attempt) return { attempt: null, allowed: false };
  const sameInstitution = attempt.exam.institutionId === user.institutionId;
  const allowed =
    user.role === 'admin' ? sameInstitution :
    user.role === 'teacher' ? sameInstitution && attempt.exam.teacherId === user.id :
    attempt.studentId === user.id; // student: own attempt only
  return { attempt, allowed };
}

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'teacher' && user.role !== 'admin') return forbidden();

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { attempt, allowed } = await loadScopedAttempt(parsed.data.attemptId, user);
  if (!attempt) return notFound('Attempt not found');
  if (!allowed) return forbidden();
  if (attempt.status !== 'in_progress') {
    return NextResponse.json({ error: 'Attempt is not in progress' }, { status: 409 });
  }
  if (parsed.data.kind === 'warning' && !parsed.data.message?.trim()) {
    return NextResponse.json({ error: 'Warning requires a message' }, { status: 400 });
  }

  const directive = await prisma.monitorDirective.create({
    data: {
      attemptId: parsed.data.attemptId,
      kind: parsed.data.kind,
      message: parsed.data.message ?? null,
      requestedById: user.id,
    },
  });
  return NextResponse.json(directive, { status: 201 });
});

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const attemptId = searchParams.get('attemptId');
  if (!attemptId) {
    return NextResponse.json({ error: 'attemptId is required' }, { status: 400 });
  }

  const { attempt, allowed } = await loadScopedAttempt(attemptId, user);
  if (!attempt) return notFound('Attempt not found');
  if (!allowed) return forbidden();

  const directives = await prisma.monitorDirective.findMany({
    where: {
      attemptId,
      // Students only ever see what they must act on; the full history is a
      // teacher-facing audit view.
      ...(user.role === 'student' && { status: 'pending' as const }),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(directives);
}
