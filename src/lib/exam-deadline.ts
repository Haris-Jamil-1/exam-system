// Availability window vs. duration (Phase 5, task 2): a student's submission deadline is
// whichever comes first — their own duration limit counted from when they clicked "Start
// Exam", or the exam's global availability close (`endTime`). Pure/testable so both trigger
// paths (duration-first, endTime-first) can be exercised independently of Prisma/HTTP.
//
// Server-side only — recomputed independently on submit so a manipulated or stalled client
// timer can never grant extra time (SEC-07/STU-01/TIME-02, 2026-07-06).

const GRACE_MS = 5000; // network/client-timer latency allowance

export function computeSubmissionDeadline(
  startedAt: Date,
  durationMinutes: number,
  endTime: Date,
): Date {
  const durationDeadlineMs = startedAt.getTime() + durationMinutes * 60_000;
  return new Date(Math.min(durationDeadlineMs, endTime.getTime()));
}

export function isPastDeadline(deadline: Date, now: Date): boolean {
  return now.getTime() > deadline.getTime() + GRACE_MS;
}
