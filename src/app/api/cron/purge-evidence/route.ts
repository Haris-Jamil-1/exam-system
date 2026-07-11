import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { adminSupabase } from '@/lib/supabase/admin';

// Evidence retention (Phase 3, decision 1): proctoring snapshots are kept 30
// days, then purged — storage object deleted, screenshotUrl nulled (the
// violation row itself is kept; only the media is retention-limited).
// Invoked by Vercel cron (vercel.json); requires CRON_SECRET when set.

const RETENTION_DAYS = 30;
const BUCKET = 'exam-uploads';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await prisma.violation.findMany({
    where: { screenshotUrl: { not: null }, timestamp: { lt: cutoff } },
    select: { id: true, screenshotUrl: true },
    take: 500, // bounded batch per run; cron catches the rest next day
  });

  if (expired.length === 0) {
    return NextResponse.json({ purged: 0 });
  }

  // Evidence snapshots are stored as storage paths (evidence/{userId}/{ts}.jpg).
  // Anything that isn't a path (e.g. a legacy absolute URL) is skipped for
  // storage deletion but still nulled on the row.
  const paths = expired
    .map(v => v.screenshotUrl)
    .filter((p): p is string => p !== null && !p.startsWith('http'));
  if (paths.length > 0) {
    await adminSupabase.storage.from(BUCKET).remove(paths);
  }

  await prisma.violation.updateMany({
    where: { id: { in: expired.map(v => v.id) } },
    data: { screenshotUrl: null },
  });

  return NextResponse.json({ purged: expired.length, storageObjectsRemoved: paths.length });
}
