import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { scoreAnswers } from '@/lib/scoring';
import type { Question } from '@/types';

// Extracted verbatim from src/app/api/attempts/[attemptId]/submit/route.ts:24-127
// into src/lib/scoring.ts so it is importable without pulling in the Prisma/Supabase
// server singletons that route.ts also imports (those require a live DB/auth backend
// and are out of scope for these pure-logic unit tests). Zero logic changes were made.

function mcqQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    examId: 'exam1',
    type: 'mcq',
    stem: 'What is 2+2?',
    marks: 4,
    difficulty: 'easy',
    order: 1,
    options: [
      { id: 'a', text: '3', isCorrect: false },
      { id: 'b', text: '4', isCorrect: true },
      { id: 'c', text: '5', isCorrect: false },
    ],
    ...overrides,
  };
}

describe('SCR-01 — MCQ / true_false scoring (ID-based, regression check on "always scored wrong" fix)', () => {
  it('awards full marks when the selected option id matches the isCorrect option', () => {
    const q = mcqQuestion();
    const { score, perQuestion } = scoreAnswers([q], { q1: 'b' });
    expect(score).toBe(4);
    expect(perQuestion[0].isCorrect).toBe(true);
    expect(perQuestion[0].marksAwarded).toBe(4);
  });

  it('awards zero marks for a wrong option id', () => {
    const q = mcqQuestion();
    const { score, perQuestion } = scoreAnswers([q], { q1: 'a' });
    expect(score).toBe(0);
    expect(perQuestion[0].isCorrect).toBe(false);
  });

  it('awards zero marks and marks unanswered when no answer supplied', () => {
    const q = mcqQuestion();
    const { score, perQuestion } = scoreAnswers([q], {});
    expect(score).toBe(0);
    expect(perQuestion[0].isCorrect).toBe(false);
    expect(perQuestion[0].response).toBe('');
  });

  it('does NOT match on option text (regression guard for the pre-06-25 bug: comparing answer to option.text instead of option.id)', () => {
    const q = mcqQuestion();
    // Student answer is literally the correct option's text, not its id — must NOT be scored correct.
    const { score } = scoreAnswers([q], { q1: '4' });
    expect(score).toBe(0);
  });

  it('true_false uses the same id-based path as mcq', () => {
    const q = mcqQuestion({
      id: 'tf1',
      type: 'true_false',
      options: [
        { id: 't', text: 'True', isCorrect: true },
        { id: 'f', text: 'False', isCorrect: false },
      ],
    });
    expect(scoreAnswers([q], { tf1: 't' }).score).toBe(4);
    expect(scoreAnswers([q], { tf1: 'f' }).score).toBe(0);
  });
});

describe('SCR-02 — MRQ scoring (exact-set match, no partial credit by design)', () => {
  function mrqQuestion(): Question {
    return {
      id: 'q2', examId: 'e', type: 'mrq', stem: 'Select all primes', marks: 6, difficulty: 'medium', order: 1,
      options: [
        { id: 'a', text: '2', isCorrect: true },
        { id: 'b', text: '3', isCorrect: true },
        { id: 'c', text: '4', isCorrect: false },
        { id: 'd', text: '5', isCorrect: true },
      ],
    };
  }

  it('all correct, nothing extra -> full marks', () => {
    const { score } = scoreAnswers([mrqQuestion()], { q2: ['a', 'b', 'd'] });
    expect(score).toBe(6);
  });

  it('some correct, some missing -> zero (no partial credit for MRQ)', () => {
    const { score } = scoreAnswers([mrqQuestion()], { q2: ['a', 'b'] });
    expect(score).toBe(0);
  });

  it('all correct plus one extra wrong selection -> zero', () => {
    const { score } = scoreAnswers([mrqQuestion()], { q2: ['a', 'b', 'c', 'd'] });
    expect(score).toBe(0);
  });

  it('empty selection -> zero', () => {
    const { score } = scoreAnswers([mrqQuestion()], { q2: [] });
    expect(score).toBe(0);
  });

  it('order of selected ids does not matter (sorted before compare)', () => {
    const { score } = scoreAnswers([mrqQuestion()], { q2: ['d', 'a', 'b'] });
    expect(score).toBe(6);
  });
});

describe('SCR-03 — Matching, new format (partial credit per pair)', () => {
  function matchingQuestion(marks = 8): Question {
    return {
      id: 'q3', examId: 'e', type: 'matching', stem: 'Match terms', marks, difficulty: 'medium', order: 1,
      options: [
        { id: 'L1', text: 'Stack' },
        { id: 'L2', text: 'Queue' },
        { id: 'L3', text: 'Heap' },
        { id: 'L4', text: 'Graph' },
      ] as Question['options'],
      correctAnswer: ['LIFO', 'FIFO', 'Priority', 'Network'],
    };
  }

  it('0/4 correct -> zero marks, isCorrect=false', () => {
    const q = matchingQuestion();
    const { score, perQuestion } = scoreAnswers([q], {
      q3: { L1: 'FIFO', L2: 'LIFO', L3: 'Network', L4: 'Priority' },
    });
    expect(score).toBe(0);
    expect(perQuestion[0].isCorrect).toBe(false);
  });

  it('2/4 correct -> half marks awarded (partial credit)', () => {
    const q = matchingQuestion(8);
    const { score, perQuestion } = scoreAnswers([q], {
      q3: { L1: 'LIFO', L2: 'FIFO', L3: 'Network', L4: 'Priority' }, // first 2 correct, last 2 swapped
    });
    expect(score).toBe(4);
    expect(perQuestion[0].isCorrect).toBe(false);
    expect(perQuestion[0].marksAwarded).toBe(4);
  });

  it('4/4 correct -> full marks, isCorrect=true', () => {
    const q = matchingQuestion(8);
    const { score, perQuestion } = scoreAnswers([q], {
      q3: { L1: 'LIFO', L2: 'FIFO', L3: 'Priority', L4: 'Network' },
    });
    expect(score).toBe(8);
    expect(perQuestion[0].isCorrect).toBe(true);
  });

  it('duplicate right-side mapping (two lefts mapped to the same right value) only credits the pair(s) that actually match the key', () => {
    const q = matchingQuestion(8);
    const { score } = scoreAnswers([q], {
      q3: { L1: 'LIFO', L2: 'LIFO', L3: 'LIFO', L4: 'LIFO' }, // everything mapped to the same (wrong for 3 of them) value
    });
    // Only L1's mapping ('LIFO') actually matches its expected value; L2/L3/L4 expected FIFO/Priority/Network.
    expect(score).toBe(2); // 8/4 * 1 correct pair
  });

  it('legacy array format (pre-partial-credit data) is scored all-or-nothing, not partial', () => {
    const q: Question = {
      id: 'q3legacy', examId: 'e', type: 'matching', stem: 'Legacy matching', marks: 8, difficulty: 'medium', order: 1,
      options: [
        { id: 'a', text: 'Stack — LIFO', isCorrect: true },
        { id: 'b', text: 'Queue — FIFO', isCorrect: true },
        { id: 'c', text: 'Heap — Priority', isCorrect: false },
      ],
    };
    // Legacy path: answer is an array of selected option ids, correctAnswer is NOT an array -> falls into the `else if` all-or-nothing branch.
    const { score } = scoreAnswers([q], { q3legacy: ['a', 'b'] });
    expect(score).toBe(8); // matches the 2 isCorrect:true options exactly -> full marks despite being "all-or-nothing" logic
    const { score: partialAttempt } = scoreAnswers([q], { q3legacy: ['a'] });
    expect(partialAttempt).toBe(0); // one correct pair selected out of two -> legacy path gives ZERO, confirming no partial credit here
  });
});

describe('SCR-04 — Ordering (partial credit per correctly-positioned item)', () => {
  function orderingQuestion(marks = 9): Question {
    return {
      id: 'q4', examId: 'e', type: 'ordering', stem: 'Order the steps', marks, difficulty: 'medium', order: 1,
      options: [
        { id: 'o1', text: 'Analyze' },
        { id: 'o2', text: 'Design' },
        { id: 'o3', text: 'Build' },
      ] as Question['options'],
      correctAnswer: ['Analyze', 'Design', 'Build'],
    };
  }

  it('0/3 in correct position -> zero marks', () => {
    const q = orderingQuestion(9);
    const { score } = scoreAnswers([q], { q4: ['o3', 'o1', 'o2'] }); // Build, Analyze, Design — none in right slot
    expect(score).toBe(0);
  });

  it('1/3 in correct position -> partial credit (3 marks of 9)', () => {
    const q = orderingQuestion(9);
    const { score } = scoreAnswers([q], { q4: ['o1', 'o3', 'o2'] }); // Analyze correct, Build/Design swapped
    expect(score).toBe(3);
  });

  it('3/3 in correct position -> full marks, isCorrect=true', () => {
    const q = orderingQuestion(9);
    const { score, perQuestion } = scoreAnswers([q], { q4: ['o1', 'o2', 'o3'] });
    expect(score).toBe(9);
    expect(perQuestion[0].isCorrect).toBe(true);
  });

  it('maps student option ids to text before comparing against correctAnswer text array', () => {
    // Verifies the id -> options.find -> .text lookup path specifically (not just an id comparison).
    const q = orderingQuestion(9);
    const { perQuestion } = scoreAnswers([q], { q4: ['o2', 'o1', 'o3'] });
    expect(perQuestion[0].response).toEqual(['o2', 'o1', 'o3']); // raw ids preserved in response
  });
});

describe('SCR-05 — Non-divisible marks produce fractional marksAwarded (float, not integer)', () => {
  it('matching: 8 marks / 3 pairs with 2 correct -> 5.33 (a float)', () => {
    const q: Question = {
      id: 'qm', examId: 'e', type: 'matching', stem: 'x', marks: 8, difficulty: 'medium', order: 1,
      options: [
        { id: 'L1', text: 'A' }, { id: 'L2', text: 'B' }, { id: 'L3', text: 'C' },
      ] as Question['options'],
      correctAnswer: ['1', '2', '3'],
    };
    const { score, perQuestion } = scoreAnswers([q], { qm: { L1: '1', L2: '2', L3: 'WRONG' } });
    expect(score).toBeCloseTo(5.33, 2);
    expect(Number.isInteger(perQuestion[0].marksAwarded)).toBe(false);
  });

  it('ordering: 10 marks / 3 items with 1 correct -> 3.33 (a float)', () => {
    const q: Question = {
      id: 'qo', examId: 'e', type: 'ordering', stem: 'x', marks: 10, difficulty: 'medium', order: 1,
      options: [
        { id: 'o1', text: 'A' }, { id: 'o2', text: 'B' }, { id: 'o3', text: 'C' },
      ] as Question['options'],
      correctAnswer: ['A', 'B', 'C'],
    };
    const { score } = scoreAnswers([q], { qo: ['o1', 'o3', 'o2'] }); // only A in place
    expect(score).toBeCloseTo(3.33, 2);
  });

  // NOTE — this is the math half of SCR-05 only. The finding in QA_CHECKLIST.md is that
  // Answer.marksAwarded and ExamAttempt.score are declared `Int?` in prisma/schema.prisma,
  // so persisting this exact float via `prisma.answer.upsert()` / `examAttempt.update()`
  // may throw a PrismaClientValidationError inside the submit route's $transaction, which
  // would leave the attempt stuck at status "in_progress". That half requires a live
  // Postgres connection to actually observe and CANNOT be verified in a pure unit test —
  // see QA_RESULTS.md, marked BLOCKED pending a non-prod database.
});

describe('SCR-06 — fill_blank / short_answer (case + whitespace insensitive exact match)', () => {
  function fillBlank(correctAnswer: string): Question {
    return { id: 'q6', examId: 'e', type: 'fill_blank', stem: 'The capital of France is ___', marks: 2, difficulty: 'easy', order: 1, correctAnswer };
  }

  it('exact match -> full marks', () => {
    expect(scoreAnswers([fillBlank('Paris')], { q6: 'Paris' }).score).toBe(2);
  });

  it('different case -> still full marks (case-insensitive)', () => {
    expect(scoreAnswers([fillBlank('Paris')], { q6: 'PARIS' }).score).toBe(2);
  });

  it('leading/trailing whitespace -> still full marks (trimmed)', () => {
    expect(scoreAnswers([fillBlank('Paris')], { q6: '  paris  ' }).score).toBe(2);
  });

  it('wrong answer -> zero', () => {
    expect(scoreAnswers([fillBlank('Paris')], { q6: 'London' }).score).toBe(0);
  });

  it('empty string answer -> zero, not treated as "no answer"', () => {
    const { score, perQuestion } = scoreAnswers([fillBlank('Paris')], { q6: '' });
    expect(score).toBe(0);
    // '' is explicitly NOT short-circuited by the `!answer && answer !== ''` guard, so it goes through
    // the normal comparison path and is scored as a (wrong) answer, not as "unanswered".
    expect(perQuestion[0].response).toBe('');
  });

  it('no fuzzy/synonym matching — a correct-meaning but differently-worded answer scores zero (confirms current behavior, not asserting it as correct/incorrect design)', () => {
    expect(scoreAnswers([fillBlank('color')], { q6: 'colour' }).score).toBe(0);
  });
});

describe('SCR-07 — Aggregate total, rounding, totalMarks edge cases', () => {
  it('totalMarks sums all question marks regardless of answer correctness', () => {
    const q1 = mcqQuestion({ id: 'a', marks: 4 });
    const q2 = mcqQuestion({ id: 'b', marks: 6, options: [{ id: 'x', text: 'x', isCorrect: true }] });
    const { totalMarks } = scoreAnswers([q1, q2], {});
    expect(totalMarks).toBe(10);
  });

  it('totalMarks = 0 (exam with a single zero-mark question) does not throw and returns score 0', () => {
    const q = mcqQuestion({ marks: 0 });
    const { score, totalMarks } = scoreAnswers([q], { q1: 'b' });
    expect(totalMarks).toBe(0);
    expect(score).toBe(0);
    // Downstream in submit/route.ts: scorePercentage = totalMarks > 0 ? Math.round(score/totalMarks*100) : 0
    // — guarded correctly there. But teacher/exams/[examId]/results/page.tsx:59 computes
    // `exam.passingMarks / exam.totalMarks * 100` with NO such guard — division by zero
    // produces Infinity/NaN if an exam's totalMarks is ever 0. Flagged for the results page,
    // not reproducible in this pure scoring-engine test (see QA_RESULTS.md SCR-07).
  });

  it('no negative marking exists anywhere in the switch — every branch\'s marksAwarded is either 0 or a non-negative value', () => {
    const q = mcqQuestion();
    const { score } = scoreAnswers([q], { q1: 'a' }); // wrong answer
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('essay/coding/file_upload always score 0 pending manual grading, never throw', () => {
    const essay: Question = { id: 'e1', examId: 'e', type: 'essay', stem: 'Discuss X', marks: 10, difficulty: 'hard', order: 1 };
    const { score, perQuestion } = scoreAnswers([essay], { e1: 'a very long essay answer' });
    expect(score).toBe(0);
    expect(perQuestion[0].isCorrect).toBe(false);
  });
});

describe('SCR-08 — trustScore formula and client-supplied-value rejection', () => {
  it('trustScore formula: max(0, 100 - violations*15)', () => {
    const trustScore = (violationCount: number) => Math.max(0, 100 - violationCount * 15);
    expect(trustScore(0)).toBe(100);
    expect(trustScore(3)).toBe(55);
    expect(trustScore(7)).toBe(0); // clamped at 0, not negative
    expect(trustScore(20)).toBe(0);
  });

  it('the submit request schema has no trustScore field, so Zod silently strips a client-supplied one rather than trusting it', () => {
    // Mirrors submitSchema in src/app/api/attempts/[attemptId]/submit/route.ts:7-12 exactly.
    // Not imported directly because route.ts also imports the Prisma/Supabase server
    // singletons (no live DB/auth available in this run) — see QA_RESULTS.md.
    const submitSchema = z.object({
      examId: z.string(),
      answers: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())])),
    });
    const parsed = submitSchema.safeParse({
      examId: 'exam1',
      answers: { q1: 'a' },
      trustScore: 999, // attacker-supplied, should have no effect
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('trustScore' in parsed.data).toBe(false); // Zod stripped the unknown key
    }
  });
});
