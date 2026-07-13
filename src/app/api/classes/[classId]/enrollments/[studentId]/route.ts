import { NextResponse } from 'next/server';
import { removeEnrollment } from '@/lib/data';
import { getAuthUser, unauthorized, forbidden, withErrorHandling } from '@/lib/api-auth';

export const DELETE = withErrorHandling(async (
  _request: Request,
  { params }: { params: Promise<{ classId: string; studentId: string }> },
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { classId, studentId } = await params;

  const ok = await removeEnrollment(classId, studentId);
  if (!ok) return forbidden();
  return NextResponse.json({ classId, studentId });
});
