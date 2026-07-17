import { describe, it, expect } from 'vitest';
import { resolveAcceptInviteAssignment } from '@/lib/invite-accept-decision';

describe('resolveAcceptInviteAssignment', () => {
  it('allows a brand-new email (no existing user)', () => {
    const decision = resolveAcceptInviteAssignment(null, 'inst-a');
    expect(decision).toEqual({ blocked: false, movingInstitutions: false });
  });

  it('allows a same-institution existing user (re-invite / role correction)', () => {
    const decision = resolveAcceptInviteAssignment(
      { institutionId: 'inst-a', suspendedAt: null },
      'inst-a',
    );
    expect(decision).toEqual({ blocked: false, movingInstitutions: false });
  });

  it('blocks an ACTIVE member of a different institution (Task 4)', () => {
    const decision = resolveAcceptInviteAssignment(
      { institutionId: 'inst-b', suspendedAt: null },
      'inst-a',
    );
    expect(decision).toEqual({ blocked: true });
  });

  it('allows a SUSPENDED member of a different institution to move, and flags the move', () => {
    const decision = resolveAcceptInviteAssignment(
      { institutionId: 'inst-b', suspendedAt: new Date('2026-01-01') },
      'inst-a',
    );
    expect(decision).toEqual({ blocked: false, movingInstitutions: true });
  });

  it('does not flag movingInstitutions for a same-institution suspended user', () => {
    const decision = resolveAcceptInviteAssignment(
      { institutionId: 'inst-a', suspendedAt: new Date('2026-01-01') },
      'inst-a',
    );
    expect(decision).toEqual({ blocked: false, movingInstitutions: false });
  });
});
