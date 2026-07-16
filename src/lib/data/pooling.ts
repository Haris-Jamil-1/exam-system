'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { getAccessibleBankIds } from './item-banks';
import type { Prisma } from '@/generated/prisma/client';
import { InsufficientPoolError } from './pooling-errors';

export interface CloPoolRow {
  cloId: string;
  cloCode: string | null;
  cloText: string;
  available: number;
}

// A Prisma delegate that works both as the top-level client and as an interactive
// transaction's client — materializePooledQuestions is always called from inside
// POST /api/attempts' transaction (see route.ts) so the insufficient-pool check and
// the row inserts are atomic with the attempt-creation race fix.
type PoolingDb = Prisma.TransactionClient | typeof prisma;

async function getInstitutionId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (user?.user_metadata?.institutionId as string | undefined) ?? null;
}

/**
 * For the exam-builder Blueprint Matrix: every distinct CLO among approved items in the given
 * banks, with how many approved items are available to draw from for each. `bankIds` is
 * intersected with the caller's own accessible banks — a teacher can't build a blueprint
 * against a bank they can't read, even if they somehow pass its id.
 */
export async function getCloPoolCounts(bankIds: string[]): Promise<CloPoolRow[]> {
  if (bankIds.length === 0) return [];
  const accessible = new Set(await getAccessibleBankIds());
  const scopedBankIds = bankIds.filter(id => accessible.has(id));
  if (scopedBankIds.length === 0) return [];

  const grouped = await prisma.item.groupBy({
    by: ['learningObjectiveId'],
    where: { bankId: { in: scopedBankIds }, status: 'approved', learningObjectiveId: { not: null } },
    _count: { _all: true },
  });
  if (grouped.length === 0) return [];

  const cloIds = grouped.map(g => g.learningObjectiveId!).filter(Boolean);
  const clos = await prisma.learningObjective.findMany({ where: { id: { in: cloIds } } });
  const cloById = new Map(clos.map(c => [c.id, c]));

  return grouped
    .map(g => {
      const clo = cloById.get(g.learningObjectiveId!);
      if (!clo) return null;
      return { cloId: clo.id, cloCode: clo.code, cloText: clo.text, available: g._count._all };
    })
    .filter((r): r is CloPoolRow => r !== null);
}

/**
 * Every bank the caller can at least read, for the blueprint's bank multi-select — reuses
 * the same three-tab categorization as the Item Bank dashboard so the picker matches what
 * the teacher already sees there.
 */
export async function getBanksForBlueprint(): Promise<{ id: string; name: string }[]> {
  const institutionId = await getInstitutionId();
  if (!institutionId) return [];
  const ids = await getAccessibleBankIds();
  if (ids.length === 0) return [];
  const banks = await prisma.itemBank.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return banks;
}

/**
 * JIT stratified draw: for each CLO in the blueprint, randomly pick `count` approved items
 * from the given banks (SQL-level ORDER BY RANDOM(), per spec), concatenate every CLO's draw,
 * shuffle the combined set once more, and materialize the result as this one attempt's private
 * Question rows (attemptId set) — invisible to every other attempt of the same exam.
 *
 * Called from POST /api/attempts right after a brand-new attempt is created, on the server,
 * for a student caller — so unlike getCloPoolCounts/getBanksForBlueprint (teacher-facing, RBAC
 * via getAccessibleBankIds), this does NOT check caller bank permissions. It instead
 * independently re-verifies every bankId actually belongs to the exam's own institution,
 * since the caller here has no "accessible banks" concept at all.
 *
 * `db` must be the same interactive-transaction client the caller used to create the
 * ExamAttempt row (see route.ts) — the insufficient-pool check below and every row insert
 * needs to be atomic with attempt creation: if the pool has shrunk since the blueprint was
 * saved, this throws InsufficientPoolError and the whole transaction (attempt included)
 * rolls back, rather than leaving a half-materialized attempt with too few questions.
 */
export async function materializePooledQuestions(
  db: PoolingDb,
  params: {
    examId: string;
    institutionId: string;
    attemptId: string;
    bankIds: string[];
    blueprint: Record<string, number>;
  },
): Promise<void> {
  const { examId, institutionId, attemptId, bankIds, blueprint } = params;
  const entries = Object.entries(blueprint).filter(([, count]) => count > 0);
  if (bankIds.length === 0 || entries.length === 0) return;

  const verifiedBanks = await db.itemBank.findMany({
    where: { id: { in: bankIds }, institutionId },
    select: { id: true },
  });
  const verifiedBankIds = verifiedBanks.map(b => b.id);
  if (verifiedBankIds.length === 0) return;

  // Re-validate the blueprint against the ACTUAL current pool before drawing anything — the
  // approved pool for a CLO can have shrunk (item deleted/unapproved) since the blueprint was
  // saved. A silent under-draw would serve a shorter exam with no signal to anyone; instead
  // fail the whole exam-start attempt clearly if any CLO can no longer satisfy its target.
  const cloIds = entries.map(([cloId]) => cloId);
  const availableCounts = await db.item.groupBy({
    by: ['learningObjectiveId'],
    where: { bankId: { in: verifiedBankIds }, learningObjectiveId: { in: cloIds }, status: 'approved' },
    _count: { _all: true },
  });
  const availableByClo = new Map(availableCounts.map(c => [c.learningObjectiveId as string, c._count._all]));
  const shortfalls = entries
    .map(([cloId, needed]) => ({ cloId, needed, available: availableByClo.get(cloId) ?? 0 }))
    .filter(s => s.available < s.needed);
  if (shortfalls.length > 0) {
    const clos = await db.learningObjective.findMany({
      where: { id: { in: shortfalls.map(s => s.cloId) } },
      select: { id: true, text: true },
    });
    const textByClo = new Map(clos.map(c => [c.id, c.text]));
    throw new InsufficientPoolError(
      shortfalls.map(s => ({ ...s, cloText: textByClo.get(s.cloId) ?? s.cloId })),
    );
  }

  const drawnItemIds: string[] = [];
  for (const [cloId, count] of entries) {
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Item"
      WHERE "bankId" = ANY(${verifiedBankIds})
        AND "learningObjectiveId" = ${cloId}
        AND "status" = 'approved'
      ORDER BY RANDOM()
      LIMIT ${count}
    `;
    drawnItemIds.push(...rows.map(r => r.id));
  }
  if (drawnItemIds.length === 0) return;

  const items = await db.item.findMany({
    where: { id: { in: drawnItemIds } },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  // One more shuffle so the final order isn't grouped by CLO.
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  await Promise.all(
    shuffled.map((item, index) =>
      db.question.create({
        data: {
          examId,
          attemptId,
          // Durable link back to the source bank Item — item-level
          // psychometrics aggregate across administrations through this.
          sourceItemId: item.id,
          type: item.type,
          stem: item.stem,
          marks: item.marks,
          difficulty: item.difficulty,
          order: index + 1,
          required: item.required,
          explanation: item.explanation,
          correctAnswer: item.correctAnswer as object | undefined,
          learningObjectiveId: item.learningObjectiveId,
          codeLanguage: item.codeLanguage,
          starterCode: item.starterCode,
          testCases: item.testCases as object | undefined,
          allowedFileTypes: item.allowedFileTypes,
          maxFileSizeMB: item.maxFileSizeMB,
          timeLimitSeconds: item.timeLimitSeconds,
          options: item.options.length
            ? { create: item.options.map(o => ({ text: o.text, isCorrect: o.isCorrect, order: o.order })) }
            : undefined,
        },
      })
    )
  );
}
