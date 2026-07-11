import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, unauthorized, forbidden, notFound } from '@/lib/api-auth';
import { JOB_STALE_MS } from '@/lib/ai/generation-job';

// Generation job status polling (Phase 3, doc 02). Visible to the requester
// and to same-institution admins.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { jobId } = await params;
  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    include: { items: { select: { id: true, stem: true, status: true, tags: true } } },
  });
  if (!job) return notFound('Job not found');
  if (job.institutionId !== user.institutionId) return forbidden();
  if (user.role !== 'admin' && job.requestedById !== user.id) return forbidden();

  // Staleness sweep: a runtime that died mid-run leaves the row `running`
  // forever. The row is the durability mechanism (decision 6) — mark it failed
  // so the UI never spins forever.
  if (
    (job.status === 'running' || job.status === 'queued') &&
    Date.now() - (job.startedAt ?? job.createdAt).getTime() > JOB_STALE_MS
  ) {
    const updated = await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: 'failed', error: 'Job timed out (runtime lost)', finishedAt: new Date() },
    });
    return NextResponse.json({ ...updated, items: job.items });
  }

  return NextResponse.json(job);
}
