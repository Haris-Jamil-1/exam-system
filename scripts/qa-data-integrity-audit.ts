/**
 * DAT-01 / DAT-02 — one-off, REPORT-ONLY audit. Never writes/rewrites data.
 *
 * DAT-01: recomputes every mcq/true_false Answer against the CURRENT scoring
 * logic (src/lib/scoring.ts, id-based option lookup) and flags any stored
 * row that disagrees — these are candidates for having been scored under
 * the pre-2026-06-25 text-comparison bug.
 *
 * DAT-02: looks for FK/cascade risk — attempts/violations attached to exams,
 * to catch the Restrict-vs-Cascade gaps noted in QA_CHECKLIST.md.
 *
 * Run: npx tsx scripts/qa-data-integrity-audit.ts
 * Requires TEST_DATABASE_URL (or, for a real historical audit against actual
 * user data, this would need to run against prod read-only credentials —
 * NOT attempted in this pass; see QA_RESULTS.md).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { assertNonProd } from '../tests/fixtures/guard-non-prod';

assertNonProd();

const adapter = new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function auditMcqTrueFalseScoring() {
  const answers = await prisma.answer.findMany({
    where: { question: { type: { in: ['mcq', 'true_false'] } } },
    include: { question: { include: { options: true } }, attempt: { select: { submittedAt: true } } },
  });

  const flagged: { answerId: string; questionId: string; submittedAt: Date | null; stored: boolean | null; recomputed: boolean }[] = [];

  for (const a of answers) {
    const response = a.response as unknown;
    const selectedOptionId = typeof response === 'string' ? response : undefined;
    const selectedOpt = a.question.options.find(o => o.id === selectedOptionId);
    const recomputedCorrect = selectedOpt?.isCorrect === true;
    if (a.isCorrect !== recomputedCorrect) {
      flagged.push({ answerId: a.id, questionId: a.questionId, submittedAt: a.attempt.submittedAt, stored: a.isCorrect, recomputed: recomputedCorrect });
    }
  }

  console.log(`\n=== DAT-01: MCQ/true_false scoring audit ===`);
  console.log(`Checked ${answers.length} answers. Flagged ${flagged.length} disagreeing with current scoring logic.`);
  if (flagged.length > 0) {
    console.log('DO NOT auto-fix these — report to a human for a decision on whether affected students should be re-notified:');
    console.table(flagged);
  }
}

async function auditOrphanRisk() {
  console.log(`\n=== DAT-02: FK cascade risk check ===`);
  const examsWithAttempts = await prisma.exam.findMany({
    where: { attempts: { some: {} } },
    select: { id: true, title: true, _count: { select: { attempts: true, violations: true } } },
  });
  console.log(`${examsWithAttempts.length} exams currently have >=1 attempt (ExamAttempt.exam has no onDelete — deleting these via a raw DB client, bypassing app code, would fail or orphan rows depending on Restrict enforcement):`);
  console.table(examsWithAttempts.map(e => ({ examId: e.id, title: e.title, attempts: e._count.attempts, violations: e._count.violations })));
}

async function main() {
  await auditMcqTrueFalseScoring();
  await auditOrphanRisk();
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
