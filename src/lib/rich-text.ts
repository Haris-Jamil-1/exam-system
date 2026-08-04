// Pure, testable parser for the lightweight math/chemistry markup that question stems,
// answer options and explanations may contain.
//
// Storage format is deliberately UNCHANGED: `Question.stem`, `Item.stem`, `Option.text`,
// `ItemOption.text` and `explanation` all stay plain `String` columns in Postgres. This module
// only interprets LaTeX *delimiters* inside that plain text at render time — so every row
// written before math support existed parses to a single `text` segment and renders byte-for-byte
// as it always did. Nothing that consumes a stem as plain text (scoring's option-text equality in
// lib/scoring.ts, the Claude generation/grading prompts, pg_trgm dedup, the dashboard search
// filters, CSV import) is affected, because none of them go through this module.
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
