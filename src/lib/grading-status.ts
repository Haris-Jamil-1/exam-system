// Phase 7.1: pure gating logic for GradingPanel, extracted so the visibility rule is testable
// without a component-rendering harness (see the note in exam-start-errors.ts — this repo has
// no existing React component test pattern, so decision logic lives in src/lib instead).
//
// `confirmed` is the only truly terminal state — it's what POST /api/grading/answers/[answerId]
// rejects further mutation on (409), per Phase 7's grading-override fix. `overridden` is a
// teacher's own explicit decision, but NOT yet finalized — the backend still permits changing it
// again before it's confirmed, and the UI must expose a path to do that, not just the badge.

export function isGradingFinalized(gradingStatus: string): boolean {
  return gradingStatus === 'confirmed';
}

/** Whether the override control should be shown/usable for this answer. */
export function canOverrideGrading(gradingStatus: string): boolean {
  return !isGradingFinalized(gradingStatus);
}
