import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, notFound, forbidden } from '@/lib/api-auth';

export async function PATCH(_req: Request, { params }: { params: Promise<{ examId: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'teacher' && user.role !== 'admin') return forbidden();

  const { examId } = await params;
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) return notFound('Exam not found');

  // Only the exam owner or admin can publish results
  if (user.role === 'teacher' && exam.teacherId !== user.id) return forbidden();

  const updated = await prisma.exam.update({
    where: { id: examId },
    data: { resultsPublishedAt: new Date() },
  });

  return NextResponse.json({
    id: updated.id,
    resultsPublishedAt: updated.resultsPublishedAt?.toISOString(),
  });
}
