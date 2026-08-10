'use client';

import { useCallback, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Sigma, FlaskConical, Bold, Italic, Underline, List, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  containsMath, insertLatexAt, wrapSelectionAt, insertListLineAt, insertSnippetAt,
  containsFormatting, containsListMarkup,
} from '@/lib/rich-text';
import { RichText } from './RichText';
import { MathInputDialog, type MathDialogMode } from './MathInputDialog';
import { uploadItemImage } from '@/lib/upload-item-image';

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

  // Shared by every caret-acting button: run `apply` against the current selection, write the
  // result back, then restore focus/caret so a teacher can keep typing without reaching for the
  // mouse.
  const withCaret = useCallback(
    (apply: (start: number, end: number) => { value: string; cursor: number }) => {
      const element = elementRef.current;
      const start = element?.selectionStart ?? value.length;
      const end = element?.selectionEnd ?? start;
      const result = apply(start, end);
      onValueChange(result.value);
      requestAnimationFrame(() => {
        element?.focus();
        element?.setSelectionRange(result.cursor, result.cursor);
      });
    },
    [elementRef, value, onValueChange],
  );

  const insert = useCallback(
    (latex: string, display: boolean) => withCaret((start, end) => insertLatexAt(value, start, end, latex, display)),
    [value, withCaret],
  );

  const toggleBold = useCallback(() => withCaret((start, end) => wrapSelectionAt(value, start, end, '**')), [value, withCaret]);
  const toggleItalic = useCallback(() => withCaret((start, end) => wrapSelectionAt(value, start, end, '*')), [value, withCaret]);
  const toggleUnderline = useCallback(() => withCaret((start, end) => wrapSelectionAt(value, start, end, '__')), [value, withCaret]);
  const insertList = useCallback(
    (ordered: boolean) => withCaret((start, end) => insertListLineAt(value, start, end, ordered)),
    [value, withCaret],
  );
  const insertImage = useCallback(
    (url: string, alt: string) => withCaret((start, end) => insertSnippetAt(value, start, end, `![${alt}](${url})`)),
    [value, withCaret],
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

  return { dialogMode, setDialogMode, insert, toggleBold, toggleItalic, toggleUnderline, insertList, insertImage, handleKeyDown };
}


// Shown in the toolbar tooltips. Deliberately not platform-detected: reading `navigator` during
// render would both break the React Compiler's purity rule and hydrate differently than it
// server-rendered, and naming both modifiers is clearer than guessing wrong.
const MATH_SHORTCUT = 'Ctrl/Cmd+M';
const CHEM_SHORTCUT = 'Ctrl/Cmd+Shift+M';

interface MathToolbarProps {
  compact?: boolean;
  toolbarExtra?: ReactNode;
  disabled?: boolean;
  onOpen: (mode: MathDialogMode) => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleUnderline: () => void;
  onInsertImage: (url: string, alt: string) => void;
  /** Omitted for single-line fields (answer options) — a list line needs a real newline, which
   *  a native `<input>` can't hold or display. */
  onInsertList?: (ordered: boolean) => void;
}

function MathToolbar({
  compact,
  toolbarExtra,
  disabled,
  onOpen,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onInsertImage,
  onInsertList,
}: MathToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadItemImage(file);
      if (url) onInsertImage(url, file.name.replace(/\.[^.]+$/, ''));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <ToolbarButton
        disabled={disabled}
        onClick={onToggleBold}
        icon={<Bold className="h-3.5 w-3.5" />}
        label="Bold"
        compact
        title="Bold"
      />
      <ToolbarButton
        disabled={disabled}
        onClick={onToggleItalic}
        icon={<Italic className="h-3.5 w-3.5" />}
        label="Italic"
        compact
        title="Italic"
      />
      <ToolbarButton
        disabled={disabled}
        onClick={onToggleUnderline}
        icon={<Underline className="h-3.5 w-3.5" />}
        label="Underline"
        compact
        title="Underline"
      />
      {onInsertList && (
        <ToolbarButton
          disabled={disabled}
          onClick={() => onInsertList(false)}
          icon={<List className="h-3.5 w-3.5" />}
          label="List"
          compact
          title="Bulleted list"
        />
      )}
      <ToolbarButton
        disabled={disabled || uploading}
        onClick={() => fileInputRef.current?.click()}
        icon={uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
        label="Image"
        compact
        title="Insert an image"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={event => void handleFileChange(event)}
      />
      <span className="h-4 w-px bg-border mx-0.5" aria-hidden="true" />
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
  if (!containsMath(value) && !containsFormatting(value) && !containsListMarkup(value)) return null;
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
  const { dialogMode, setDialogMode, insert, toggleBold, toggleItalic, toggleUnderline, insertList, insertImage, handleKeyDown } =
    useMathToolbar(elementRef, value, onValueChange);

  return (
    <div className="space-y-2">
      <MathToolbar
        disabled={disabled}
        toolbarExtra={toolbarExtra}
        onOpen={setDialogMode}
        onToggleBold={toggleBold}
        onToggleItalic={toggleItalic}
        onToggleUnderline={toggleUnderline}
        onInsertList={insertList}
        onInsertImage={insertImage}
      />
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
  const { dialogMode, setDialogMode, insert, toggleBold, toggleItalic, toggleUnderline, insertImage, handleKeyDown } =
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
        {/* No list button here — a bulleted/numbered line needs a real newline, which a
            single-line <input> can neither hold nor display. */}
        <MathToolbar
          compact={compact}
          disabled={disabled}
          onOpen={setDialogMode}
          onToggleBold={toggleBold}
          onToggleItalic={toggleItalic}
          onToggleUnderline={toggleUnderline}
          onInsertImage={insertImage}
        />
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
