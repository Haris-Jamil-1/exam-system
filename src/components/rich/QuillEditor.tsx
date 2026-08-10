'use client';
import { useEffect, useRef, useState } from 'react';
import type Quill from 'quill';
import { Bold, Italic, Underline, List, ListOrdered, Image as ImageIcon, Sigma, FlaskConical, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadItemImage } from '@/lib/upload-item-image';
import { RichText } from './RichText';
import { MathInputDialog, type MathDialogMode } from './MathInputDialog';

export interface QuillEditorProps {
  /** The field's stored HTML value (see rich-text.ts's "Real WYSIWYG" section for format). */
  value: string;
  onValueChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Shorter editing surface + no list buttons, for answer-option-shaped fields. */
  compact?: boolean;
  className?: string;
}

type ActiveFormats = { bold?: boolean; italic?: boolean; underline?: boolean; list?: string | boolean };

function ToolbarButton({
  icon, title, active, disabled, onClick,
}: { icon: React.ReactNode; title: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center justify-center rounded border px-2 py-1 text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        active ? 'bg-muted text-foreground border-foreground/20' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {icon}
    </button>
  );
}

/**
 * Real WYSIWYG editor (Quill, lazy-loaded — see quill-loader.ts) for Question Stem and every
 * answer-option-shaped field. Uncontrolled/imperative on purpose (Quill owns its own DOM/cursor
 * state; `value` only seeds the initial content, `onValueChange` reports `quill.root.innerHTML`
 * out on every edit) — matches how every real-world React/Quill integration works, and avoids the
 * cursor-jump bugs a fully-controlled re-render would cause.
 *
 * Math/Chemistry reuse the existing `MathInputDialog` unchanged; on insert, the LaTeX is embedded
 * via the custom `formula` blot (quill-loader.ts) rather than spliced into the text — see that
 * file for why it deliberately does not render KaTeX inside the editor itself. A preview appears
 * once the content actually contains a formula, since that's the one thing the editor's own
 * canvas doesn't show WYSIWYG-accurately.
 */
export function QuillEditor({ value, onValueChange, placeholder, disabled, compact, className }: QuillEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onValueChange);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [active, setActive] = useState<ActiveFormats>({});
  const [dialogMode, setDialogMode] = useState<MathDialogMode | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    onChangeRef.current = onValueChange;
  }, [onValueChange]);

  useEffect(() => {
    let cancelled = false;
    let quill: Quill | null = null;

    async function init() {
      try {
        const { default: Q } = await import('./quill-loader');
        const container = containerRef.current;
        if (cancelled || !container) return;
        quill = new Q(container, {
          theme: 'snow',
          modules: { toolbar: false },
          placeholder,
        });
        quill.root.innerHTML = value;
        quill.on('text-change', () => {
          if (quill) onChangeRef.current(quill.root.innerHTML);
        });
        const syncActive = () => {
          if (!quill) return;
          // getFormat() reads the current selection range internally and throws if there isn't
          // one (e.g. focus moved to the Math dialog, or the editor blurred) — only call it when
          // a real range exists, matching Quill's own documented getSelection()-first pattern.
          const range = quill.getSelection();
          setActive(range ? (quill.getFormat(range) as ActiveFormats) : {});
        };
        quill.on('selection-change', syncActive);
        quill.on('text-change', syncActive);
        quillRef.current = quill;
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('failed');
      }
    }

    void init();
    return () => {
      cancelled = true;
      quillRef.current = null;
    };
    // Intentionally mount-once: `value` only seeds initial content (see component doc comment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(format: 'bold' | 'italic' | 'underline') {
    const quill = quillRef.current;
    if (!quill) return;
    quill.format(format, !active[format]);
  }

  function toggleList(kind: 'bullet' | 'ordered') {
    const quill = quillRef.current;
    if (!quill) return;
    quill.format('list', active.list === kind ? false : kind);
  }

  function insertFormula(latex: string, display: boolean) {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection(true) ?? { index: quill.getLength(), length: 0 };
    quill.insertEmbed(range.index, 'formula', { latex, display }, 'user');
    quill.insertText(range.index + 1, ' ', 'user');
    quill.setSelection(range.index + 2, 0, 'user');
  }

  async function handleImageFile(file: File) {
    const quill = quillRef.current;
    if (!quill) return;
    setUploading(true);
    try {
      const url = await uploadItemImage(file);
      if (url) {
        const range = quill.getSelection(true) ?? { index: quill.getLength(), length: 0 };
        quill.insertEmbed(range.index, 'image', url, 'user');
        quill.setSelection(range.index + 1, 0, 'user');
      }
    } finally {
      setUploading(false);
    }
  }

  const hasFormula = value.includes('ql-formula');

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-1">
        <ToolbarButton icon={<Bold className="h-3.5 w-3.5" />} title="Bold" active={!!active.bold} disabled={disabled || status !== 'ready'} onClick={() => toggle('bold')} />
        <ToolbarButton icon={<Italic className="h-3.5 w-3.5" />} title="Italic" active={!!active.italic} disabled={disabled || status !== 'ready'} onClick={() => toggle('italic')} />
        <ToolbarButton icon={<Underline className="h-3.5 w-3.5" />} title="Underline" active={!!active.underline} disabled={disabled || status !== 'ready'} onClick={() => toggle('underline')} />
        {!compact && (
          <>
            <ToolbarButton icon={<List className="h-3.5 w-3.5" />} title="Bulleted list" active={active.list === 'bullet'} disabled={disabled || status !== 'ready'} onClick={() => toggleList('bullet')} />
            <ToolbarButton icon={<ListOrdered className="h-3.5 w-3.5" />} title="Numbered list" active={active.list === 'ordered'} disabled={disabled || status !== 'ready'} onClick={() => toggleList('ordered')} />
          </>
        )}
        <ToolbarButton
          icon={uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          title="Insert an image"
          disabled={disabled || status !== 'ready' || uploading}
          onClick={() => fileInputRef.current?.click()}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleImageFile(file);
          }}
        />
        <span className="h-4 w-px bg-border mx-0.5" aria-hidden="true" />
        <ToolbarButton icon={<Sigma className="h-3.5 w-3.5" />} title="Insert an equation" disabled={disabled || status !== 'ready'} onClick={() => setDialogMode('math')} />
        <ToolbarButton icon={<FlaskConical className="h-3.5 w-3.5" />} title="Insert a chemical formula or equation" disabled={disabled || status !== 'ready'} onClick={() => setDialogMode('chem')} />
      </div>

      <div
        ref={containerRef}
        className={cn(
          'rounded-md border bg-background text-sm [&_.ql-editor]:min-h-[2.25rem]',
          compact ? '[&_.ql-editor]:py-1.5 [&_.ql-editor]:px-3' : '[&_.ql-editor]:min-h-[7rem]',
        )}
      />
      {status === 'failed' && (
        <p className="text-xs text-red-600">Editor failed to load — check your connection and reload.</p>
      )}

      {hasFormula && (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Preview</p>
          <RichText content={value} className="text-sm" />
        </div>
      )}

      <MathInputDialog
        open={dialogMode !== null}
        mode={dialogMode ?? 'math'}
        onOpenChange={open => setDialogMode(open ? dialogMode : null)}
        onInsert={insertFormula}
      />
    </div>
  );
}
