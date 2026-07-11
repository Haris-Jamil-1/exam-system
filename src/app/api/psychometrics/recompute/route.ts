import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';
import { requestComputation } from '@/lib/psychometrics-client';

// On-demand psychometrics recompute (Phase 3, doc 05): teacher (own exam) or
// admin (own institution) triggers a synchronous stat run for one exam.

const schema = z.object({ examId: z.string() });

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'teacher' && user.role !== 'admin') return forbidden();

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const exam = await prisma.exam.findUnique({
    where: { id: parsed.data.examId },
    select: { teacherId: true, institutionId: true },
  });
  if (!exam) return notFound('Exam not found');
  if (exam.institutionId !== user.institutionId) return forbidden();
  if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();

  const outcome = await requestComputation(parsed.data.examId);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 503 });
  }
  return NextResponse.json(outcome.result);
});
