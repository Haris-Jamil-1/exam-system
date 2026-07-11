'use client';
// Teacher grading controls for one essay/coding answer (Phase 3, doc 03).
// Shows the AI suggestion decomposed by rubric criterion with quoted evidence,
// coding execution results, and Confirm / Override / Regrade actions.
// Decision 4: confirmation is always explicit — nothing here auto-applies.
import { useState } from 'react';
import type { GradingSuggestion } from '@/lib/data/students';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Check, Pencil, RefreshCw } from 'lucide-react';

interface ExecutionSummary {
  available?: boolean;
  passedCount?: number;
  totalCount?: number;
  error?: string;
  results?: { passed: boolean; statusDescription: string; isHidden: boolean }[];
}

interface GradingPanelProps {
  answerId: string;
  maxMarks: number;
  gradingStatus: string;
  suggestion: GradingSuggestion | null;
  onChanged: () => void;
}

export function GradingPanel({ answerId, maxMarks, gradingStatus, suggestion, onChanged }: GradingPanelProps) {
  const [busy, setBusy] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [overrideMarks, setOverrideMarks] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  async function act(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/grading/answers/${answerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : 'Action failed');
      }
      setMessage(done);
      setOverriding(false);
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  const execution = suggestion?.executionResult as ExecutionSummary | null;
  const resolved = gradingStatus === 'confirmed' || gradingStatus === 'overridden';

  return (
    <div className="ms-6 rounded-lg border border-blue-100 bg-blue-50/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          AI-assisted grading
        </p>
        <Badge
          variant={resolved ? 'success' : gradingStatus === 'ai_suggested' ? 'info' : 'warning'}
          className="text-xs capitalize"
        >
          {gradingStatus === 'pending_ai' ? 'Awaiting AI / manual grade' : gradingStatus.replace('_', ' ')}
        </Badge>
      </div>

      {execution && (
        <div className="text-xs space-y-1">
          <p className="font-medium">
            Automated tests:{' '}
            {execution.available === false
              ? <span className="text-amber-700">unavailable ({execution.error ?? 'sandbox offline'}) — grade manually</span>
              : <span className={execution.passedCount === execution.totalCount ? 'text-green-700' : 'text-amber-700'}>
                  {execution.passedCount}/{execution.totalCount} passed
                </span>}
          </p>
          {execution.results && execution.results.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {execution.results.map((r, i) => (
                <span
                  key={i}
                  title={r.statusDescription}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${r.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                >
                  {r.isHidden ? `hidden ${i + 1}` : `test ${i + 1}`}: {r.passed ? 'pass' : 'fail'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {suggestion && gradingStatus !== 'pending_ai' && (
        <div className="space-y-2 text-xs">
          <p>
            <span className="font-medium">Suggested mark:</span>{' '}
            <span className="font-semibold">{suggestion.totalScore}/{maxMarks}</span>
            {suggestion.model && <span className="text-muted-foreground"> · {suggestion.model}</span>}
          </p>
          {suggestion.criterionScores && suggestion.criterionScores.length > 0 && (
            <div className="space-y-1">
              {suggestion.criterionScores.map(c => (
                <div key={c.name} className="rounded bg-white/70 border border-blue-100 p-2">
                  <p className="font-medium">{c.name}: {c.points} pts</p>
                  <p className="text-muted-foreground italic">&ldquo;{c.evidence}&rdquo;</p>
                </div>
              ))}
            </div>
          )}
          {suggestion.feedback && (
            <p><span className="font-medium">Draft feedback:</span> {suggestion.feedback}</p>
          )}
        </div>
      )}

      {!resolved && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {suggestion && gradingStatus === 'ai_suggested' && (
              <Button size="sm" disabled={busy} onClick={() => void act({ action: 'confirm' }, 'Suggestion confirmed — mark applied.')}>
                <Check className="h-3.5 w-3.5 me-1" /> Confirm {suggestion.totalScore}/{maxMarks}
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setOverriding(o => !o)}>
              <Pencil className="h-3.5 w-3.5 me-1" /> {gradingStatus === 'pending_ai' ? 'Grade manually' : 'Override'}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void act({ action: 'regrade' }, 'Regrade queued — refresh shortly.')}>
              <RefreshCw className="h-3.5 w-3.5 me-1" /> Regrade with AI
            </Button>
          </div>
          {overriding && (
            <div className="flex items-end gap-2 flex-wrap">
              <div>
                <label className="text-[11px] text-muted-foreground block mb-0.5">Marks (0–{maxMarks})</label>
                <input
                  type="number"
                  min={0}
                  max={maxMarks}
                  step={0.5}
                  value={overrideMarks}
                  onChange={e => setOverrideMarks(e.target.value)}
                  className="w-24 rounded border px-2 py-1 text-sm"
                />
              </div>
              <div className="flex-1 min-w-40">
                <label className="text-[11px] text-muted-foreground block mb-0.5">Reason (optional)</label>
                <input
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  className="w-full rounded border px-2 py-1 text-sm"
                  placeholder="Why this mark differs from the suggestion…"
                />
              </div>
              <Button
                size="sm"
                disabled={busy || overrideMarks === '' || Number.isNaN(Number(overrideMarks))}
                onClick={() =>
                  void act(
                    { action: 'override', marks: Number(overrideMarks), reason: overrideReason || undefined },
                    'Mark applied.',
                  )
                }
              >
                Apply
              </Button>
            </div>
          )}
        </div>
      )}
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
