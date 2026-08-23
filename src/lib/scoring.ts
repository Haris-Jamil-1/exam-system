import type { Question, ExamSection, QuestionType } from '@/types';
import { stripHtml } from '@/lib/rich-text';

// Single source of truth for "this question type is never auto-scored" — must match the case
// labels in scoreAnswers' own switch below exactly. Both submit routes use this to decide which
// answers enter the pending_ai grading state machine (doc 03) instead of getting an immediate
// deterministic score.
export const MANUALLY_GRADED_TYPES: QuestionType[] = ['essay', 'coding', 'file_upload', 'audio_response', 'video_response'];

// Subset of MANUALLY_GRADED_TYPES that the AI grading pipeline (src/lib/ai/grading.ts's
// runGradingForAttempt) actually has a case for — file_upload/audio_response/video_response enter
// pending_ai for a human to grade directly but are never run through the AI suggester at all.
// Single source of truth for "does 'Regrade with AI' do anything for this type" (GradingPanel).
export const AI_GRADABLE_TYPES: QuestionType[] = ['essay', 'coding'];

export type PerQuestion = {
  questionId: string;
  stem: string;
  type: string;
  marks: number;
  response: string | string[] | Record<string, string>;
  isCorrect: boolean;
  marksAwarded: number;
};

export function scoreAnswers(questions: Question[], answers: Record<string, string | string[] | Record<string, string>>) {
  let score = 0;
  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const perQuestion: PerQuestion[] = [];

  for (const q of questions) {
    const answer = answers[q.id];
    if (!answer && answer !== '') {
      perQuestion.push({ questionId: q.id, stem: q.stem, type: q.type, marks: q.marks, response: '', isCorrect: false, marksAwarded: 0 });
      continue;
    }

    let correct = false;
    let marksAwarded = 0;

    switch (q.type) {
      case 'mcq':
      case 'true_false': {
        const selectedOpt = q.options?.find(o => o.id === (answer as string));
        correct = selectedOpt?.isCorrect === true;
        marksAwarded = correct ? q.marks : 0;
        break;
      }
      case 'fill_blank':
      case 'short_answer':
        correct =
          typeof answer === 'string' &&
          typeof q.correctAnswer === 'string' &&
          answer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
        marksAwarded = correct ? q.marks : 0;
        break;
      case 'mrq': {
        if (Array.isArray(answer) && q.options) {
          const correctIds = q.options.filter(o => o.isCorrect).map(o => o.id).sort();
          const selectedIds = [...answer].sort();
          correct =
            selectedIds.length === correctIds.length &&
            selectedIds.join(',') === correctIds.join(',');
        }
        marksAwarded = correct ? q.marks : 0;
        break;
      }
      case 'matching': {
        if (
          answer !== null &&
          typeof answer === 'object' &&
          !Array.isArray(answer) &&
          q.options &&
          Array.isArray(q.correctAnswer)
        ) {
          // New format: { leftOptionId: selectedRightText } — partial credit per pair.
          // Compared via stripHtml() since matching's right-side labels (like every answer
          // option now) may be Quill-authored HTML — the student's selected value and the
          // stored label should already be the identical string in practice (both drawn from
          // the same `matchingChoices` set), but normalizing here means a value that round-trips
          // through any HTML-equivalent-but-not-byte-identical form still matches correctly.
          const matchMap = answer as Record<string, string>;
          const rightLabels = q.correctAnswer as string[];
          let correctPairs = 0;
          q.options.forEach((opt, i) => {
            const expected = rightLabels[i];
            const selected = matchMap[opt.id];
            if (selected === expected || (selected !== undefined && expected !== undefined && stripHtml(selected) === stripHtml(expected))) {
              correctPairs++;
            }
          });
          correct = correctPairs === q.options.length;
          marksAwarded = q.options.length > 0
            ? parseFloat(((q.marks / q.options.length) * correctPairs).toFixed(2))
            : 0;
        } else if (Array.isArray(answer) && q.options) {
          // Legacy format: all-or-nothing
          const correctIds = q.options.filter(o => o.isCorrect).map(o => o.id).sort();
          const selectedIds = [...answer].sort();
          correct =
            selectedIds.length === correctIds.length &&
            selectedIds.join(',') === correctIds.join(',');
          marksAwarded = correct ? q.marks : 0;
        }
        break;
      }
      case 'ordering': {
        // Partial credit: 1 point per correctly-positioned item. Compared via stripHtml() since
        // option text may now be Quill-authored HTML — an exact `===` would spuriously fail if
        // the option's live text and the stored expected-order snapshot ever differ only in
        // formatting/markup, not visible content.
        if (Array.isArray(answer) && Array.isArray(q.correctAnswer) && q.options) {
          const studentTexts = (answer as string[]).map(id => q.options?.find(o => o.id === id)?.text ?? '');
          const expected = q.correctAnswer as string[];
          let correctPositions = 0;
          studentTexts.forEach((text, i) => {
            if (text === expected[i] || stripHtml(text) === stripHtml(expected[i] ?? '')) correctPositions++;
          });
          correct = correctPositions === expected.length;
          marksAwarded = expected.length > 0
            ? parseFloat(((q.marks / expected.length) * correctPositions).toFixed(2))
            : 0;
        }
        break;
      }
      case 'essay':
      case 'coding':
      case 'file_upload':
      case 'audio_response':
      case 'video_response':
        // Manual / async grading — audio/video are graded manually only (decided 2026-08-22,
        // same structural path as file_upload: gradeEssayAnswer/gradeCodingAnswer's own type
        // gating means the AI pipeline never touches these).
        correct = false;
        marksAwarded = 0;
        break;
    }

    score += marksAwarded;
    perQuestion.push({ questionId: q.id, stem: q.stem, type: q.type, marks: q.marks, response: answer ?? '', isCorrect: correct, marksAwarded });
  }

  return { score, totalMarks, perQuestion };
}

export type SectionScore = {
  sectionId: string;
  title: string;
  rawScore: number;
  totalMarks: number;
  // 0-100, this section's own performance independent of its weight in the composite
  scaledScore: number;
  weight: number;
  // scaledScore * (weight / 100) — this section's contribution to the composite total
  weightedContribution: number;
  passingThreshold?: number;
  passed: boolean;
};

export type HierarchicalScore = {
  sections: SectionScore[];
  // Sum of every section's weightedContribution — the exam's actual final grade (0-100) when
  // sections are used, per spec: TotalScore = Σ(SectionScaledScore × SectionWeight)
  compositeScore: number;
  // True if ANY section has a passingThreshold that wasn't met — overrides a passing
  // compositeScore per spec: "the overall exam status is flagged as Failed regardless of the
  // TotalScore."
  failed: boolean;
};

/**
 * Rolls a flat scoreAnswers() result up into a per-section breakdown + weighted composite.
 * Pure/DB-free — sections and questions are both already-fetched plain data. Questions with no
 * sectionId (a non-sectioned exam, or a sectioned exam's incidental unsectioned questions) are
 * excluded from the section breakdown entirely; the caller decides whether that's expected.
 */
export function computeSectionScores(
  perQuestion: PerQuestion[],
  questions: Question[],
  sections: ExamSection[],
): HierarchicalScore {
  const sectionIdByQuestionId = new Map(questions.map(q => [q.id, q.sectionId]));

  const sectionResults: SectionScore[] = sections
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(section => {
      const sectionAnswers = perQuestion.filter(pq => sectionIdByQuestionId.get(pq.questionId) === section.id);
      const rawScore = sectionAnswers.reduce((s, pq) => s + pq.marksAwarded, 0);
      const totalMarks = sectionAnswers.reduce((s, pq) => s + pq.marks, 0);
      const scaledScore = totalMarks > 0 ? (rawScore / totalMarks) * 100 : 0;
      const passed = section.passingThreshold === undefined || scaledScore >= section.passingThreshold;
      return {
        sectionId: section.id,
        title: section.title,
        rawScore,
        totalMarks,
        scaledScore: Math.round(scaledScore * 100) / 100,
        weight: section.sectionWeight,
        weightedContribution: Math.round(scaledScore * (section.sectionWeight / 100) * 100) / 100,
        passingThreshold: section.passingThreshold,
        passed,
      };
    });

  const compositeScore = Math.round(sectionResults.reduce((s, r) => s + r.weightedContribution, 0) * 100) / 100;
  const failed = sectionResults.some(r => !r.passed);

  return { sections: sectionResults, compositeScore, failed };
}
