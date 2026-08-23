// Pure scoring logic extracted from grading.ts's gradeEssayAnswer so it's directly unit-testable
// without mocking the Anthropic client — mirrors this repo's established pattern of pulling
// decision logic out of a route/pipeline into a plain function (exam-start-errors.ts,
// grading-status.ts) rather than only ever exercising it via live AI-call QA.

export interface EssayRubricCriterion {
  name: string;
  maxPoints: number;
  isVeto?: boolean;
}

export interface EssayCriterionScore {
  name: string;
  points: number;
}

export interface EssayScoreResult {
  suggested: number;
  vetoTriggered: boolean;
}

/**
 * Scales the AI's per-criterion points to the question's total marks, then applies the
 * Zero-Anchor / Veto override: if any rubric criterion flagged `isVeto` was scored at (or below)
 * zero, the whole suggested score is nullified regardless of every other criterion — a
 * mechanical override applied here, not left to the AI itself (it grades every criterion
 * identically; this function decides what a zero on one means for the total).
 */
export function computeEssaySuggestedScore(
  rubric: EssayRubricCriterion[],
  criterionScores: EssayCriterionScore[],
  maxMarks: number,
): EssayScoreResult {
  const vetoTriggered = rubric.some(criterion => {
    if (!criterion.isVeto) return false;
    const score = criterionScores.find(c => c.name === criterion.name);
    return score !== undefined && score.points <= 0;
  });
  if (vetoTriggered) return { suggested: 0, vetoTriggered: true };

  const rubricMax = rubric.reduce((s, c) => s + c.maxPoints, 0);
  const awarded = criterionScores.reduce((s, c) => {
    const criterion = rubric.find(rc => rc.name === c.name);
    return s + Math.min(c.points, criterion?.maxPoints ?? 0);
  }, 0);
  const suggested = rubricMax > 0 ? Number(((awarded / rubricMax) * maxMarks).toFixed(2)) : 0;
  return { suggested, vetoTriggered: false };
}
