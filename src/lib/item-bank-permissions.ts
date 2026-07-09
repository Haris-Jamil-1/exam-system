// Pure permission logic for Item Banks — deliberately NOT a 'use server' module (Next.js
// requires every export of a 'use server' file to be an async Server Action, and these are
// synchronous pure functions). Both src/lib/data/item-banks.ts and src/lib/data/items.ts
// import from here so there is exactly one place this logic is written.
import type { ItemBankPermissionRole } from '@/types';

export interface CallerContext {
  id: string;
  institutionId: string;
  role: 'admin' | 'teacher' | 'student';
}

export type PrismaBankForPermission = {
  id: string;
  bankLevel: string;
  ownerId: string;
  institutionId: string;
};

// Single source of truth for "what can this caller do with this bank". Every route/data
// function that touches an ItemBank or an Item inside one MUST go through this — do not
// hand-roll an equivalent check elsewhere.
//
// Cross-tenant is a hard, unconditional deny: a bank from another institution resolves to
// `null` no matter the caller's role, before any ownership/role logic is even evaluated.
export function resolveBankPermission(
  bank: PrismaBankForPermission,
  caller: CallerContext,
  accessRole: ItemBankPermissionRole | null,
): ItemBankPermissionRole | null {
  if (bank.institutionId !== caller.institutionId) return null; // cross-tenant: always deny

  // Institution admins have full (owner) oversight over EVERY bank in their own institution,
  // institutional or personal — this matches the admin authority model already established
  // elsewhere in this app (exams, questions: SEC-01..04) where the boundary is the institution,
  // not individual teacher ownership. Concretely, this preserves the pre-existing admin
  // item-review/approval workflow (admin/items/page.tsx), which has always seen every item in
  // the institution regardless of author — personal banks being "private by default" is a
  // teacher-to-teacher boundary, not a teacher-to-admin one.
  if (caller.role === 'admin') return 'owner';

  if (bank.bankLevel === 'institutional') {
    // Teachers only get whatever role was explicitly granted via ItemBankAccess — no implicit access.
    return accessRole;
  }

  // Personal bank: the creator is always owner; everyone else needs an explicit grant.
  if (bank.ownerId === caller.id) return 'owner';
  return accessRole;
}

export function canRead(role: ItemBankPermissionRole | null): boolean {
  return role !== null;
}
export function canEdit(role: ItemBankPermissionRole | null): boolean {
  return role === 'owner' || role === 'editor';
}
export function canManage(role: ItemBankPermissionRole | null): boolean {
  return role === 'owner';
}
