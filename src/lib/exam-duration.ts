// Exam duration is derived from the availability window the teacher sets — never entered
// manually. Kept as a pure function so the wizard (live preview), the server-side create
// path, and unit tests all share the exact same math.

/** Minimum sensible exam length — a window shorter than this is almost certainly a data-entry mistake. */
export const MIN_EXAM_DURATION_MINUTES = 5;

/**
 * Minutes between startTime and endTime, rounded to the nearest whole minute.
 * Returns null when either bound is missing/unparsable or the window is not positive.
 */
export function computeExamDurationMinutes(startTime: string | Date, endTime: string | Date): number | null {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const minutes = Math.round((end - start) / 60000);
  return minutes > 0 ? minutes : null;
}
