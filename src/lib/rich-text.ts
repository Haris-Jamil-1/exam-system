// Pure, testable parser for the lightweight math/chemistry markup that question stems,
// answer options and explanations may contain.
//
// `Question.stem`/`Item.stem`/`Option.text`/`ItemOption.text`/`explanation` all stay plain
// `String` columns in Postgres — no schema change. This module only interprets LaTeX
// *delimiters* inside plain text at render time, so every row written before math support
// existed parses to a single `text` segment and renders byte-for-byte as it always did.
//
// Stem and answer-option fields can ALSO now hold real HTML authored by the Quill editor (see
// the "Real WYSIWYG" section further down this file) — `explanation` and fill_blank/short_answer's
// plain correctAnswer never do. `RichText.tsx` decides per-value which of the two this file's
// exports are for; `lib/scoring.ts`'s option-text equality and the Claude prompts in `lib/ai/`
// use `stripHtml()` (below) specifically because they DO need to see through that HTML now.
//
// Chemistry needs no syntax of its own: mhchem's `\ce{...}` is a normal LaTeX macro, so it lives
// inside the same math delimiters and is handled by the KaTeX mhchem extension at render time.
//
// Recognised delimiters:
//   $$...$$   display math      \[...\]   display math
//   $...$     inline math       \(...\)   inline math
//   \$        a literal dollar sign (never a delimiter)

/** One run of the source string: either literal text or one LaTeX expression. */
export type RichSegment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; latex: string; display: boolean };

/**
 * Longest LaTeX expression we will hand to KaTeX. A pathologically long expression is treated as
 * literal text instead — cheap insurance against a hostile stem making the renderer do unbounded
 * work on every student's screen. KaTeX's own `maxExpand` covers macro-expansion blowup.
 */
export const MAX_LATEX_LENGTH = 5000;

/**
 * Ceiling on rendered expressions per field. Past this, the remainder is emitted as literal text.
 * Real questions use a handful; this only bounds a deliberately abusive input.
 */
export const MAX_MATH_SEGMENTS = 200;

const DIGIT = /[0-9]/;
const WHITESPACE = /\s/;

/**
 * Finds `closer` starting at `from`, honouring backslash escapes. Returns null when the opener is
 * never terminated — an unterminated delimiter is always treated as literal text rather than
 * swallowing the rest of the field.
 */
function matchDelimited(
  input: string,
  from: number,
  closer: string,
): { content: string; end: number } | null {
  let j = from;
  while (j < input.length) {
    // The closer is checked before the escape skip because `\)` and `\]` are themselves
    // backslash-led — skipping first would step straight over the closing delimiter.
    if (input.startsWith(closer, j)) {
      return { content: input.slice(from, j), end: j + closer.length };
    }
    if (input[j] === '\\') {
      j += 2; // skip the escaped character, so \$ or \\ can't close the expression
      continue;
    }
    j += 1;
  }
  return null;
}

/**
 * Matches a single-`$` inline expression opening at `start`, using heuristics that keep prose
 * containing currency from being reinterpreted as math — the one real backward-compatibility
 * hazard for rows already in the database.
 *
 *   "Costs $5 and $10"  -> literal (closer is preceded by a space AND followed by a digit)
 *   "Solve $2x + 1 = 7$" -> math   (opener not followed by a space, closer not preceded by one)
 *
 * Rules: the opening `$` must not be followed by whitespace; the closing `$` must not be preceded
 * by whitespace nor followed by a digit; the expression must not span a blank line.
 */
function matchInlineDollar(input: string, start: number): { content: string; end: number } | null {
  const first = input[start + 1];
  if (first === undefined || first === '$' || WHITESPACE.test(first)) return null;

  let j = start + 1;
  while (j < input.length) {
    const ch = input[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '\n' && input[j + 1] === '\n') return null; // never cross a blank line
    if (ch === '$') {
      const prev = input[j - 1];
      const next = input[j + 1];
      const closes =
        j > start + 1 &&
        prev !== undefined &&
        !WHITESPACE.test(prev) &&
        (next === undefined || !DIGIT.test(next));
      if (closes) return { content: input.slice(start + 1, j), end: j + 1 };
    }
    j += 1;
  }
  return null;
}

function isRenderable(latex: string): boolean {
  return latex.trim().length > 0 && latex.length <= MAX_LATEX_LENGTH;
}

/**
 * Splits plain text into literal and LaTeX runs. Total function: any input produces segments whose
 * concatenation reproduces the visible content, and text with no delimiters yields exactly one
 * `text` segment (the common case for every pre-existing row).
 */
export function parseRichText(input: string): RichSegment[] {
  const segments: RichSegment[] = [];
  let buffer = '';
  let mathCount = 0;
  let i = 0;

  const flushText = () => {
    if (buffer) {
      segments.push({ kind: 'text', value: buffer });
      buffer = '';
    }
  };
  const pushMath = (latex: string, display: boolean) => {
    flushText();
    segments.push({ kind: 'math', latex, display });
    mathCount += 1;
  };

  while (i < input.length) {
    const ch = input[i];
    const budgetLeft = mathCount < MAX_MATH_SEGMENTS;

    if (ch === '\\') {
      const next = input[i + 1];
      if (next === '$') {
        buffer += '$'; // escaped dollar collapses to a literal one
        i += 2;
        continue;
      }
      if (budgetLeft && (next === '(' || next === '[')) {
        const display = next === '[';
        const match = matchDelimited(input, i + 2, display ? '\\]' : '\\)');
        if (match && isRenderable(match.content)) {
          pushMath(match.content, display);
          i = match.end;
          continue;
        }
      }
      buffer += ch;
      i += 1;
      continue;
    }

    if (ch === '$' && budgetLeft) {
      if (input[i + 1] === '$') {
        const match = matchDelimited(input, i + 2, '$$');
        if (match && isRenderable(match.content)) {
          pushMath(match.content, true);
          i = match.end;
          continue;
        }
      } else {
        const match = matchInlineDollar(input, i);
        if (match && isRenderable(match.content)) {
          pushMath(match.content, false);
          i = match.end;
          continue;
        }
      }
    }

    buffer += ch;
    i += 1;
  }

  flushText();
  return segments;
}

/**
 * Cheap pre-check used by the renderer's fast path: text with no delimiter characters at all can
 * skip parsing and the KaTeX chunk entirely.
 */
export function containsMath(input: string): boolean {
  if (!input.includes('$') && !input.includes('\\')) return false;
  return parseRichText(input).some(segment => segment.kind === 'math');
}

/** Wraps a bare LaTeX body in the delimiters the parser round-trips. */
export function wrapLatex(latex: string, display: boolean): string {
  return display ? `$$${latex}$$` : `$${latex}$`;
}

/**
 * Pure cursor-insertion helper backing the "Insert math"/"Insert chemistry" toolbar buttons.
 * Returns the new field value plus where the caret should land (just past the inserted snippet),
 * so the component stays a thin wrapper over the existing Input/Textarea primitives.
 */
export function insertLatexAt(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  latex: string,
  display: boolean,
): { value: string; cursor: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const snippet = wrapLatex(latex, display);
  const next = value.slice(0, start) + snippet + value.slice(end);
  return { value: next, cursor: start + snippet.length };
}

// ── Lightweight inline formatting + lists (additive) ────────────────────────────────────────
// A second, independent layer on top of the math parsing above — storage stays the exact same
// plain `String` columns (stem/option text/explanation never becomes HTML), so scoring's
// option-text equality, the Claude generation/grading prompts, pg_trgm dedup, search filters and
// CSV import are all unaffected exactly the way the math feature's own header comment describes.
// This is a deliberate, scoped alternative to a full WYSIWYG/HTML editor (Quill/TinyMCE/CKEditor)
// — none of those were already in this stack, and adopting one would force stem/option text to
// become HTML or JSON, which is the exact tradeoff this codebase already declined once (see
// CLAUDE.md's 2026-08-04 entry). Bold/italic/underline/image markers are recognised the same way
// LaTeX delimiters are: as plain-text punctuation, applied only to the literal-text runs
// `parseRichText` above already carved out (so `$a * b$` never has its `*` reinterpreted as
// italic — math parsing always runs first).
//
// Recognised markers:
//   **bold**       __underline__       *italic*       ![alt](url)
//   - item  /  1. item   (list lines; a run of consecutive list lines is one list block)

export interface FormatBold { kind: 'bold'; text: string }
export interface FormatItalic { kind: 'italic'; text: string }
export interface FormatUnderline { kind: 'underline'; text: string }
export interface FormatImage { kind: 'image'; alt: string; src: string }
export interface FormatText { kind: 'text'; value: string }
export type FormatSegment = FormatBold | FormatItalic | FormatUnderline | FormatImage | FormatText;

// Order matters: bold's `**` must be tried before italic's single `*`, and image before either
// (so `![x](y)` is never partly swallowed as italic on some earlier `*`). Content classes exclude
// `*`/`_`/newline so a marker can't accidentally span past its own closer or across a line break.
const INLINE_FORMAT_RE = /!\[([^\]]*)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*/;

/** Splits one literal-text run into formatting + plain-text segments. */
export function parseInlineFormatting(text: string): FormatSegment[] {
  const segments: FormatSegment[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = INLINE_FORMAT_RE.exec(rest);
    if (!match) {
      segments.push({ kind: 'text', value: rest });
      break;
    }
    if (match.index > 0) segments.push({ kind: 'text', value: rest.slice(0, match.index) });
    if (match[1] !== undefined) {
      segments.push({ kind: 'image', alt: match[1], src: match[2] });
    } else if (match[3] !== undefined) {
      segments.push({ kind: 'bold', text: match[3] });
    } else if (match[4] !== undefined) {
      segments.push({ kind: 'underline', text: match[4] });
    } else {
      segments.push({ kind: 'italic', text: match[5] });
    }
    rest = rest.slice(match.index + match[0].length);
  }
  return segments;
}

/** Cheap pre-check mirroring `containsMath` — lets the fast (no-op) render path skip this pass. */
export function containsFormatting(input: string): boolean {
  return INLINE_FORMAT_RE.test(input);
}

const LIST_LINE_RE = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export type RichBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

/**
 * Groups the input's lines into paragraph and list blocks — a run of consecutive `- `/`1. `
 * lines becomes one list block; every other line is its own paragraph. Rendered as inline
 * `<span>` elements with `display:block` (never real `<ul>/<div>`), so this can stay nested
 * inside every existing call site's `<p>`/`<Badge>`/table cell without invalid HTML nesting.
 */
export function splitBlocks(input: string): RichBlock[] {
  const lines = input.split('\n');
  const blocks: RichBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const match = LIST_LINE_RE.exec(lines[i]);
    if (match) {
      const ordered = /^\d/.test(match[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const itemMatch = LIST_LINE_RE.exec(lines[i]);
        if (!itemMatch || /^\d/.test(itemMatch[2]) !== ordered) break;
        items.push(itemMatch[3]);
        i += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
    } else {
      blocks.push({ kind: 'paragraph', text: lines[i] });
      i += 1;
    }
  }
  return blocks;
}

/** Cheap pre-check: is there at least one list line anywhere in the input? */
export function containsListMarkup(input: string): boolean {
  return input.split('\n').some(line => LIST_LINE_RE.test(line));
}

/** Generic caret-insert shared by the list/image toolbar buttons. */
export function insertSnippetAt(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  snippet: string,
): { value: string; cursor: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const next = value.slice(0, start) + snippet + value.slice(end);
  return { value: next, cursor: start + snippet.length };
}

/**
 * Wraps the current selection in `marker` on both sides (Bold/Italic/Underline toolbar
 * buttons). With no selection, inserts an empty marker pair and leaves the caret between them.
 */
export function wrapSelectionAt(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  marker: string,
): { value: string; cursor: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const selected = value.slice(start, end);
  const snippet = `${marker}${selected}${marker}`;
  const next = value.slice(0, start) + snippet + value.slice(end);
  const cursor = selected ? start + snippet.length : start + marker.length;
  return { value: next, cursor };
}

/** Inserts a new bulleted/numbered list line at the caret (List toolbar button). */
export function insertListLineAt(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  ordered: boolean,
): { value: string; cursor: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const needsLeadingBreak = start > 0 && value[start - 1] !== '\n';
  const marker = ordered ? '1. ' : '- ';
  return insertSnippetAt(value, selectionStart, selectionEnd, `${needsLeadingBreak ? '\n' : ''}${marker}`);
}

// ── Real WYSIWYG (Quill) content, added on top of the plain-text formats above ──────────────
// Question Stem and every answer-option-shaped field (MCQ/MRQ/matching/ordering options) are now
// authored through a real Quill editor (src/components/rich/QuillEditor.tsx), which means those
// specific fields' stored value can be genuine HTML. Everything else in this file above (and
// `explanation`, and fill_blank/short_answer's plain correctAnswer) is completely unaffected —
// this is additive, not a replacement.
//
// No migration of historical rows and no new storage format detection is needed at the schema
// level: Quill's own editor output is *structurally guaranteed* to start with one of a small set
// of block tags (`<p>`, `<ol>`, `<ul>`, `<h1>`-`<h6>`, `<blockquote>`) — nothing written before
// Quill existed (plain prose, last session's `**bold**`-style markup, AI-generated text, CSV
// imports) can possibly start with one of those five tags as its very first characters. That's
// the one, narrow signal `looksLikeRichHtml` below checks for — deliberately narrower than "does
// this contain a tag anywhere" (which would misfire on legitimate prose like "Explain the <div>
// tag"), since only the *start* of the string is examined.

const RICH_HTML_START_RE = /^\s*<(p|ol|ul|h[1-6]|blockquote)[\s>]/i;

/** True only for content that was actually authored by the Quill editor (see rationale above). */
export function looksLikeRichHtml(input: string): boolean {
  return RICH_HTML_START_RE.test(input);
}

// A small, curated set — exactly what Quill/DOMPurify output actually uses. Not a general HTML
// entity decoder; strip/comparison purposes only, not re-rendering.
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
};

/**
 * Extracts plain, comparable text from a value that may be real HTML (Quill-authored) or may be
 * plain/legacy-markup text (in which case this is a harmless no-op, since there are no tags to
 * strip). Pure string/regex work — no DOM/`document` needed, so this runs identically in a Node
 * server context (scoring, AI prompts) and in the browser. Used wherever HTML-vs-plain formatting
 * differences must not affect an exact-text comparison (ordering/matching scoring) or a
 * length check (item-form validation), and to keep markup noise out of AI prompts.
 */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, m => HTML_ENTITIES[m.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escapes the three HTML-significant characters in plain text, so content that never goes through
 * Quill (CSV-imported rows) is still guaranteed-safe, guaranteed-correctly-rendering text under
 * the new HTML-aware renderer, and can never collide with `looksLikeRichHtml`'s detector (escaped
 * text never starts with a literal `<tag>`).
 */
export function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
