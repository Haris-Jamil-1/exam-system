import { describe, it, expect } from 'vitest';
import {
  resolveClassPermission, canReadClass, canEditClassRoster, canManageClassAccess, canDeactivateUser,
  type CallerContext, type PrismaClassForTenancy, type UserForDeactivation,
} from '@/lib/class-permissions';

// Class management and account deactivation are two of the authority boundaries in this file —
// cross-tenant and self-protection cases get an explicit test each, matching the standard set by
// item-bank-permissions.test.ts. resolveClassPermission mirrors resolveBankPermission's own test
// shape (cross-tenant deny, admin-owns-everything, personal-owner, institutional-needs-a-grant).

const INSTITUTION_A = 'inst-a';
const INSTITUTION_B = 'inst-b';

function cls(overrides: Partial<PrismaClassForTenancy> = {}): PrismaClassForTenancy {
  return { id: 'class-1', teacherId: 'teacher-1', institutionId: INSTITUTION_A, classLevel: 'personal', ownerId: 'teacher-1', ...overrides };
}

function caller(overrides: Partial<CallerContext> = {}): CallerContext {
  return { id: 'teacher-1', institutionId: INSTITUTION_A, role: 'teacher', ...overrides };
}

describe('resolveClassPermission — cross-tenant boundary', () => {
  it('denies an admin from another institution outright', () => {
    const c = cls();
    const admin = caller({ id: 'admin-b', institutionId: INSTITUTION_B, role: 'admin' });
    expect(resolveClassPermission(c, admin, null)).toBeNull();
  });

  it('denies a teacher from another institution even if the ownerId happens to match', () => {
    const c = cls({ ownerId: 'shared-id', institutionId: INSTITUTION_A });
    const attacker = caller({ id: 'shared-id', institutionId: INSTITUTION_B, role: 'teacher' });
    expect(resolveClassPermission(c, attacker, null)).toBeNull();
  });
});

describe('resolveClassPermission — admin authority within their own institution', () => {
  it('grants admin owner-level access to a personal class they do not own', () => {
    const c = cls({ ownerId: 'some-teacher' });
    const admin = caller({ id: 'admin-a', role: 'admin' });
    expect(resolveClassPermission(c, admin, null)).toBe('owner');
  });

  it('grants admin owner-level access to an institutional class with no explicit grant', () => {
    const c = cls({ classLevel: 'institutional', ownerId: INSTITUTION_A });
    const admin = caller({ id: 'admin-a', role: 'admin' });
    expect(resolveClassPermission(c, admin, null)).toBe('owner');
  });
});

describe('resolveClassPermission — personal class ownership', () => {
  it('grants the owning teacher owner-level access', () => {
    const c = cls({ ownerId: 'teacher-1' });
    expect(resolveClassPermission(c, caller({ id: 'teacher-1' }), null)).toBe('owner');
  });

  it('denies a different teacher in the same institution with no grant', () => {
    const c = cls({ ownerId: 'teacher-1' });
    expect(resolveClassPermission(c, caller({ id: 'teacher-2' }), null)).toBeNull();
  });

  it('grants exactly the explicitly-shared role to a non-owning teacher', () => {
    const c = cls({ ownerId: 'teacher-1' });
    expect(resolveClassPermission(c, caller({ id: 'teacher-2' }), 'editor')).toBe('editor');
    expect(resolveClassPermission(c, caller({ id: 'teacher-2' }), 'viewer')).toBe('viewer');
  });
});

describe('resolveClassPermission — institutional class needs an explicit grant', () => {
  it('denies a teacher with no ClassAccess row, even in their own institution', () => {
    const c = cls({ classLevel: 'institutional', ownerId: INSTITUTION_A });
    expect(resolveClassPermission(c, caller({ id: 'teacher-2' }), null)).toBeNull();
  });

  it('grants exactly the explicitly-shared role once granted', () => {
    const c = cls({ classLevel: 'institutional', ownerId: INSTITUTION_A });
    expect(resolveClassPermission(c, caller({ id: 'teacher-2' }), 'editor')).toBe('editor');
  });
});

describe('canReadClass / canEditClassRoster / canManageClassAccess', () => {
  it('null role can neither read nor edit nor manage', () => {
    expect(canReadClass(null)).toBe(false);
    expect(canEditClassRoster(null)).toBe(false);
    expect(canManageClassAccess(null)).toBe(false);
  });

  it('viewer can read but not edit the roster or manage access', () => {
    expect(canReadClass('viewer')).toBe(true);
    expect(canEditClassRoster('viewer')).toBe(false);
    expect(canManageClassAccess('viewer')).toBe(false);
  });

  it('editor can read and edit the roster but not manage access (rename/archive/share)', () => {
    expect(canReadClass('editor')).toBe(true);
    expect(canEditClassRoster('editor')).toBe(true);
    expect(canManageClassAccess('editor')).toBe(false);
  });

  it('owner can do everything', () => {
    expect(canReadClass('owner')).toBe(true);
    expect(canEditClassRoster('owner')).toBe(true);
    expect(canManageClassAccess('owner')).toBe(true);
  });
});

function deactivationUser(overrides: Partial<UserForDeactivation> = {}): UserForDeactivation {
  return { id: 'user-1', institutionId: INSTITUTION_A, role: 'teacher', isSuperAdmin: false, ...overrides };
}

describe('canDeactivateUser', () => {
  it('allows an admin to deactivate a teacher in their own institution', () => {
    const admin = deactivationUser({ id: 'admin-a', role: 'admin' });
    const teacher = deactivationUser({ id: 'teacher-1', role: 'teacher' });
    expect(canDeactivateUser(admin, teacher)).toBe(true);
  });

  it('allows an admin to deactivate a student in their own institution', () => {
    const admin = deactivationUser({ id: 'admin-a', role: 'admin' });
    const student = deactivationUser({ id: 'student-1', role: 'student' });
    expect(canDeactivateUser(admin, student)).toBe(true);
  });

  it('denies a non-admin caller entirely', () => {
    const teacher = deactivationUser({ id: 'teacher-1', role: 'teacher' });
    const target = deactivationUser({ id: 'student-1', role: 'student' });
    expect(canDeactivateUser(teacher, target)).toBe(false);
  });

  it('denies cross-institution deactivation', () => {
    const admin = deactivationUser({ id: 'admin-a', role: 'admin', institutionId: INSTITUTION_A });
    const target = deactivationUser({ id: 'teacher-1', role: 'teacher', institutionId: INSTITUTION_B });
    expect(canDeactivateUser(admin, target)).toBe(false);
  });

  it('denies targeting another admin, even within the same institution', () => {
    const admin = deactivationUser({ id: 'admin-a', role: 'admin' });
    const otherAdmin = deactivationUser({ id: 'admin-b', role: 'admin' });
    expect(canDeactivateUser(admin, otherAdmin)).toBe(false);
  });

  it('denies targeting a super admin, even one whose role field reads teacher/student', () => {
    const admin = deactivationUser({ id: 'admin-a', role: 'admin' });
    const superTeacher = deactivationUser({ id: 'super-1', role: 'teacher', isSuperAdmin: true });
    expect(canDeactivateUser(admin, superTeacher)).toBe(false);
  });

  it('denies self-deactivation', () => {
    const admin = deactivationUser({ id: 'admin-a', role: 'admin' });
    expect(canDeactivateUser(admin, admin)).toBe(false);
  });
});
