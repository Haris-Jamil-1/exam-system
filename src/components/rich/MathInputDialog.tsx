'use client';

import { useEffect, useRef, useState } from 'react';
import type { MathfieldElement } from 'mathlive';
import { Sigma, FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { loadMathfieldElement } from './mathlive-loader';
import MathSegment from './MathSegment';

export type MathDialogMode = 'math' | 'chem';

/**
 * Visual equation input. `math` mode drives a MathLive mathfield — a teacher builds the expression
 * by typing/clicking and never has to know LaTeX. `chem` mode takes a chemical formula in mhchem's
 * own plain notation (`H2SO4 + 2NaOH -> Na2SO4 + 2H2O`) because MathLive has no chemistry keyboard;
 * it is wrapped in `\ce{...}` on insert.
 *
 * The generated LaTeX stays visible and editable in both modes (product decision: teachers who know
 * LaTeX keep working directly in the source, and LaTeX pasted from other tools keeps working).
 */
export function MathInputDialog({
  open,
  mode,
  onOpenChange,
  onInsert,
}: {
  open: boolean;
  mode: MathDialogMode;
  onOpenChange: (open: boolean) => void;
  /** Receives the finished LaTeX body (no delimiters) and whether it should render as a block. */
  onInsert: (latex: string, display: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Body state lives one level down so unmounting the closed dialog is what clears a
            previous expression — a reset effect here would trip the React Compiler's
            set-state-in-effect rule this repo lints as an error. */}
        {open && <MathDialogBody mode={mode} onOpenChange={onOpenChange} onInsert={onInsert} />}
      </DialogContent>
    </Dialog>
  );
}

function MathDialogBody({
  mode,
  onOpenChange,
  onInsert,
}: {
  mode: MathDialogMode;
  onOpenChange: (open: boolean) => void;
  onInsert: (latex: string, display: boolean) => void;
}) {
  const [latex, setLatex] = useState('');
  const [display, setDisplay] = useState(false);
  const chemInputRef = useRef<HTMLInputElement>(null);

  const body = latex.trim();
  const previewLatex = mode === 'chem' ? `\\ce{${body}}` : body;

  function handleInsert() {
    if (!body) return;
    onInsert(previewLatex, display);
    onOpenChange(false);
  }

  function insertChemSnippet(snippet: string) {
    const el = chemInputRef.current;
    if (!el) {
      setLatex(prev => prev + snippet);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    setLatex(el.value.slice(0, start) + snippet + el.value.slice(end));
    // Restore the caret after React commits the controlled value.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="h-8 w-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
            {mode === 'math' ? <Sigma className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
          </span>
          {mode === 'math' ? 'Insert equation' : 'Insert chemistry'}
        </DialogTitle>
        <DialogDescription>
          {mode === 'math'
            ? 'Build the expression below — no LaTeX knowledge needed. The generated source stays editable.'
            : 'Type the formula in plain notation, e.g. H2SO4 + 2NaOH -> Na2SO4 + 2H2O.'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {mode === 'math' ? (
          <MathfieldEditor latex={latex} onLatexChange={setLatex} />
        ) : (
          <div className="space-y-2">
            <Input
              ref={chemInputRef}
              value={latex}
              onChange={e => setLatex(e.target.value)}
              placeholder="H2SO4 + 2NaOH -> Na2SO4 + 2H2O"
              className="font-mono"
            />
            <div className="flex flex-wrap gap-1">
              {CHEM_SNIPPETS.map(snippet => (
                <button
                  key={snippet.insert}
                  type="button"
                  onClick={() => insertChemSnippet(snippet.insert)}
                  className="rounded border px-2 py-0.5 text-xs font-mono hover:bg-muted transition-colors"
                  title={snippet.title}
                >
                  {snippet.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground font-normal">LaTeX source</Label>
          <Input
            value={mode === 'chem' ? previewLatex : latex}
            onChange={e => setLatex(e.target.value)}
            readOnly={mode === 'chem'}
            placeholder="\frac{a}{b}"
            className="font-mono text-xs"
          />
        </div>

        <div className="rounded-lg border bg-muted/40 p-4 min-h-16 flex items-center justify-center overflow-x-auto">
          {body ? (
            <MathSegment latex={previewLatex} display={display} />
          ) : (
            <span className="text-xs text-muted-foreground">Preview appears here</span>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={display}
            onChange={e => setDisplay(e.target.checked)}
            className="h-4 w-4"
          />
          Display on its own line (centred block)
        </label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" onClick={handleInsert} disabled={!body}>
          Insert
        </Button>
      </DialogFooter>
    </>
  );
}

const CHEM_SNIPPETS: Array<{ label: string; insert: string; title: string }> = [
  { label: '→', insert: ' -> ', title: 'Reaction arrow' },
  { label: '⇌', insert: ' <=> ', title: 'Equilibrium' },
  { label: 'x²⁺', insert: '^2+', title: 'Positive charge' },
  { label: 'x²⁻', insert: '^2-', title: 'Negative charge' },
  { label: '(aq)', insert: '(aq)', title: 'Aqueous' },
  { label: '(s)', insert: '(s)', title: 'Solid' },
  { label: '(l)', insert: '(l)', title: 'Liquid' },
  { label: '(g)', insert: '(g)', title: 'Gas' },
  { label: 'Δ', insert: '\\Delta', title: 'Heat / change' },
];

/**
 * Thin React wrapper around MathLive's `<math-field>` custom element. The element is constructed
 * imperatively after the lazy chunk resolves rather than written as JSX, which keeps the whole
 * thing strictly typed (`MathfieldElement`) without declaring a custom `JSX.IntrinsicElements`
 * entry or reaching for `any`.
 */
function MathfieldEditor({
  latex,
  onLatexChange,
}: {
  latex: string;
  onLatexChange: (latex: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<MathfieldElement | null>(null);
  const changeRef = useRef(onLatexChange);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    changeRef.current = onLatexChange;
  }, [onLatexChange]);

  useEffect(() => {
    let cancelled = false;
    let field: MathfieldElement | null = null;
    const handleInput = () => {
      if (field) changeRef.current(field.value);
    };

    // Async inner function rather than a synchronous effect body — this repo's established
    // pattern for the React Compiler set-state-in-effect rule.
    async function mount() {
      try {
        const MathfieldCtor = await loadMathfieldElement();
        const container = containerRef.current;
        if (cancelled || !container) return;
        field = new MathfieldCtor();
        field.className = 'w-full min-h-12 text-lg border rounded-md px-3 py-2';
        field.addEventListener('input', handleInput);
        container.appendChild(field);
        fieldRef.current = field;
        setStatus('ready');
        field.focus();
      } catch {
        if (!cancelled) setStatus('failed');
      }
    }

    void mount();
    return () => {
      cancelled = true;
      field?.removeEventListener('input', handleInput);
      field?.remove();
      fieldRef.current = null;
    };
  }, []);

  // Keeps the mathfield in sync when the teacher edits the LaTeX source box instead.
  useEffect(() => {
    const field = fieldRef.current;
    if (field && field.value !== latex) field.value = latex;
  }, [latex]);

  return (
    <div className="space-y-1">
      <div ref={containerRef} />
      {status === 'loading' && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading equation editor…
        </p>
      )}
      {status === 'failed' && (
        <p className="text-xs text-red-600">
          The visual editor could not load. You can still type LaTeX in the source box below.
        </p>
      )}
    </div>
  );
}
