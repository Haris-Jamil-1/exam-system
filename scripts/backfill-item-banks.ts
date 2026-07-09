/**
 * One-time (idempotent) backfill for the Item Bank RBAC migration: every
 * `Item` row created before `Item.bankId` existed has `bankId = null`. This
 * assigns each institution's orphaned items to a single default
 * INSTITUTIONAL bank ("Legacy Items") so nothing is left un-owned once the
 * app starts requiring bank-scoped permission checks to read/write items.
 *
 * Safe to re-run: only touches items with bankId = null, and reuses an
 * existing "Legacy Items" bank for an institution if one was already created.
 *
 * Run: npx tsx scripts/backfill-item-banks.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local', override: true });
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const institutionIds = await prisma.item.findMany({
    where: { bankId: null },
    select: { institutionId: true },
    distinct: ['institutionId'],
  });

  for (const { institutionId } of institutionIds) {
    let bank = await prisma.itemBank.findFirst({
      where: { institutionId, bankLevel: 'institutional', name: 'Legacy Items' },
    });
    if (!bank) {
      bank = await prisma.itemBank.create({
        data: {
          name: 'Legacy Items',
          description: 'Items created before Item Banks existed, auto-migrated here.',
          bankLevel: 'institutional',
          ownerId: institutionId,
          institutionId,
        },
      });
      console.log('Created bank', bank.id, 'for institution', institutionId);
    }
    const { count } = await prisma.item.updateMany({
      where: { institutionId, bankId: null },
      data: { bankId: bank.id },
    });
    console.log(`  backfilled ${count} item(s) into ${bank.id}`);
  }

  if (institutionIds.length === 0) console.log('Nothing to backfill.');
}

main().finally(() => prisma.$disconnect());
