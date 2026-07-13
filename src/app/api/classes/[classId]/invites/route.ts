import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getClassInvites, createClassInvites } from '@/lib/data';
import { parseBulkEmails } from '@/lib/class-permissions';
import { getAuthUser, unauthorized, forbidden, withErrorHandling } from '@/lib/api-auth';

export async function GET(_req: Request, { params }: { params: Promise<{ classId: string }> }) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const { classId } = await params;
  const invites = await getClassInvites(classId);
  return NextResponse.json(invites);
}

const bulkInviteSchema = z.object({
  text: z.string().min(1),
});

export const POST = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ classId: string }> },
) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (user.role === 'student') return forbidden();
  const { classId } = await params;

  const parsed = bulkInviteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const emails = parseBulkEmails(parsed.data.text);
  if (emails.length === 0) {
    return NextResponse.json({ error: 'No valid email addresses found' }, { status: 400 });
  }

  const results = await createClassInvites(classId, emails);
  if (!results) return forbidden();
  return NextResponse.json(results, { status: 201 });
});
