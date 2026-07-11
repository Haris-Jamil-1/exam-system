import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isPsychometricsConfigured, requestComputation } from '@/lib/psychometrics-client';

// Nightly psychometrics sweep (Phase 3, doc 05): recompute stats for exams
// whose submissions are newer than their last stat run — catches regrades,
// late force-submits, and missed on-close triggers. Idempotent by construction
// (the service upserts per administration), so double-running is harmless.

const MAX_EXAMS_PER_RUN = 20;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isPsychometricsConfigured()) {
    return NextResponse.json({ skipped: true, reason: 'PSYCHOMETRICS_URL not configured' });
  }

  // Exams with at least one submitted attempt whose latest submission is newer
  // than the exam's last reliability run (or that have never been computed).
  const candidates = await prisma.$queryRaw<{ examId: string }[]>`
    SELECT att."examId" AS "examId"
    FROM "ExamAttempt" att
    LEFT JOIN "ExamReliabilityStat" s ON s."examId" = att."examId"
    WHERE att.status IN ('submitted', 'auto_submitted')
    GROUP BY att."examId", s."computedAt"
    HAVING s."computedAt" IS NULL OR MAX(att."submittedAt") > s."computedAt"
    LIMIT ${MAX_EXAMS_PER_RUN}
  `;

  const results: Record<string, string> = {};
  for (const { examId } of candidates) {
    const outcome = await requestComputation(examId);
    results[examId] = outcome.ok ? 'computed' : outcome.error;
  }

  return NextResponse.json({ examined: candidates.length, results });
}
