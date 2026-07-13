import { NextResponse } from 'next/server';
import { getEnrollments } from '@/lib/data';
import { getAuthUser, unauthorized } from '@/lib/api-auth';

export async function GET(_req: Request, { params }: { params: Promise<{ classId: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { classId } = await params;
  const enrollments = await getEnrollments(classId);
  return NextResponse.json(enrollments);
}
