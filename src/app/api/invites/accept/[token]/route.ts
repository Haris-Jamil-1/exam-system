import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { adminSupabase } from '@/lib/supabase/admin';
import { withErrorHandling } from '@/lib/api-auth';
import { CROSS_INSTITUTION_ERROR } from '@/lib/data/invite-guards';
import { resolveAcceptInviteAssignment } from '@/lib/invite-accept-decision';

const schema = z.object({
  name: z.string().min(2),
  password: z.string().min(8),
});

export const POST = withErrorHandling(async (
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) => {
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

  // Defense in depth: /api/invites already blocks creating an invite for an email that's an
  // active member of a different institution, but this re-checks at accept time too (covers
  // invites created before that guard existed, and races). A pre-existing Prisma row here is
  // also what tells us below whether accepting genuinely moves this email to a new institution
  // (in which case its old suspension no longer applies) versus a same-institution re-invite.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  const decision = resolveAcceptInviteAssignment(existingUser, institutionId);
  if (decision.blocked) {
    return NextResponse.json({ error: CROSS_INSTITUTION_ERROR }, { status: 409 });
  }
  const { movingInstitutions } = decision;

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

  // Upsert Prisma user and mark invite accepted. The update branch must also set role and
  // institutionId, not just name — an accepting user whose Supabase account already existed
  // (the common case once someone has *any* account, e.g. a teacher accepting a second invite,
  // or the account-creation race handled above) was previously left with whatever role/
  // institutionId it already had, so the invite silently never actually joined them anywhere.
  const prismaStudent = await prisma.user.upsert({
    where: { supabaseId: supabaseUserId },
    create: {
      supabaseId: supabaseUserId,
      name,
      email,
      role: role as 'teacher' | 'student',
      institutionId,
    },
    update: {
      name,
      role: role as 'teacher' | 'student',
      institutionId,
      // Only clear a prior suspension when this invite is genuinely moving the account to a new
      // institution (guard above already proved that's only reachable when the old membership was
      // suspended) — a same-institution re-invite must never silently reactivate a suspended user.
      ...(movingInstitutions ? { suspendedAt: null } : {}),
    },
  });

  // Link student to inviting teacher in the DB (source of truth for class membership)
  if (invite.invitedBy.role === 'teacher') {
    await prisma.teacherStudent.upsert({
      where: { teacherId_studentId: { teacherId: invite.invitedById, studentId: prismaStudent.id } },
      create: { teacherId: invite.invitedById, studentId: prismaStudent.id },
      update: {},
    });
  }

  await prisma.inviteToken.update({
    where: { token },
    data: { acceptedAt: new Date() },
  });

  return NextResponse.json({ email, role });
});
