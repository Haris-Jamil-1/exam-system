// Shared cross-institution invite guard — deliberately NOT a 'use server' module (it's an
// internal helper imported by route handlers and by 'use server' files, not called directly
// from a client component; same non-action-file convention as class-permissions.ts).
//
// User.email is globally unique in this schema (prisma/schema.prisma), so one email can only
// ever belong to one institution's account — there is no multi-institution membership model.
// Every invite path (institution-level teacher/student invites and per-class student invites)
// needs the same check before creating an invite or reassigning an accepted one: is this email
// already an ACTIVE member of a DIFFERENT institution? "Active" deliberately excludes suspended
// accounts — a suspended user isn't currently a member of anywhere in practice, so re-inviting
// that email to a new institution is allowed rather than permanently locking it out.
import { prisma } from '@/lib/prisma';
import { resolveAcceptInviteAssignment } from '@/lib/invite-accept-decision';

export const CROSS_INSTITUTION_ERROR = 'This email is already associated with another institution.';

export async function isEmailActiveElsewhere(email: string, institutionId: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { institutionId: true, suspendedAt: true },
  });
  return resolveAcceptInviteAssignment(existing, institutionId).blocked;
}
