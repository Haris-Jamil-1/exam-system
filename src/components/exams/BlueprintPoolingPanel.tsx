'use client';
import { useState, useEffect } from 'react';
import { getBanksForBlueprint, getCloPoolCounts } from '@/lib/data';
import type { CloPoolRow } from '@/lib/data/pooling';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Library } from 'lucide-react';

interface BlueprintPoolingPanelProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  bankIds: string[];
  onChangeBankIds: (ids: string[]) => void;
  blueprint: Record<string, number>;
  onChangeBlueprint: (blueprint: Record<string, number>) => void;
}

export function BlueprintPoolingPanel({
  enabled, onToggle, bankIds, onChangeBankIds, blueprint, onChangeBlueprint,
}: BlueprintPoolingPanelProps) {
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);
  const [pool, setPool] = useState<CloPoolRow[]>([]);
  const [loadingPool, setLoadingPool] = useState(false);

  useEffect(() => {
    getBanksForBlueprint().then(setBanks);
  }, []);

  useEffect(() => {
    async function update() {
      if (bankIds.length === 0) { setPool([]); return; }
      setLoadingPool(true);
      const rows = await getCloPoolCounts(bankIds);
      setPool(rows);
      setLoadingPool(false);
      // Drop any blueprint entries for CLOs no longer in the pool (bank selection changed)
      const validIds = new Set(rows.map(r => r.cloId));
      const next = Object.fromEntries(Object.entries(blueprint).filter(([id]) => validIds.has(id)));
      if (Object.keys(next).length !== Object.keys(blueprint).length) onChangeBlueprint(next);
    }
    void update();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the bank selection changes
  }, [bankIds]);

  function toggleBank(id: string) {
    onChangeBankIds(bankIds.includes(id) ? bankIds.filter(b => b !== id) : [...bankIds, id]);
  }

  function setDraw(cloId: string, value: number, available: number) {
    const clamped = Math.max(0, Math.min(value, available));
    const next = { ...blueprint };
    if (clamped === 0) delete next[cloId];
    else next[cloId] = clamped;
    onChangeBlueprint(next);
  }

  const totalDraw = Object.values(blueprint).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <div>
          <span className="text-sm font-semibold">Stratified Dynamic Pooling</span>
          <p className="text-xs text-muted-foreground">Each student gets a randomly-drawn, per-CLO question set from your item banks, generated when they start the exam.</p>
        </div>
      </label>

      {enabled && (
        <div className="ps-7 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Draw from these banks</Label>
            {banks.length === 0 ? (
              <p className="text-xs text-muted-foreground">No item banks available. Create one under Item Banks first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {banks.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBank(b.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      bankIds.includes(b.id) ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-muted-foreground hover:border-gray-300'
                    }`}
                  >
                    <Library className="h-3 w-3" /> {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {bankIds.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Test Blueprint — target draw per Learning Objective</Label>
              {loadingPool ? (
                <p className="text-xs text-muted-foreground">Loading CLO pool…</p>
              ) : pool.length === 0 ? (
                <p className="text-xs text-muted-foreground">No approved items with a CLO mapping found in the selected bank(s).</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-start px-3 py-2 font-medium text-muted-foreground">CLO</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">Available</th>
                        <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">Target Draw</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {pool.map(row => {
                        const draw = blueprint[row.cloId] ?? 0;
                        const invalid = draw > row.available;
                        return (
                          <tr key={row.cloId}>
                            <td className="px-3 py-2">
                              {row.cloCode && <span className="font-mono text-muted-foreground me-1.5">{row.cloCode}</span>}
                              {row.cloText}
                            </td>
                            <td className="px-3 py-2 text-center text-muted-foreground">{row.available}</td>
                            <td className="px-3 py-2 text-center">
                              <Input
                                type="number"
                                min={0}
                                max={row.available}
                                value={draw}
                                onChange={e => setDraw(row.cloId, Number(e.target.value), row.available)}
                                className={`h-7 w-16 text-xs mx-auto text-center ${invalid ? 'border-red-400' : ''}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded px-3 py-2">
                Total exam length: <strong>{totalDraw}</strong> question{totalDraw === 1 ? '' : 's'} — drawn fresh, randomly, per student, at attempt start.
              </p>
              {totalDraw === 0 && (
                <Badge variant="outline" className="text-xs">Set at least one CLO&apos;s target draw above 0</Badge>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
