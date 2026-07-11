import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminSupabase } from '@/lib/supabase/admin';
import { getAuthUser, unauthorized, forbidden, notFound } from '@/lib/api-auth';

// Resolves a stored evidence path (violation snapshot or fulfilled snapshot
// directive) to a short-lived signed URL. Evidence is teacher/admin-facing,
// scoped to the caller's institution (+ exam ownership for teachers) —
// mirrors the audit posture: viewing evidence goes through an authorized,
// loggable endpoint, never a public URL.

const BUCKET = 'exam-uploads';
const SIGNED_URL_TTL_SECONDS = 600;

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role !== 'teacher' && user.role !== 'admin') return forbidden();

  const { searchParams } = new URL(request.url);
  const violationId = searchParams.get('violationId');
  const directiveId = searchParams.get('directiveId');

  let path: string | null = null;
  let examScope: { teacherId: string; institutionId: string } | null = null;

  if (violationId) {
    const violation = await prisma.violation.findUnique({
      where: { id: violationId },
      select: { screenshotUrl: true, exam: { select: { teacherId: true, institutionId: true } } },
    });
    if (!violation) return notFound('Violation not found');
    path = violation.screenshotUrl;
    examScope = violation.exam;
  } else if (directiveId) {
    const directive = await prisma.monitorDirective.findUnique({
      where: { id: directiveId },
      select: { resultPath: true, attempt: { select: { exam: { select: { teacherId: true, institutionId: true } } } } },
    });
    if (!directive) return notFound('Directive not found');
    path = directive.resultPath;
    examScope = directive.attempt.exam;
  } else {
    return NextResponse.json({ error: 'violationId or directiveId is required' }, { status: 400 });
  }

  if (!examScope || examScope.institutionId !== user.institutionId) return forbidden();
  if (user.role === 'teacher' && examScope.teacherId !== user.id) return forbidden();
  if (!path || path.startsWith('http')) {
    return NextResponse.json({ error: 'No evidence stored' }, { status: 404 });
  }

  const { data, error } = await adminSupabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Could not sign evidence URL' }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl });
}
