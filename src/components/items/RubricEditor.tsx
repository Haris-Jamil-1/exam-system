'use client';
import { Fragment } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, CornerDownRight, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';
import {
  type RubricRow, type RubricLevelColumn,
  topLevelWeightSum, isTopLevelWeightValid, subRowWeightSum, isSubRowWeightValid,
  nextRubricId,
} from '@/lib/rubric';
import { cn } from '@/lib/utils';

interface RubricEditorProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  levels: RubricLevelColumn[];
  onLevelsChange: (levels: RubricLevelColumn[]) => void;
  rows: RubricRow[];
  onRowsChange: (rows: RubricRow[]) => void;
}

function updateRowById(rows: RubricRow[], id: string, update: (row: RubricRow) => RubricRow): RubricRow[] {
  return rows.map(row =>
    row.id === id ? update(row) : { ...row, subRows: updateRowById(row.subRows, id, update) },
  );
}

function removeRowById(rows: RubricRow[], id: string): RubricRow[] {
  return rows.filter(row => row.id !== id).map(row => ({ ...row, subRows: removeRowById(row.subRows, id) }));
}

function WeightBadge({ value, target, label }: { value: number; target: number; label: string }) {
  const ok = Math.abs(value - target) < 0.01;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
      )}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {label}: {value}% / {target}%
    </span>
  );
}

/**
 * Hierarchical scoring rubric editor for essay questions. Rows (dimensions) and columns
 * (performance levels) are both fully custom — add/rename/delete either — and a dimension can
 * carry one level of "sub-dimensions" nested under it via "Add Sub-dimension". Validated in real
 * time: top-level dimension weights must sum to 100%, and a parent's sub-dimension weights must
 * sum to that parent's own weight (both surfaced as red/green badges as the teacher types).
 *
 * Storage note: only the *compiled* flat criteria list (lib/rubric.ts's compileRubric) is ever
 * persisted, in the exact shape the AI grading pipeline already reads — this editor's hierarchy
 * is an authoring-time convenience, not a new data model on the Item/Question row.
 */
export function RubricEditor({ enabled, onEnabledChange, levels, onLevelsChange, rows, onRowsChange }: RubricEditorProps) {
  const topSum = topLevelWeightSum(rows);
  const topValid = isTopLevelWeightValid(rows);

  function addRow() {
    onRowsChange([...rows, { id: nextRubricId('row'), name: '', weight: 0, descriptions: {}, subRows: [] }]);
  }

  function addSubRow(parentId: string) {
    onRowsChange(
      updateRowById(rows, parentId, row => ({
        ...row,
        subRows: [...row.subRows, { id: nextRubricId('row'), name: '', weight: 0, descriptions: {}, subRows: [] }],
      })),
    );
  }

  function removeRow(id: string) {
    onRowsChange(removeRowById(rows, id));
  }

  function patchRow(id: string, patch: Partial<RubricRow>) {
    onRowsChange(updateRowById(rows, id, row => ({ ...row, ...patch })));
  }

  function setDescription(id: string, levelId: string, text: string) {
    onRowsChange(updateRowById(rows, id, row => ({ ...row, descriptions: { ...row.descriptions, [levelId]: text } })));
  }

  function addLevel() {
    onLevelsChange([...levels, { id: nextRubricId('level'), label: `Level ${levels.length + 1}` }]);
  }

  function removeLevel(id: string) {
    onLevelsChange(levels.filter(l => l.id !== id));
  }

  function renameLevel(id: string, label: string) {
    onLevelsChange(levels.map(l => (l.id === id ? { ...l, label } : l)));
  }

  function renderRow(row: RubricRow, depth: number): React.ReactNode {
    return (
      <Fragment key={row.id}>
        <tr className={depth > 0 ? 'bg-muted/10' : undefined}>
          <td className="px-3 py-2 align-top" style={{ paddingInlineStart: `${0.75 + depth * 1.25}rem` }}>
            <div className="flex items-center gap-1">
              {depth > 0 && <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              <Input
                placeholder="Dimension name"
                value={row.name}
                onChange={e => patchRow(row.id, { name: e.target.value })}
                className="h-7 text-xs"
              />
              {row.isVeto && (
                <span className="shrink-0 inline-flex items-center gap-0.5 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600" title="Veto criterion">
                  <ShieldAlert className="h-2.5 w-2.5" /> Veto
                </span>
              )}
            </div>
          </td>
          {levels.map(level => (
            <td key={level.id} className="px-3 py-2 align-top">
              <Input
                placeholder="Describe..."
                value={row.descriptions[level.id] ?? ''}
                onChange={e => setDescription(row.id, level.id, e.target.value)}
                className="text-xs h-7"
              />
            </td>
          ))}
          <td className="px-3 py-2 align-top">
            <Input
              type="number"
              min={0}
              max={100}
              value={row.weight}
              onChange={e => patchRow(row.id, { weight: e.target.valueAsNumber || 0 })}
              className="text-xs h-7 w-16"
            />
          </td>
          <td className="px-3 py-2 align-top">
            <div className="flex items-center gap-1">
              {row.subRows.length === 0 && (
                <button
                  type="button"
                  onClick={() => patchRow(row.id, { isVeto: !row.isVeto })}
                  title={row.isVeto
                    ? 'Veto criterion: a zero AI score here nullifies the whole item. Click to unset.'
                    : 'Mark as a veto criterion (e.g. Academic Integrity) — a zero AI score here nullifies the whole item\'s suggested score.'}
                  className={cn(
                    'p-1 rounded transition-colors',
                    row.isVeto ? 'text-red-600 bg-red-50' : 'text-muted-foreground hover:text-red-600 hover:bg-red-50',
                  )}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                </button>
              )}
              <Button type="button" variant="ghost" size="sm" className="h-7 px-1.5 text-xs" onClick={() => addSubRow(row.id)} title="Add sub-dimension">
                <Plus className="h-3 w-3" />
              </Button>
              <button type="button" onClick={() => removeRow(row.id)} className="text-red-400 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </td>
        </tr>
        {row.subRows.length > 0 && (
          <tr>
            <td colSpan={levels.length + 3} className="px-3 pb-1 pt-0">
              <WeightBadge value={subRowWeightSum(row)} target={row.weight} label="Sub-dimensions" />
              {!isSubRowWeightValid(row) && (
                <span className="ms-2 text-[11px] text-muted-foreground">
                  must sum to this dimension&apos;s own {row.weight}% weight
                </span>
              )}
            </td>
          </tr>
        )}
        {row.subRows.map(sub => renderRow(sub, depth + 1))}
      </Fragment>
    );
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => onEnabledChange(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm font-medium">Enable AI Auto-Grading</span>
        <span className="text-xs text-muted-foreground">
          {enabled
            ? 'Claude suggests a score against this rubric; a teacher still confirms or overrides it.'
            : 'This essay will be graded manually only — no rubric is saved.'}
        </span>
      </label>

      {enabled && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <WeightBadge value={topSum} target={100} label="Total weight" />
            <Button type="button" variant="outline" size="sm" onClick={addLevel} className="gap-1 h-7 text-xs">
              <Plus className="h-3 w-3" /> Add Level
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-start px-3 py-2 font-medium">Dimension</th>
                  {levels.map(level => (
                    <th key={level.id} className="px-3 py-2 font-medium">
                      <div className="flex items-center gap-1">
                        <Input
                          value={level.label}
                          onChange={e => renameLevel(level.id, e.target.value)}
                          className="h-7 text-xs text-center font-medium"
                        />
                        {levels.length > 1 && (
                          <button type="button" onClick={() => removeLevel(level.id)} className="text-red-400 hover:text-red-600 shrink-0">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium text-center w-20">Weight %</th>
                  <th className="px-3 py-2 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(row => renderRow(row, 0))}
              </tbody>
            </table>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
            <Plus className="h-3 w-3" /> Add Dimension
          </Button>
          {!topValid && (
            <p className="text-xs text-red-600">Dimension weights must sum to exactly 100% before this rubric can be saved.</p>
          )}
        </>
      )}
    </div>
  );
}
