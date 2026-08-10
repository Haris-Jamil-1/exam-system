'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  parseRichText, containsMath, parseInlineFormatting, containsFormatting,
  splitBlocks, containsListMarkup, looksLikeRichHtml, stripHtml,
} from '@/lib/rich-text';
import MathSegment from './MathSegment';
import type { ExtractedFormula, splitOnFormulaTokens } from './rich-html';

export interface RichTextProps {
  /** Raw field value straight from the database — plain text that may contain LaTeX delimiters
   *  and/or the lightweight bold/italic/underline/image/list markers from `lib/rich-text.ts`. */
  content: string | null | undefined;
  className?: string;
}

/** One literal-text run (already math-free) split into inline formatting segments. */
function FormattedRun({ text }: { text: string }) {
  if (!containsFormatting(text)) return <>{text}</>;
  return (
    <>
      {parseInlineFormatting(text).map((segment, index) => {
        switch (segment.kind) {
          case 'bold':
            return <strong key={index}>{segment.text}</strong>;
          case 'italic':
            return <em key={index}>{segment.text}</em>;
          case 'underline':
            return <span key={index} className="underline">{segment.text}</span>;
          case 'image':
            // eslint-disable-next-line @next/next/no-img-element -- authored content image, arbitrary source
            return <img key={index} src={segment.src} alt={segment.alt} className="inline-block max-h-48 max-w-full rounded align-middle" />;
          default:
            return <span key={index}>{segment.value}</span>;
        }
      })}
    </>
  );
}

/** One paragraph/list-item's text: math segments first, formatting within each text run. */
function InlineContent({ text }: { text: string }) {
  const segments = parseRichText(text);
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === 'math'
          ? <MathSegment key={index} latex={segment.latex} display={segment.display} />
          : <FormattedRun key={index} text={segment.value} />,
      )}
    </>
  );
}

/**
 * Renders genuine Quill-authored HTML (gated by `looksLikeRichHtml` in the parent below, so this
 * only ever runs for content that verifiably came from the new editor — see rich-text.ts's "Real
 * WYSIWYG" section for the full rationale). Sanitizing needs a real DOM (DOMPurify) and formula
 * extraction needs `DOMParser`, so both are lazy-loaded client-side only, mirroring
 * `MathSegment.tsx`'s own async-render-then-swap pattern — this keeps the component SSR-safe (the
 * pre-hydration/load-failure fallback is plain visible text, never raw unsanitized markup) without
 * pulling DOMPurify into every server render.
 */
interface RichHtmlParts {
  parts: ReturnType<typeof splitOnFormulaTokens>;
  formulas: ExtractedFormula[];
}

function SanitizedHtml({ html, className }: { html: string; className?: string }) {
  const [rendered, setRendered] = useState<RichHtmlParts | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const [{ extractFormulas, splitOnFormulaTokens }, { sanitizeRichHtml }] = await Promise.all([
          import('./rich-html'),
          import('./sanitize-html-loader'),
        ]);
        const extracted = extractFormulas(html);
        const sanitized = sanitizeRichHtml(extracted.html);
        if (!cancelled) setRendered({ parts: splitOnFormulaTokens(sanitized), formulas: extracted.formulas });
      } catch {
        if (!cancelled) setRendered(null);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [html]);

  if (!rendered) {
    return <span className={className} dir="auto">{stripHtml(html)}</span>;
  }

  return (
    <span className={className} dir="auto">
      {rendered.parts.map((part, index) =>
        part.kind === 'formula' ? (
          rendered.formulas[part.index] && (
            <MathSegment key={index} latex={rendered.formulas[part.index].latex} display={rendered.formulas[part.index].display} />
          )
        ) : (
          // DOMPurify-sanitized just above (allowlisted tags only) before this ever runs.
          <span key={index} dangerouslySetInnerHTML={{ __html: part.value }} />
        ),
      )}
    </span>
  );
}

/**
 * The single renderer for question stems, answer options and explanations. Every surface that
 * displays authored content — the student exam page, the post-submission review, the teacher's
 * per-student answer review, the item builder's live preview, the bank/admin/wizard list previews —
 * goes through this one component, so math/chemistry/formatting can never render differently in
 * two places or be supported in one and not the other.
 *
 * `dir="auto"` lets the browser infer each piece of content's own direction from what it actually
 * contains, instead of inheriting the surrounding UI's language — so English content authored in
 * an Arabic-language UI (or vice versa) still aligns and places punctuation correctly.
 *
 * Fast path: content with no math/formatting/list markers renders as a single plain `<span>`,
 * exactly as every call site did before rich formatting existed, and never touches KaTeX or the
 * formatting/list parsers.
 *
 * Stem and answer-option fields can also now hold genuine HTML authored by the Quill editor
 * (`QuillEditor.tsx`) — `looksLikeRichHtml` (checked first, below) is the one signal that
 * distinguishes that from everything else this function handles, and is deliberately narrow (see
 * `lib/rich-text.ts`'s "Real WYSIWYG" section) so no historical/AI-generated/CSV-imported row can
 * ever be misread as HTML.
 */
export function RichText({ content, className }: RichTextProps) {
  const source = content ?? '';
  const isRichHtml = useMemo(() => looksLikeRichHtml(source), [source]);
  const hasMath = useMemo(() => containsMath(source), [source]);
  const hasFormatting = useMemo(() => containsFormatting(source), [source]);
  const hasList = useMemo(() => containsListMarkup(source), [source]);

  if (isRichHtml) {
    return <SanitizedHtml html={source} className={className} />;
  }

  if (!hasMath && !hasFormatting && !hasList) {
    return <span className={className} dir="auto">{source}</span>;
  }

  if (!hasList) {
    // Single inline run — stays a plain <span> so this never becomes block-level content inside
    // a <p>/<Badge>/table cell the way every pre-existing call site already nests it.
    return (
      <span className={className} dir="auto">
        <InlineContent text={source} />
      </span>
    );
  }

  // A list is present: render as a sequence of `display:block` <span>s (never a real
  // <ul>/<ol>/<div>), so nesting stays valid even inside a <p> or inline badge. `pre-wrap` only
  // applies once blocks exist — plain single-paragraph content above is untouched.
  const blocks = splitBlocks(source);
  return (
    <span className={className} dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
      {blocks.map((block, blockIndex) =>
        block.kind === 'list' ? (
          block.items.map((item, itemIndex) => (
            <span key={`${blockIndex}-${itemIndex}`} className="block ps-4">
              {block.ordered ? `${itemIndex + 1}. ` : '• '}
              <InlineContent text={item} />
            </span>
          ))
        ) : (
          <span key={blockIndex} className="block">
            <InlineContent text={block.text} />
          </span>
        ),
      )}
    </span>
  );
}
