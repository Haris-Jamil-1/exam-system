'use client';

import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Sigma, FlaskConical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { containsMath, insertLatexAt } from '@/lib/rich-text';
import { RichText } from './RichText';
import { MathInputDialog, type MathDialogMode } from './MathInputDialog';

interface MathFieldBaseProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Rendered to the right of the Math/Chemistry buttons (e.g. the existing "AI Assist" action). */
  toolbarExtra?: ReactNode;
  /** Hides the toolbar label text — for tight rows like the answer-option list. */
  compact?: boolean;
}

/**
 * Shared behaviour for the two authoring controls: an insert-at-caret toolbar over the project's
 * existing `Input`/`Textarea` primitives, plus a live preview that appears only once the field
 * actually contains an expression. Deliberately a wrapper rather than a replacement — the raw
 * LaTeX stays in the field, so the value written to the database is still the same plain string
 * these fields always produced.
 */
function useMathToolbar(
  elementRef: RefObject<HTMLTextAreaElement | null> | RefObject<HTMLInputElement | null>,
  value: string,
  onValueChange: (value: string) => void,
) {
  const [dialogMode, setDialogMode] = useState<MathDialogMode | null>(null);

  const insert = useCallback(
    (latex: string, display: boolean) => {
      const element = elementRef.current;
      const start = element?.selectionStart ?? value.length;
      const end = element?.selectionEnd ?? start;
      const result = insertLatexAt(value, start, end, latex, display);
      onValueChange(result.value);
      requestAnimationFrame(() => {
        element?.focus();
        element?.setSelectionRange(result.cursor, result.cursor);
      });
    },
    [elementRef, value, onValueChange],
  );

  // Ctrl/Cmd+M opens the equation dialog, Ctrl/Cmd+Shift+M the chemistry one — a teacher writing
  // a paper full of equations should never have to leave the keyboard for the toolbar.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      // `code` is the layout-independent fallback — with Shift held, some layouts report a
      // different `key` than the plain letter.
      if (event.key.toLowerCase() !== 'm' && event.code !== 'KeyM') return;
      event.preventDefault();
      setDialogMode(event.shiftKey ? 'chem' : 'math');
    },
    [],
  );

  return { dialogMode, setDialogMode, insert, handleKeyDown };
}

// Shown in the toolbar tooltips. Deliberately not platform-detected: reading `navigator` during
// render would both break the React Compiler's purity rule and hydrate differently than it
// server-rendered, and naming both modifiers is clearer than guessing wrong.
const MATH_SHORTCUT = 'Ctrl/Cmd+M';
const CHEM_SHORTCUT = 'Ctrl/Cmd+Shift+M';

function MathToolbar({
  compact,
  toolbarExtra,
  disabled,
  onOpen,
}: {
  compact?: boolean;
  toolbarExtra?: ReactNode;
  disabled?: boolean;
  onOpen: (mode: MathDialogMode) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ToolbarButton
        disabled={disabled}
        onClick={() => onOpen('math')}
        icon={<Sigma className="h-3.5 w-3.5" />}
        label="Math"
        compact={compact}
        title="Insert an equation"
        hint={MATH_SHORTCUT}
      />
      <ToolbarButton
        disabled={disabled}
        onClick={() => onOpen('chem')}
        icon={<FlaskConical className="h-3.5 w-3.5" />}
        label="Chemistry"
        compact={compact}
        title="Insert a chemical formula or equation"
        hint={CHEM_SHORTCUT}
      />
      {toolbarExtra && <div className="ms-auto">{toolbarExtra}</div>}
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  compact,
  title,
  hint,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  compact?: boolean;
  title: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint ? `${title} (${hint})` : title}
      aria-label={title}
      aria-keyshortcuts={hint}
      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {icon}
      {!compact && label}
    </button>
  );
}

function MathPreview({ value, className }: { value: string; className?: string }) {
  if (!containsMath(value)) return null;
  return (
    <div className={cn('rounded-md border border-dashed bg-muted/30 px-3 py-2', className)}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Preview</p>
      <div className="text-sm overflow-x-auto">
        <RichText content={value} />
      </div>
    </div>
  );
}

/** Multi-line authoring control — question stems and explanations. */
export function MathTextarea({
  value,
  onValueChange,
  placeholder,
  className,
  disabled,
  toolbarExtra,
  rows = 4,
  onBlur,
}: MathFieldBaseProps & { rows?: number; onBlur?: () => void }) {
  const elementRef = useRef<HTMLTextAreaElement>(null);
  const { dialogMode, setDialogMode, insert, handleKeyDown } =
    useMathToolbar(elementRef, value, onValueChange);

  return (
    <div className="space-y-2">
      <MathToolbar disabled={disabled} toolbarExtra={toolbarExtra} onOpen={setDialogMode} />
      <Textarea
        ref={elementRef}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        onChange={event => onValueChange(event.target.value)}
      />
      <MathPreview value={value} />
      <MathInputDialog
        open={dialogMode !== null}
        mode={dialogMode ?? 'math'}
        onOpenChange={open => setDialogMode(open ? dialogMode : null)}
        onInsert={insert}
      />
    </div>
  );
}

/** Single-line authoring control — answer options, matching pairs, short correct answers. */
export function MathInput({
  value,
  onValueChange,
  placeholder,
  className,
  disabled,
  compact = true,
}: MathFieldBaseProps) {
  const elementRef = useRef<HTMLInputElement>(null);
  const { dialogMode, setDialogMode, insert, handleKeyDown } =
    useMathToolbar(elementRef, value, onValueChange);

  return (
    <div className="flex-1 space-y-1">
      <div className="flex items-center gap-1">
        <Input
          ref={elementRef}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          className={className}
          onKeyDown={handleKeyDown}
          onChange={event => onValueChange(event.target.value)}
        />
        <MathToolbar compact={compact} disabled={disabled} onOpen={setDialogMode} />
      </div>
      <MathPreview value={value} className="py-1" />
      <MathInputDialog
        open={dialogMode !== null}
        mode={dialogMode ?? 'math'}
        onOpenChange={open => setDialogMode(open ? dialogMode : null)}
        onInsert={insert}
      />
    </div>
  );
}
