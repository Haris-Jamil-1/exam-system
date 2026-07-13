import { describe, it, expect } from 'vitest';
import {
  canManageClass, canRemoveEnrollment, canDeactivateUser,
  type CallerContext, type PrismaClassForPermission, type UserForDeactivation,
} from '@/lib/class-permissions';

// Class management and account deactivation are the two new authority boundaries this session —
// cross-tenant and self-protection cases get an explicit test each, matching the standard set by
// item-bank-permissions.test.ts.

const INSTITUTION_A = 'inst-a';
const INSTITUTION_B = 'inst-b';

function cls(overrides: Partial<PrismaClassForPermission> = {}): PrismaClassForPermission {
  return { teacherId: 'teacher-1', institutionId: INSTITUTION_A, ...overrides };
}

function caller(overrides: Partial<CallerContext> = {}): CallerContext {
  return { id: 'teacher-1', institutionId: INSTITUTION_A, role: 'teacher', ...overrides };
}

describe('canManageClass — cross-tenant boundary', () => {
  it('denies an admin from another institution outright', () => {
    const c = cls();
    const admin = caller({ id: 'admin-b', institutionId: INSTITUTION_B, role: 'admin' });
    expect(canManageClass(c, admin)).toBe(false);
  });

  it('denies a teacher from another institution even if the teacherId happens to match', () => {
    const c = cls({ teacherId: 'shared-id', institutionId: INSTITUTION_A });
    const attacker = caller({ id: 'shared-id', institutionId: INSTITUTION_B, role: 'teacher' });
    expect(canManageClass(c, attacker)).toBe(false);
  });
});

describe('canManageClass — admin authority within their own institution', () => {
  it('grants admin management of a class they do not teach', () => {
    const c = cls({ teacherId: 'some-teacher' });
    const admin = caller({ id: 'admin-a', role: 'admin' });
    expect(canManageClass(c, admin)).toBe(true);
  });
});

describe('canManageClass — teacher ownership', () => {
  it('grants the owning teacher management', () => {
    const c = cls({ teacherId: 'teacher-1' });
    expect(canManageClass(c, caller({ id: 'teacher-1' }))).toBe(true);
  });

  it('denies a different teacher in the same institution with no ownership', () => {
    const c = cls({ teacherId: 'teacher-1' });
    expect(canManageClass(c, caller({ id: 'teacher-2' }))).toBe(false);
  });
});

describe('canRemoveEnrollment', () => {
  it('follows the exact same rule as canManageClass', () => {
    const c = cls({ teacherId: 'teacher-1' });
    expect(canRemoveEnrollment(c, caller({ id: 'teacher-1' }))).toBe(true);
    expect(canRemoveEnrollment(c, caller({ id: 'teacher-2' }))).toBe(false);
    expect(canRemoveEnrollment(c, caller({ id: 'admin-a', role: 'admin' }))).toBe(true);
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
