import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getViolations } from '@/lib/data';
import { getAuthUser, unauthorized, forbidden, notFound, withErrorHandling } from '@/lib/api-auth';
import { deriveSeverity, episodeDurationSeconds } from '@/lib/proctoring/severity';
import { computeTrustScore, type TrustScoreInput } from '@/lib/trust-score';
import type { ViolationType } from '@/types';

const VIOLATION_TYPES = [
  'tab_switch', 'window_blur', 'fullscreen_exit', 'no_face', 'multiple_faces',
  'audio_detected', 'phone_detected', 'gaze_away', 'prohibited_object',
  'unverified_start',
] as const;

const eventSchema = z.object({
  // 'heartbeat' is a liveness signal, not a violation — upserts ProctoringHeartbeat
  // instead of creating a Violation row.
  type: z.enum([...VIOLATION_TYPES, 'heartbeat'] as const),
  severity: z.enum(['low', 'medium', 'high']).default('low'),
  confidence: z.number().min(0).max(1).optional(),
  timestamp: z.string(),
  endedAt: z.string().nullable().optional(),
  description: z.string().max(500).default(''),
  screenshotUrl: z.string().optional(),
  clientSeq: z.number().int().min(0).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const batchSchema = z.object({
  attemptId: z.string(),
  examId: z.string(),
  events: z.array(eventSchema).min(1).max(100),
});

// Pre-Phase-3 single-violation shape, kept so a client loaded before a deploy
// can finish its exam against the new server.
const legacySchema = z.object({
  attemptId: z.string(),
  examId: z.string(),
  type: z.enum(VIOLATION_TYPES),
  severity: z.enum(['low', 'medium', 'high']),
  timestamp: z.string(),
  description: z.string(),
  screenshotUrl: z.string().optional(),
});

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const examId = searchParams.get('examId') ?? undefined;
  // Scope to only the caller's own violations when no examId is supplied
  const studentId = user.role === 'student'
    ? user.id
    : (searchParams.get('studentId') ?? undefined);
  const violations = await getViolations(examId, studentId, user.institutionId);
  return NextResponse.json(violations);
}

export const POST = withErrorHandling(async (request: Request) => {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await request.json();

  let attemptId: string;
  let examId: string;
  let events: z.infer<typeof eventSchema>[];

  const batch = batchSchema.safeParse(body);
  if (batch.success) {
    ({ attemptId, examId, events } = batch.data);
  } else {
    const legacy = legacySchema.safeParse(body);
    if (!legacy.success) {
      return NextResponse.json({ error: batch.error.flatten() }, { status: 400 });
    }
    ({ attemptId, examId } = legacy.data);
    events = [{ ...legacy.data, description: legacy.data.description, endedAt: null }];
  }

  // Ownership: the attempt must exist, belong to the claimed exam, and — for
  // students — belong to the caller. (Previously unchecked: a student could
  // write violation rows against another student's attemptId.)
  const attempt = await prisma.examAttempt.findUnique({
    where: { id: attemptId },
    select: { id: true, examId: true, studentId: true },
  });
  if (!attempt || attempt.examId !== examId) return notFound('Attempt not found');
  if (user.role === 'student' && attempt.studentId !== user.id) return forbidden();

  const heartbeats = events.filter(e => e.type === 'heartbeat');
  const violationEvents = events.filter(e => e.type !== 'heartbeat');

  const maxSeq = events.reduce((m, e) => Math.max(m, e.clientSeq ?? 0), 0);
  if (heartbeats.length > 0 || maxSeq > 0) {
    const lastHb = heartbeats[heartbeats.length - 1];
    await prisma.proctoringHeartbeat.upsert({
      where: { attemptId },
      create: {
        attemptId,
        lastSeq: maxSeq,
        lastSeenAt: new Date(),
        metadata: (lastHb?.metadata as object | undefined) ?? undefined,
      },
      update: {
        lastSeq: maxSeq,
        lastSeenAt: new Date(),
        ...(lastHb?.metadata ? { metadata: lastHb.metadata as object } : {}),
      },
    });
  }

  // Idempotency on retried flushes: skip events whose clientSeq already landed.
  let toCreate = violationEvents;
  const seqs = violationEvents.map(e => e.clientSeq).filter((s): s is number => s !== undefined);
  if (seqs.length > 0) {
    const existing = await prisma.violation.findMany({
      where: { attemptId, clientSeq: { in: seqs } },
      select: { clientSeq: true },
    });
    const seen = new Set(existing.map(r => r.clientSeq));
    toCreate = violationEvents.filter(e => e.clientSeq === undefined || !seen.has(e.clientSeq));
  }

  if (toCreate.length > 0) {
    await prisma.violation.createMany({
      data: toCreate.map(e => {
        const type = e.type as ViolationType;
        const duration = episodeDurationSeconds(e.timestamp, e.endedAt);
        return {
          attemptId,
          examId,
          studentId: attempt.studentId,
          type,
          // Client severity is a suggestion; policy is server-side.
          severity: deriveSeverity(type, duration, e.severity),
          description: e.description,
          screenshotUrl: e.screenshotUrl ?? null,
          confidence: e.confidence ?? null,
          timestamp: new Date(e.timestamp),
          endedAt: e.endedAt ? new Date(e.endedAt) : null,
          clientSeq: e.clientSeq ?? null,
          metadata: (e.metadata as object | undefined) ?? undefined,
        };
      }),
    });
  }

  // Keep the attempt's live trust score current mid-exam — the teacher monitor
  // reads it from ExamAttempt (and, in track 2, via Realtime on this update).
  const violationRows = await prisma.violation.findMany({
    where: { attemptId },
    select: { type: true, severity: true, confidence: true, timestamp: true, endedAt: true },
  });
  const trustScore = computeTrustScore(violationRows as TrustScoreInput[]);
  await prisma.examAttempt.update({
    where: { id: attemptId },
    data: { trustScore, violationCount: violationRows.length },
  });

  return NextResponse.json(
    {
      created: toCreate.length,
      skipped: violationEvents.length - toCreate.length,
      violationCount: violationRows.length,
      trustScore,
    },
    { status: 201 },
  );
});
