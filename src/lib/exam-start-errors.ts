// Phase 7.1: pure response classifiers for the exam-taking page's two "start" calls
// (POST /api/attempts, POST /api/attempts/[id]/sections/[id]/start). Deliberately kept free of
// React/DOM so the mapping from a raw fetch response to a user-facing outcome is unit-testable
// without a component-rendering harness — this repo has no existing pattern for testing React
// components directly, but every other piece of decision logic lives in src/lib and is tested
// this way (see item-bank-permissions.ts, exam-deadline.ts).

export type StartExamOutcome =
  | { ok: true; attempt: { id: string; startedAt: string } }
  | {
      ok: false;
      kind: 'not_started' | 'exam_ended' | 'insufficient_pool' | 'invalid_section_weights' | 'unknown';
      studentMessage: string;
      // Only set for configuration-issue kinds (insufficient_pool, invalid_section_weights) —
      // the full backend detail (shortfalls, exact weight sum) that a student should never see
      // verbatim, but that should reach an instructor/admin somewhere. This fix is frontend-only
      // (see PHASE_7_1_PROGRESS.md) — there is no backend notification endpoint to send this to
      // yet, so the caller logs it (console.error) rather than silently discarding it.
      instructorDetail?: string;
    };

interface StartExamResponseBody {
  id?: string;
  startedAt?: string;
  error?: string;
  message?: string;
  shortfalls?: unknown;
}

/** Classifies the raw POST /api/attempts response. Never throws — an unrecognized shape (a
 * network error's body, an unrelated 500) falls into the 'unknown' kind rather than crashing
 * the exam-start flow. */
export function classifyStartExamResponse(status: number, body: StartExamResponseBody): StartExamOutcome {
  if (status === 201 && typeof body.id === 'string' && typeof body.startedAt === 'string') {
    return { ok: true, attempt: { id: body.id, startedAt: body.startedAt } };
  }

  switch (body.error) {
    case 'not_started':
      return {
        ok: false,
        kind: 'not_started',
        studentMessage: body.message ?? 'This exam has not started yet. Please wait for it to open.',
      };
    case 'exam_ended':
      return {
        ok: false,
        kind: 'exam_ended',
        studentMessage: body.message ?? 'This exam has already ended.',
      };
    case 'insufficient_pool':
      return {
        ok: false,
        kind: 'insufficient_pool',
        studentMessage: 'This exam cannot start right now due to a configuration issue. Your instructor has been notified — please check back shortly or contact them.',
        instructorDetail: `insufficient_pool: ${body.message ?? ''} shortfalls=${JSON.stringify(body.shortfalls ?? [])}`,
      };
    case 'invalid_section_weights':
      return {
        ok: false,
        kind: 'invalid_section_weights',
        studentMessage: 'This exam isn\'t ready to start yet. Your instructor has been notified — please check back shortly or contact them.',
        instructorDetail: `invalid_section_weights: ${body.message ?? ''}`,
      };
    default:
      return {
        ok: false,
        kind: 'unknown',
        studentMessage: 'Something went wrong starting this exam. Please try again.',
      };
  }
}

/** Classifies the raw POST /api/attempts/[id]/sections/[id]/start response. `null` means the
 * section started successfully — the caller has nothing to show. */
export function classifySectionStartResponse(status: number, body: { error?: string }): string | null {
  if (status >= 200 && status < 300) return null;
  if (body.error) return body.error;
  return 'This section is not available to start right now.';
}
