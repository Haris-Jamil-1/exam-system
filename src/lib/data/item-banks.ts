'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import type { ItemBank, ItemBankLevel, ItemBankPermissionRole, ItemBankCollaborator } from '@/types';
import { resolveBankPermission, canRead, canManage, type CallerContext, type PrismaBankForPermission } from '@/lib/item-bank-permissions';

// ── Caller resolution ──────────────────────────────────────────────────────────

async function getCaller(): Promise<CallerContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const row = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  if (!row) return null;
  return { id: row.id, institutionId: row.institutionId, role: row.role as CallerContext['role'] };
}

async function getBankPermission(bankId: string, caller: CallerContext): Promise<{
  bank: PrismaBankForPermission & { name: string };
  role: ItemBankPermissionRole | null;
} | null> {
  const bank = await prisma.itemBank.findUnique({
    where: { id: bankId },
    select: { id: true, name: true, bankLevel: true, ownerId: true, institutionId: true },
  });
  if (!bank) return null;
  // Still institution-scope the access lookup itself — irrelevant once bank.institutionId
  // mismatches (resolveBankPermission denies it), but avoids leaking a cross-tenant access row.
  const access = bank.institutionId === caller.institutionId
    ? await prisma.itemBankAccess.findUnique({
        where: { bankId_userId: { bankId, userId: caller.id } },
        select: { permissionRole: true },
      })
    : null;
  const role = resolveBankPermission(bank, caller, (access?.permissionRole as ItemBankPermissionRole | undefined) ?? null);
  return { bank, role };
}

// ── Mapping ──────────────────────────────────────────────────────────────────

type PrismaItemBank = {
  id: string; name: string; description: string | null; bankLevel: string;
  ownerId: string; institutionId: string; createdAt: Date; updatedAt: Date;
  _count?: { items: number };
};

function mapBank(b: PrismaItemBank, myRole?: ItemBankPermissionRole | null): ItemBank {
  return {
    id: b.id,
    name: b.name,
    description: b.description ?? undefined,
    bankLevel: b.bankLevel as ItemBankLevel,
    ownerId: b.ownerId,
    institutionId: b.institutionId,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    itemCount: b._count?.items,
    myRole: myRole ?? undefined,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

/** Institution-level banks visible to the caller: every institutional bank in their own institution. */
export async function getInstitutionBanks(): Promise<ItemBank[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const rows = await prisma.itemBank.findMany({
    where: { institutionId: caller.institutionId, bankLevel: 'institutional' },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const accessRows = await prisma.itemBankAccess.findMany({
    where: { userId: caller.id, bankId: { in: rows.map(r => r.id) } },
    select: { bankId: true, permissionRole: true },
  });
  const accessByBank = new Map(accessRows.map(a => [a.bankId, a.permissionRole as ItemBankPermissionRole]));
  return rows
    .map(r => {
      const role = resolveBankPermission(r, caller, accessByBank.get(r.id) ?? null);
      return canRead(role) ? mapBank(r, role) : null;
    })
    .filter((b): b is ItemBank => b !== null);
}

/** Personal banks the caller owns. */
export async function getMyPrivateBanks(): Promise<ItemBank[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const rows = await prisma.itemBank.findMany({
    where: { institutionId: caller.institutionId, bankLevel: 'personal', ownerId: caller.id },
    include: { _count: { select: { items: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(r => mapBank(r, 'owner'));
}

/** Personal banks owned by someone else, shared with the caller via ItemBankAccess. */
export async function getSharedWithMeBanks(): Promise<ItemBank[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const accessRows = await prisma.itemBankAccess.findMany({
    where: { userId: caller.id },
    select: { bankId: true, permissionRole: true },
  });
  if (accessRows.length === 0) return [];
  const roleByBank = new Map(accessRows.map(a => [a.bankId, a.permissionRole as ItemBankPermissionRole]));
  const rows = await prisma.itemBank.findMany({
    where: {
      id: { in: accessRows.map(a => a.bankId) },
      institutionId: caller.institutionId, // cross-tenant guard even if an access row somehow existed
      bankLevel: 'personal',
      ownerId: { not: caller.id }, // don't duplicate "my private banks"
    },
    include: { _count: { select: { items: true } } },
  });
  return rows.map(r => mapBank(r, roleByBank.get(r.id) ?? null));
}

export async function getItemBankById(bankId: string): Promise<ItemBank | undefined> {
  const caller = await getCaller();
  if (!caller) return undefined;
  const result = await getBankPermission(bankId, caller);
  if (!result || !canRead(result.role)) return undefined;
  const bank = await prisma.itemBank.findUnique({
    where: { id: bankId },
    include: { _count: { select: { items: true } } },
  });
  return bank ? mapBank(bank, result.role) : undefined;
}

export async function createItemBank(data: {
  name: string;
  description?: string;
  bankLevel: ItemBankLevel;
}): Promise<ItemBank> {
  const caller = await getCaller();
  if (!caller) throw new Error('Unauthorized');
  if (data.bankLevel === 'institutional' && caller.role !== 'admin') {
    throw new Error('Forbidden: only institution admins can create institutional banks');
  }
  const ownerId = data.bankLevel === 'institutional' ? caller.institutionId : caller.id;
  const bank = await prisma.itemBank.create({
    data: {
      name: data.name,
      description: data.description ?? null,
      bankLevel: data.bankLevel,
      ownerId,
      institutionId: caller.institutionId,
    },
    include: { _count: { select: { items: true } } },
  });
  return mapBank(bank, 'owner');
}

export async function updateItemBank(bankId: string, data: { name?: string; description?: string }): Promise<ItemBank | undefined> {
  const caller = await getCaller();
  if (!caller) throw new Error('Unauthorized');
  const result = await getBankPermission(bankId, caller);
  if (!result) return undefined;
  if (!canManage(result.role)) throw new Error('Forbidden');
  const bank = await prisma.itemBank.update({
    where: { id: bankId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description ?? null }),
    },
    include: { _count: { select: { items: true } } },
  });
  return mapBank(bank, result.role);
}

export async function deleteItemBank(bankId: string): Promise<boolean> {
  const caller = await getCaller();
  if (!caller) throw new Error('Unauthorized');
  const result = await getBankPermission(bankId, caller);
  if (!result) return false;
  if (!canManage(result.role)) throw new Error('Forbidden');
  await prisma.$transaction([
    prisma.item.updateMany({ where: { bankId }, data: { bankId: null } }),
    prisma.itemBankAccess.deleteMany({ where: { bankId } }),
    prisma.itemBank.delete({ where: { id: bankId } }),
  ]);
  return true;
}

// ── Collaborators ────────────────────────────────────────────────────────────

export async function getCollaborators(bankId: string): Promise<ItemBankCollaborator[]> {
  const caller = await getCaller();
  if (!caller) return [];
  const result = await getBankPermission(bankId, caller);
  if (!result || !canRead(result.role)) return [];
  const rows = await prisma.itemBankAccess.findMany({
    where: { bankId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(r => ({
    id: r.id,
    bankId: r.bankId,
    userId: r.userId,
    userName: r.user.name,
    userEmail: r.user.email,
    permissionRole: r.permissionRole as ItemBankPermissionRole,
    assignedById: r.assignedById,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addCollaborator(
  bankId: string,
  userId: string,
  permissionRole: Exclude<ItemBankPermissionRole, 'owner'>,
): Promise<ItemBankCollaborator> {
  const caller = await getCaller();
  if (!caller) throw new Error('Unauthorized');
  const result = await getBankPermission(bankId, caller);
  if (!result) throw new Error('Not found');
  if (!canManage(result.role)) throw new Error('Forbidden');

  // The target user must belong to the SAME institution as the bank — this is the
  // exact cross-tenant class of bug that's been fixed elsewhere in this app before.
  const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { institutionId: true, name: true, email: true } });
  if (!targetUser || targetUser.institutionId !== result.bank.institutionId) {
    throw new Error('Forbidden: user is not in this institution');
  }
  if (userId === result.bank.ownerId) {
    throw new Error('That user already owns this bank');
  }

  const row = await prisma.itemBankAccess.upsert({
    where: { bankId_userId: { bankId, userId } },
    create: { bankId, userId, permissionRole, assignedById: caller.id },
    update: { permissionRole, assignedById: caller.id },
  });
  return {
    id: row.id, bankId: row.bankId, userId: row.userId,
    userName: targetUser.name, userEmail: targetUser.email,
    permissionRole: row.permissionRole as ItemBankPermissionRole,
    assignedById: row.assignedById, createdAt: row.createdAt.toISOString(),
  };
}

export async function removeCollaborator(bankId: string, userId: string): Promise<boolean> {
  const caller = await getCaller();
  if (!caller) throw new Error('Unauthorized');
  const result = await getBankPermission(bankId, caller);
  if (!result) return false;
  if (!canManage(result.role)) throw new Error('Forbidden');
  await prisma.itemBankAccess.deleteMany({ where: { bankId, userId } });
  return true;
}

// ── Exported permission checks for other data-layer modules (items.ts, ai routes) ──

export async function getCallerAndBankPermission(bankId: string): Promise<{
  caller: CallerContext;
  role: ItemBankPermissionRole | null;
  bank: PrismaBankForPermission;
} | null> {
  const caller = await getCaller();
  if (!caller) return null;
  const result = await getBankPermission(bankId, caller);
  if (!result) return null;
  return { caller, role: result.role, bank: result.bank };
}

/** Every bank ID the caller can at least read — institutional (admin: all in-institution;
 * teacher: only those explicitly granted), owned personal banks, and personal banks shared
 * with them. Used to scope cross-bank item queries (e.g. the exam-wizard question picker). */
export async function getAccessibleBankIds(): Promise<string[]> {
  const caller = await getCaller();
  if (!caller) return [];

  if (caller.role === 'admin') {
    // Full oversight over every bank in their own institution — see resolveBankPermission
    // for why (matches the pre-existing admin item-review workflow's expectations).
    const allBanks = await prisma.itemBank.findMany({
      where: { institutionId: caller.institutionId },
      select: { id: true },
    });
    return allBanks.map(b => b.id);
  }

  const accessRows = await prisma.itemBankAccess.findMany({
    where: { userId: caller.id },
    select: { bankId: true },
  });
  const personalOwned = await prisma.itemBank.findMany({
    where: { institutionId: caller.institutionId, bankLevel: 'personal', ownerId: caller.id },
    select: { id: true },
  });

  const ids = new Set<string>();
  personalOwned.forEach(b => ids.add(b.id));
  accessRows.forEach(a => ids.add(a.bankId)); // includes granted institutional + shared personal banks

  if (ids.size === 0) return [];
  // Defense-in-depth: re-verify every candidate id actually belongs to the caller's own
  // institution before returning it, even though addCollaborator already enforces this at
  // grant time — this is the query that ends up scoping what items an exam wizard can pull in.
  const verified = await prisma.itemBank.findMany({
    where: { id: { in: Array.from(ids) }, institutionId: caller.institutionId },
    select: { id: true },
  });
  return verified.map(b => b.id);
}
