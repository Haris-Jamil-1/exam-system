import { prisma } from '@/lib/prisma';

// Per-institution monthly AI-call ceiling (Phase 3, decision 5): default 1000
// calls/month (Institution.aiMonthlyQuota), usage counter with a hard stop.
// One "call" = one Claude API invocation (a generation batch = 1 call; an
// essay grading = 1 call per answer). Full billing dashboard is out of scope
// for v1 — this is the counter and the stop.

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // e.g. "2026-07"
}

export class AiQuotaExceededError extends Error {
  constructor(public readonly used: number, public readonly quota: number) {
    super(`AI quota exceeded: ${used}/${quota} calls this month`);
    this.name = 'AiQuotaExceededError';
  }
}

/** Roll both usage counters over when the month changes (no-op otherwise). */
async function rolloverMonth(institutionId: string, month: string): Promise<void> {
  await prisma.institution.updateMany({
    where: { id: institutionId, NOT: { aiUsageMonth: month } },
    data: { aiUsageMonth: month, aiUsageCount: 0, judgeUsageCount: 0 },
  });
}

/**
 * Atomically consume `calls` from the institution's monthly AI quota.
 * Throws AiQuotaExceededError when the quota would be exceeded (hard stop —
 * nothing is consumed in that case). Resets the counter when the month rolls.
 */
export async function consumeAiQuota(institutionId: string, calls = 1): Promise<void> {
  await rolloverMonth(institutionId, currentMonth());

  // Guarded atomic increment: only succeeds while under quota.
  const result = await prisma.$executeRaw`
    UPDATE "Institution"
    SET "aiUsageCount" = "aiUsageCount" + ${calls}
    WHERE id = ${institutionId} AND "aiUsageCount" + ${calls} <= "aiMonthlyQuota"
  `;

  if (result === 0) {
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { aiUsageCount: true, aiMonthlyQuota: true },
    });
    throw new AiQuotaExceededError(inst?.aiUsageCount ?? 0, inst?.aiMonthlyQuota ?? 0);
  }
}

/**
 * Same mechanism for hosted Judge0 submissions (follow-up task 1) — one count
 * per test-case submission, the pay-per-use billing unit.
 */
export async function consumeJudgeQuota(institutionId: string, submissions = 1): Promise<void> {
  await rolloverMonth(institutionId, currentMonth());

  const result = await prisma.$executeRaw`
    UPDATE "Institution"
    SET "judgeUsageCount" = "judgeUsageCount" + ${submissions}
    WHERE id = ${institutionId} AND "judgeUsageCount" + ${submissions} <= "judgeMonthlyQuota"
  `;

  if (result === 0) {
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { judgeUsageCount: true, judgeMonthlyQuota: true },
    });
    throw new AiQuotaExceededError(inst?.judgeUsageCount ?? 0, inst?.judgeMonthlyQuota ?? 0);
  }
}
