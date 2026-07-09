import { describe, it, expect } from 'vitest';
import { resolveBankPermission, canRead, canEdit, canManage, type CallerContext, type PrismaBankForPermission } from '@/lib/item-bank-permissions';

// This is the single permission function every Item Bank route/data function goes through.
// Cross-tenant correctness here is the highest-stakes piece of this session's RBAC work —
// this app has previously shipped and fixed cross-tenant IDOR bugs on exams/questions
// (SEC-01..04), so every branch of resolveBankPermission gets an explicit case.

const INSTITUTION_A = 'inst-a';
const INSTITUTION_B = 'inst-b';

function institutionalBank(overrides: Partial<PrismaBankForPermission> = {}): PrismaBankForPermission {
  return { id: 'bank-1', bankLevel: 'institutional', ownerId: INSTITUTION_A, institutionId: INSTITUTION_A, ...overrides };
}

function personalBank(ownerId: string, overrides: Partial<PrismaBankForPermission> = {}): PrismaBankForPermission {
  return { id: 'bank-2', bankLevel: 'personal', ownerId, institutionId: INSTITUTION_A, ...overrides };
}

function user(overrides: Partial<CallerContext> = {}): CallerContext {
  return { id: 'user-1', institutionId: INSTITUTION_A, role: 'teacher', ...overrides };
}

describe('resolveBankPermission — cross-tenant boundary', () => {
  it('denies an admin from another institution outright, even for an institutional bank', () => {
    const bank = institutionalBank();
    const admin = user({ id: 'admin-b', institutionId: INSTITUTION_B, role: 'admin' });
    expect(resolveBankPermission(bank, admin, null)).toBeNull();
  });

  it('denies a teacher from another institution even with a (hypothetical, stale) access grant', () => {
    const bank = personalBank('owner-a');
    const outsider = user({ id: 'outsider', institutionId: INSTITUTION_B, role: 'teacher' });
    // Simulates a stale/forged ItemBankAccess row somehow pointing cross-institution —
    // the function must still deny purely from the institutionId mismatch.
    expect(resolveBankPermission(bank, outsider, 'editor')).toBeNull();
  });

  it('denies a teacher from another institution on their OWN "owned" bank id collision', () => {
    // Adversarial case: bank.ownerId equals caller.id by coincidence, but institutions differ.
    const bank = personalBank('shared-id', { institutionId: INSTITUTION_A });
    const attacker = user({ id: 'shared-id', institutionId: INSTITUTION_B, role: 'teacher' });
    expect(resolveBankPermission(bank, attacker, null)).toBeNull();
  });
});

describe('resolveBankPermission — admin authority within their own institution', () => {
  it('grants admin owner on an institutional bank in their institution', () => {
    const bank = institutionalBank();
    const admin = user({ id: 'admin-a', role: 'admin' });
    expect(resolveBankPermission(bank, admin, null)).toBe('owner');
  });

  it('grants admin owner on a PERSONAL bank they do not own, within their institution', () => {
    // Deliberate: matches the pre-existing admin item-review workflow, which has always
    // seen every item in the institution regardless of author (see the comment in the
    // source file for the full rationale).
    const bank = personalBank('some-teacher');
    const admin = user({ id: 'admin-a', role: 'admin' });
    expect(resolveBankPermission(bank, admin, null)).toBe('owner');
  });
});

describe('resolveBankPermission — institutional banks (teachers)', () => {
  it('denies a teacher with no ItemBankAccess grant (no implicit access)', () => {
    const bank = institutionalBank();
    const teacher = user({ id: 'teacher-x' });
    expect(resolveBankPermission(bank, teacher, null)).toBeNull();
  });

  it('grants exactly the role from the ItemBankAccess row when present', () => {
    const bank = institutionalBank();
    const teacher = user({ id: 'teacher-x' });
    expect(resolveBankPermission(bank, teacher, 'editor')).toBe('editor');
    expect(resolveBankPermission(bank, teacher, 'viewer')).toBe('viewer');
  });
});

describe('resolveBankPermission — personal banks (teacher-to-teacher)', () => {
  it('grants the creator owner even with no access row', () => {
    const bank = personalBank('creator-1');
    const creator = user({ id: 'creator-1' });
    expect(resolveBankPermission(bank, creator, null)).toBe('owner');
  });

  it('denies a non-owner teacher with no grant', () => {
    const bank = personalBank('creator-1');
    const other = user({ id: 'other-teacher' });
    expect(resolveBankPermission(bank, other, null)).toBeNull();
  });

  it('grants a non-owner exactly the granted role, never escalating to owner', () => {
    const bank = personalBank('creator-1');
    const editor = user({ id: 'editor-teacher' });
    expect(resolveBankPermission(bank, editor, 'editor')).toBe('editor');
    const viewer = user({ id: 'viewer-teacher' });
    expect(resolveBankPermission(bank, viewer, 'viewer')).toBe('viewer');
  });
});

describe('canRead / canEdit / canManage — role hierarchy', () => {
  it('owner can read, edit, and manage', () => {
    expect(canRead('owner')).toBe(true);
    expect(canEdit('owner')).toBe(true);
    expect(canManage('owner')).toBe(true);
  });

  it('editor can read and edit, but not manage', () => {
    expect(canRead('editor')).toBe(true);
    expect(canEdit('editor')).toBe(true);
    expect(canManage('editor')).toBe(false);
  });

  it('viewer can only read', () => {
    expect(canRead('viewer')).toBe(true);
    expect(canEdit('viewer')).toBe(false);
    expect(canManage('viewer')).toBe(false);
  });

  it('null (no access) can do nothing', () => {
    expect(canRead(null)).toBe(false);
    expect(canEdit(null)).toBe(false);
    expect(canManage(null)).toBe(false);
  });
});
