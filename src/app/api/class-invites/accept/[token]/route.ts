import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminSupabase } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { deriveInviteStatus } from '@/lib/class-permissions';
import { withErrorHandling } from '@/lib/api-auth';
import { CROSS_INSTITUTION_ERROR } from '@/lib/data/invite-guards';
import { resolveAcceptInviteAssignment } from '@/lib/invite-accept-decision';

const signupSchema = z.object({
  name: z.string().min(2),
  password: z.string().min(8),
});

async function enroll(classId: string, studentId: string, inviteId: string) {
  await prisma.$transaction([
    prisma.classEnrollment.upsert({
      where: { classId_studentId: { classId, studentId } },
      create: { classId, studentId },
      update: {},
    }),
    prisma.classInvite.update({ where: { id: inviteId }, data: { status: 'accepted', acceptedAt: new Date() } }),
  ]);
}

export const POST = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
  const { token } = await params;

  const invite = await prisma.classInvite.findUnique({
    where: { token },
    include: { class: { select: { id: true, name: true, institutionId: true } } },
  });
  if (!invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });

  const status = deriveInviteStatus(invite, new Date());
  if (status === 'accepted') return NextResponse.json({ error: 'Invite already used' }, { status: 409 });
  if (status === 'expired') return NextResponse.json({ error: 'Invite has expired' }, { status: 410 });

  // User.email is globally unique — check by email alone (not scoped to this class's role/
  // institution) before deciding "brand-new student". Without this, an email that's already an
  // active member of a DIFFERENT institution falls through to the "new account" branch below,
  // where Supabase account creation fails (email taken), the fallback resolves the existing
  // Supabase user, and the class silently enrolls a student who actually belongs elsewhere.
  const existingByEmail = await prisma.user.findUnique({ where: { email: invite.email } });
  if (resolveAcceptInviteAssignment(existingByEmail, invite.class.institutionId).blocked) {
    return NextResponse.json({ error: CROSS_INSTITUTION_ERROR }, { status: 409 });
  }

  const existingStudent = await prisma.user.findFirst({
    where: { email: invite.email, role: 'student', institutionId: invite.class.institutionId },
  });

  if (existingStudent) {
    // This account already exists — never overwrite its password here. Require the caller to
    // already be authenticated as that exact account; otherwise send them to log in first.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== existingStudent.supabaseId) {
      return NextResponse.json({ requiresLogin: true, email: invite.email }, { status: 401 });
    }

    await enroll(invite.class.id, existingStudent.id, invite.id);
    return NextResponse.json({ enrolled: true, className: invite.class.name });
  }

  // Brand-new student — create the account exactly like /api/invites/accept/[token] does.
  const parsed = signupSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, password } = parsed.data;
  const { email, class: cls } = invite;

  let supabaseUserId: string;
  const { data: created, error: createErr } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: 'student', institutionId: cls.institutionId },
  });

  if (createErr) {
    const { data: list } = await adminSupabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => u.email === email);
    if (!existing) {
      console.error('[class-invites/accept] createUser error:', createErr);
      return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }
    supabaseUserId = existing.id;
  } else {
    supabaseUserId = created.user.id;
  }

  const prismaStudent = await prisma.user.upsert({
    where: { supabaseId: supabaseUserId },
    create: {
      supabaseId: supabaseUserId,
      name,
      email,
      role: 'student',
      institutionId: cls.institutionId,
    },
    update: { name },
  });

  await enroll(cls.id, prismaStudent.id, invite.id);

  return NextResponse.json({ email, role: 'student', className: cls.name });
});
