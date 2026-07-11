'use server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { getAccessibleBankIds } from './item-banks';

export interface CloPoolRow {
  cloId: string;
  cloCode: string | null;
  cloText: string;
  available: number;
}

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
 */
export async function materializePooledQuestions(params: {
  examId: string;
  institutionId: string;
  attemptId: string;
  bankIds: string[];
  blueprint: Record<string, number>;
}): Promise<void> {
  const { examId, institutionId, attemptId, bankIds, blueprint } = params;
  const entries = Object.entries(blueprint).filter(([, count]) => count > 0);
  if (bankIds.length === 0 || entries.length === 0) return;

  const verifiedBanks = await prisma.itemBank.findMany({
    where: { id: { in: bankIds }, institutionId },
    select: { id: true },
  });
  const verifiedBankIds = verifiedBanks.map(b => b.id);
  if (verifiedBankIds.length === 0) return;

  const drawnItemIds: string[] = [];
  for (const [cloId, count] of entries) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
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

  const items = await prisma.item.findMany({
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
      prisma.question.create({
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
