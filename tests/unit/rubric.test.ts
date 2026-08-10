import { describe, it, expect } from 'vitest';
import {
  topLevelWeightSum, isTopLevelWeightValid,
  subRowWeightSum, isSubRowWeightValid,
  findInvalidRowIds, isRubricValid,
  compileRubric,
  type RubricRow, type RubricLevelColumn,
} from '@/lib/rubric';

function row(overrides: Partial<RubricRow> = {}): RubricRow {
  return { id: 'r1', name: 'Dim', weight: 25, descriptions: {}, subRows: [], ...overrides };
}

const LEVELS: RubricLevelColumn[] = [
  { id: 'a', label: 'Excellent (4)' },
  { id: 'b', label: 'Poor (1)' },
];

describe('top-level weight validation', () => {
  it('is valid when four 25% rows sum to 100', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' }), row({ id: 'd' })];
    expect(topLevelWeightSum(rows)).toBe(100);
    expect(isTopLevelWeightValid(rows)).toBe(true);
  });

  it('is invalid when rows sum to less than 100', () => {
    const rows = [row({ id: 'a', weight: 30 }), row({ id: 'b', weight: 30 })];
    expect(topLevelWeightSum(rows)).toBe(60);
    expect(isTopLevelWeightValid(rows)).toBe(false);
  });

  it('is invalid with zero rows', () => {
    expect(isTopLevelWeightValid([])).toBe(false);
  });

  it('tolerates float rounding noise', () => {
    const rows = [row({ id: 'a', weight: 33.33 }), row({ id: 'b', weight: 33.33 }), row({ id: 'c', weight: 33.34 })];
    expect(isTopLevelWeightValid(rows)).toBe(true);
  });
});

describe('sub-dimension weight validation', () => {
  it('a row with no sub-rows is always valid', () => {
    expect(isSubRowWeightValid(row())).toBe(true);
  });

  it('is valid when sub-rows sum to the parent weight', () => {
    const parent = row({
      weight: 50,
      subRows: [row({ id: 's1', weight: 30 }), row({ id: 's2', weight: 20 })],
    });
    expect(subRowWeightSum(parent)).toBe(50);
    expect(isSubRowWeightValid(parent)).toBe(true);
  });

  it('is invalid when sub-rows do not sum to the parent weight', () => {
    const parent = row({
      weight: 50,
      subRows: [row({ id: 's1', weight: 30 }), row({ id: 's2', weight: 10 })],
    });
    expect(isSubRowWeightValid(parent)).toBe(false);
  });

  it('findInvalidRowIds finds a mismatched sub-dimension at any depth', () => {
    const rows = [
      row({ id: 'ok', weight: 50, subRows: [row({ id: 's1', weight: 50 })] }),
      row({ id: 'bad', weight: 50, subRows: [row({ id: 's2', weight: 10 })] }),
    ];
    expect(findInvalidRowIds(rows)).toEqual(['bad']);
  });

  it('isRubricValid is true only when both top-level and every sub-level sum correctly', () => {
    const valid = [
      row({ id: 'a', weight: 50, subRows: [row({ id: 's1', weight: 50 })] }),
      row({ id: 'b', weight: 50 }),
    ];
    expect(isRubricValid(valid)).toBe(true);

    const invalidSub = [
      row({ id: 'a', weight: 50, subRows: [row({ id: 's1', weight: 40 })] }),
      row({ id: 'b', weight: 50 }),
    ];
    expect(isRubricValid(invalidSub)).toBe(false);

    const invalidTotal = [row({ id: 'a', weight: 40 }), row({ id: 'b', weight: 40 })];
    expect(isRubricValid(invalidTotal)).toBe(false);
  });
});

describe('compileRubric', () => {
  it('compiles flat rows into RubricCriterion with weight-derived maxPoints', () => {
    const rows = [row({ id: 'a', name: 'Accuracy', weight: 75 }), row({ id: 'b', name: 'Style', weight: 25 })];
    expect(compileRubric(rows, LEVELS, 20)).toEqual([
      { name: 'Accuracy', maxPoints: 15 },
      { name: 'Style', maxPoints: 5 },
    ]);
  });

  it('only compiles leaf rows — a parent with sub-dimensions is organizational only', () => {
    const rows = [
      row({
        id: 'p', name: 'Parent', weight: 100,
        subRows: [row({ id: 's1', name: 'Child A', weight: 60 }), row({ id: 's2', name: 'Child B', weight: 40 })],
      }),
    ];
    const compiled = compileRubric(rows, LEVELS, 10);
    expect(compiled).toEqual([
      { name: 'Parent: Child A', maxPoints: 6 },
      { name: 'Parent: Child B', maxPoints: 4 },
    ]);
  });

  it('joins non-empty level descriptions with a separator', () => {
    const rows = [row({ id: 'a', name: 'Accuracy', weight: 100, descriptions: { a: 'Flawless', b: 'Wrong' } })];
    expect(compileRubric(rows, LEVELS, 10)[0].description).toBe('Flawless | Wrong');
  });

  it('omits description when no level text was entered', () => {
    const rows = [row({ id: 'a', name: 'Accuracy', weight: 100 })];
    expect(compileRubric(rows, LEVELS, 10)[0].description).toBeUndefined();
  });
});
