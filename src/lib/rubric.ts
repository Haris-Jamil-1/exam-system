// Hierarchical essay-rubric authoring model (Item Bank -> Create Item, Essay type). Purely an
// authoring-time construct: what actually persists on Item.rubric/Question.rubric is the existing
// flat RubricCriterion[] shape the AI grading pipeline (lib/ai/grading.ts's essaySystem/
// parseRubric) already reads — compileRubric() below flattens this editor's hierarchy down to
// that shape at save time, so the grading pipeline itself needed zero changes.
import type { RubricCriterion } from '@/types';

export interface RubricLevelColumn {
  id: string;
  label: string;
}

export interface RubricRow {
  id: string;
  name: string;
  /** Percentage weight. Top-level rows must sum to 100; a row with sub-rows is purely
   *  organizational — its weight is what its own sub-rows must sum to. */
  weight: number;
  /** Per performance-level description text, keyed by RubricLevelColumn.id. */
  descriptions: Record<string, string>;
  subRows: RubricRow[];
}

const WEIGHT_EPSILON = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safeWeight(w: number): number {
  return Number.isFinite(w) ? w : 0;
}

/** Sum of every top-level dimension's weight — must equal 100 to save. */
export function topLevelWeightSum(rows: RubricRow[]): number {
  return round2(rows.reduce((sum, r) => sum + safeWeight(r.weight), 0));
}

export function isTopLevelWeightValid(rows: RubricRow[]): boolean {
  if (rows.length === 0) return false;
  return Math.abs(topLevelWeightSum(rows) - 100) < WEIGHT_EPSILON;
}

/** Sum of one row's own sub-dimension weights (0 when it has none). */
export function subRowWeightSum(row: RubricRow): number {
  return round2(row.subRows.reduce((sum, r) => sum + safeWeight(r.weight), 0));
}

/** A row with sub-dimensions is valid only when they sum to exactly its own weight. */
export function isSubRowWeightValid(row: RubricRow): boolean {
  if (row.subRows.length === 0) return true;
  return Math.abs(subRowWeightSum(row) - row.weight) < WEIGHT_EPSILON;
}

/** IDs of every row (at any depth) whose own sub-dimension weights don't sum correctly. */
export function findInvalidRowIds(rows: RubricRow[]): string[] {
  const invalid: string[] = [];
  for (const row of rows) {
    if (!isSubRowWeightValid(row)) invalid.push(row.id);
    invalid.push(...findInvalidRowIds(row.subRows));
  }
  return invalid;
}

/** True once every validation rule passes: top-level sums to 100, every parent's children sum
 *  to that parent's own weight. */
export function isRubricValid(rows: RubricRow[]): boolean {
  return isTopLevelWeightValid(rows) && findInvalidRowIds(rows).length === 0;
}

/**
 * Flattens the hierarchy into the flat criteria array the AI grading pipeline expects. Only leaf
 * rows (no sub-dimensions) become a gradable criterion — a parent with children is purely
 * organizational, so its own weight is never separately graded (that would double-count on top
 * of its children's points). A leaf's `maxPoints` is its weight's share of the item's total marks.
 */
export function compileRubric(rows: RubricRow[], levels: RubricLevelColumn[], itemMarks: number): RubricCriterion[] {
  const criteria: RubricCriterion[] = [];

  function visit(row: RubricRow, parentName: string | null) {
    const name = parentName ? `${parentName}: ${row.name}` : row.name;
    if (row.subRows.length > 0) {
      for (const sub of row.subRows) visit(sub, name);
      return;
    }
    const maxPoints = round2((safeWeight(row.weight) / 100) * itemMarks);
    const description = levels
      .map(level => row.descriptions[level.id]?.trim())
      .filter(Boolean)
      .join(' | ');
    criteria.push({ name, maxPoints, ...(description ? { description } : {}) });
  }

  for (const row of rows) visit(row, null);
  return criteria;
}

let idCounter = 0;
/** Deterministic-enough id generator for new rows/columns (no crypto needed, client-only). */
export function nextRubricId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export const DEFAULT_RUBRIC_LEVELS: RubricLevelColumn[] = [
  { id: 'level-excellent', label: 'Excellent (4)' },
  { id: 'level-good', label: 'Good (3)' },
  { id: 'level-fair', label: 'Fair (2)' },
  { id: 'level-poor', label: 'Poor (1)' },
];

export function defaultRubricRows(): RubricRow[] {
  return [
    { id: nextRubricId('row'), name: 'Content Accuracy', weight: 25, descriptions: {}, subRows: [] },
    { id: nextRubricId('row'), name: 'Critical Thinking', weight: 25, descriptions: {}, subRows: [] },
    { id: nextRubricId('row'), name: 'Structure & Clarity', weight: 25, descriptions: {}, subRows: [] },
    { id: nextRubricId('row'), name: 'Evidence & Examples', weight: 25, descriptions: {}, subRows: [] },
  ];
}
