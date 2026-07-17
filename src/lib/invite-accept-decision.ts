// Pure decision logic for accepting an institution-level or class-level invite when the
// invitee's email already has a Prisma User row. Extracted out of the two accept routes
// (api/invites/accept/[token], api/class-invites/accept/[token]) so the "block cross-institution,
// but let a suspended-elsewhere account move and un-suspend" rule is defined in exactly one place
// and is directly unit-testable without mocking Supabase/Prisma — same pattern this codebase uses
// elsewhere (e.g. exam-start-errors.ts) for keeping route handlers thin wrappers around tested logic.

export type ExistingUserForAccept = { institutionId: string; suspendedAt: Date | null } | null;

export type AcceptInviteDecision =
  | { blocked: true }
  | { blocked: false; movingInstitutions: boolean };

export function resolveAcceptInviteAssignment(
  existingUser: ExistingUserForAccept,
  inviteInstitutionId: string,
): AcceptInviteDecision {
  if (!existingUser || existingUser.institutionId === inviteInstitutionId) {
    return { blocked: false, movingInstitutions: false };
  }
  // Different institution: only allowed through if the existing membership isn't active there.
  if (existingUser.suspendedAt) {
    return { blocked: false, movingInstitutions: true };
  }
  return { blocked: true };
}
