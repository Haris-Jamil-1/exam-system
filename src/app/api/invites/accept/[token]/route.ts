import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminSupabase } from '@/lib/supabase/admin';

const schema = z.object({
  name: z.string().min(2),
  password: z.string().min(8),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, password } = parsed.data;

  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { invitedBy: true },
  });

  if (!invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
  if (invite.acceptedAt) return NextResponse.json({ error: 'Invite already used' }, { status: 409 });
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });

  const { email, role, institutionId } = invite;

  // Store which teacher(s) invited this student so we can scope their data view
  const teacherIds = invite.invitedBy.role === 'teacher' ? [invite.invitedById] : [];
  const teacherMeta = teacherIds.length ? { teacherIds } : {};

  // Create Supabase user with a password so they can sign in directly
  let supabaseUserId: string;
  const { data: created, error: createErr } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role, institutionId, ...teacherMeta },
  });

  if (createErr) {
    // User may already exist in Supabase from a previous invite attempt
    const { data: list } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => u.email === email);
    if (!existing) {
      console.error('[invites/accept] createUser error:', createErr);
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }
    const existingTeacherIds = (existing.user_metadata?.teacherIds as string[] | undefined) ?? [];
    const mergedTeacherIds = [...new Set([...existingTeacherIds, ...teacherIds])];
    const mergedTeacherMeta = mergedTeacherIds.length ? { teacherIds: mergedTeacherIds } : {};
    await adminSupabase.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: { name, role, institutionId, ...mergedTeacherMeta },
    });
    supabaseUserId = existing.id;
  } else {
    supabaseUserId = created.user.id;
  }

  // Upsert Prisma user
  await prisma.user.upsert({
    where: { supabaseId: supabaseUserId },
    create: {
      supabaseId: supabaseUserId,
      name,
      email,
      role: role as 'teacher' | 'student',
      institutionId,
    },
    update: { name },
  });

  // Mark invite as accepted
  await prisma.inviteToken.update({
    where: { token },
    data: { acceptedAt: new Date() },
  });

  return NextResponse.json({ email, role });
}
