import { describe, it, expect } from 'vitest';
import { computeSectionScores, type PerQuestion } from '@/lib/scoring';
import type { Question, ExamSection } from '@/types';

function q(id: string, sectionId: string, marks = 10): Question {
  return { id, examId: 'exam1', sectionId, type: 'mcq', stem: `Q${id}`, marks, difficulty: 'easy', order: 1 };
}

function pq(questionId: string, marks: number, marksAwarded: number): PerQuestion {
  return { questionId, stem: `Q${questionId}`, type: 'mcq', marks, response: '', isCorrect: marksAwarded === marks, marksAwarded };
}

function section(overrides: Partial<ExamSection> = {}): ExamSection {
  return {
    id: 's1', examId: 'exam1', title: 'Section 1', orderIndex: 1, sectionWeight: 100,
    createdAt: new Date().toISOString(), ...overrides,
  };
}

describe('computeSectionScores — per-section raw/scaled scoring', () => {
  it('computes 100% scaled score when every answer in the section is fully correct', () => {
    const questions = [q('q1', 's1'), q('q2', 's1')];
    const answers = [pq('q1', 10, 10), pq('q2', 10, 10)];
    const result = computeSectionScores(answers, questions, [section()]);
    expect(result.sections[0].rawScore).toBe(20);
    expect(result.sections[0].totalMarks).toBe(20);
    expect(result.sections[0].scaledScore).toBe(100);
  });

  it('computes a partial scaled score correctly', () => {
    const questions = [q('q1', 's1'), q('q2', 's1')];
    const answers = [pq('q1', 10, 10), pq('q2', 10, 0)];
    const result = computeSectionScores(answers, questions, [section()]);
    expect(result.sections[0].scaledScore).toBe(50);
  });

  it('a section with zero total marks scores 0, not NaN/Infinity', () => {
    const result = computeSectionScores([], [], [section()]);
    expect(result.sections[0].scaledScore).toBe(0);
    expect(Number.isFinite(result.sections[0].scaledScore)).toBe(true);
  });
});

describe('computeSectionScores — weighted composite', () => {
  it('applies each section\'s weight to its own scaled score (spec worked example)', () => {
    // Section 1: 100% scaled, weight 40% -> contributes 40
    // Section 2: 50% scaled, weight 60% -> contributes 30
    // Composite = 70
    const questions = [q('q1', 's1'), q('q2', 's2')];
    const answers = [pq('q1', 10, 10), pq('q2', 10, 5)];
    const sections = [
      section({ id: 's1', title: 'Section 1', orderIndex: 1, sectionWeight: 40 }),
      section({ id: 's2', title: 'Section 2', orderIndex: 2, sectionWeight: 60 }),
    ];
    const result = computeSectionScores(answers, questions, sections);
    const s1 = result.sections.find(s => s.sectionId === 's1')!;
    const s2 = result.sections.find(s => s.sectionId === 's2')!;
    expect(s1.scaledScore).toBe(100);
    expect(s1.weightedContribution).toBe(40);
    expect(s2.scaledScore).toBe(50);
    expect(s2.weightedContribution).toBe(30);
    expect(result.compositeScore).toBe(70);
  });

  it('orders sections by orderIndex regardless of input array order', () => {
    const sections = [
      section({ id: 's2', title: 'Second', orderIndex: 2 }),
      section({ id: 's1', title: 'First', orderIndex: 1 }),
    ];
    const result = computeSectionScores([], [], sections);
    expect(result.sections.map(s => s.title)).toEqual(['First', 'Second']);
  });
});

describe('computeSectionScores — passingThreshold and overall failure', () => {
  it('a section with no passingThreshold always passes', () => {
    const result = computeSectionScores([], [], [section({ passingThreshold: undefined })]);
    expect(result.sections[0].passed).toBe(true);
    expect(result.failed).toBe(false);
  });

  it('flags the section (and the overall attempt) failed when its scaled score is below threshold', () => {
    const questions = [q('q1', 's1')];
    const answers = [pq('q1', 10, 3)]; // 30%
    const result = computeSectionScores(answers, questions, [section({ passingThreshold: 50 })]);
    expect(result.sections[0].scaledScore).toBe(30);
    expect(result.sections[0].passed).toBe(false);
    expect(result.failed).toBe(true);
  });

  it('a high composite score does NOT override a missed section threshold (spec: "Failed regardless of the TotalScore")', () => {
    const questions = [q('q1', 's1'), q('q2', 's2')];
    // Section 1: 100% scaled, weight 90 -> composite dominated by this
    // Section 2: 10% scaled (below its own 50 threshold), weight 10
    const answers = [pq('q1', 10, 10), pq('q2', 10, 1)];
    const sections = [
      section({ id: 's1', sectionWeight: 90, passingThreshold: undefined }),
      section({ id: 's2', sectionWeight: 10, passingThreshold: 50 }),
    ];
    const result = computeSectionScores(answers, questions, sections);
    expect(result.compositeScore).toBeGreaterThan(85); // clearly a "passing" composite on paper
    expect(result.failed).toBe(true); // but still flagged failed because of section 2's threshold
  });

  it('passes overall when every section with a threshold meets it, even if one section scored low without a threshold', () => {
    const questions = [q('q1', 's1'), q('q2', 's2')];
    const answers = [pq('q1', 10, 6), pq('q2', 10, 0)]; // s1 60%, s2 0%
    const sections = [
      section({ id: 's1', sectionWeight: 50, passingThreshold: 50 }), // meets it
      section({ id: 's2', sectionWeight: 50, passingThreshold: undefined }), // no threshold set — can't fail on this
    ];
    const result = computeSectionScores(answers, questions, sections);
    expect(result.failed).toBe(false);
  });
});

describe('computeSectionScores — questions with no sectionId are excluded from the breakdown', () => {
  it('does not attribute an unsectioned question to any section', () => {
    const questions = [q('q1', 's1'), { ...q('q2', 's1'), sectionId: undefined }];
    const answers = [pq('q1', 10, 10), pq('q2', 10, 10)];
    const result = computeSectionScores(answers, questions, [section()]);
    // Only q1's 10 marks should count toward section s1, not q2's
    expect(result.sections[0].totalMarks).toBe(10);
  });
});
