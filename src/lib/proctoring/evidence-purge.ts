// Evidence retention, attempt-scoped: proctoring snapshots/audio clips are private and
// only ever needed while the exam is still being reviewed live. Rather than wait for the
// 30-day cron (src/app/api/cron/purge-evidence — kept as a safety net for anything that
// slips through, e.g. an attempt abandoned mid-exam with no finalization call at all), this
// purges an attempt's evidence media immediately once that attempt is finalized — the
// Violation rows themselves are kept (audit trail), only the storage object + screenshotUrl
// path are cleared.
import { prisma } from '@/lib/prisma';
import { adminSupabase } from '@/lib/supabase/admin';

const BUCKET = 'exam-uploads';

export async function purgeAttemptEvidence(attemptId: string): Promise<void> {
  const rows = await prisma.violation.findMany({
    where: { attemptId, screenshotUrl: { not: null } },
    select: { id: true, screenshotUrl: true },
  });
  if (rows.length === 0) return;

  const paths = rows
    .map(r => r.screenshotUrl)
    .filter((p): p is string => p !== null && !p.startsWith('http'));
  if (paths.length > 0) {
    await adminSupabase.storage.from(BUCKET).remove(paths);
  }

  await prisma.violation.updateMany({
    where: { id: { in: rows.map(r => r.id) } },
    data: { screenshotUrl: null },
  });
}
