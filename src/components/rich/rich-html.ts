'use client';
// Client-only (needs `DOMParser`) helper that pulls formula blots (src/components/rich/
// quill-loader.ts's custom "formula" embed) out of Quill-authored HTML before it's sanitized —
// see RichText.tsx's `SanitizedHtml` for how the extracted pieces get re-assembled: ordinary
// markup goes through DOMPurify + `dangerouslySetInnerHTML`, each formula is re-rendered through
// the existing, already-hardened `MathSegment` (katex-loader.ts, `trust: false`) instead of
// trusting whatever markup a rich-text editor happened to serialize inline.

export interface ExtractedFormula {
  latex: string;
  display: boolean;
}

export interface ExtractedHtml {
  /** Ordinary HTML with every formula blot replaced by a `formulaToken(i)` text placeholder. */
  html: string;
  formulas: ExtractedFormula[];
}

// Distinctive, non-HTML-special Unicode brackets — won't collide with real content, survives
// HTML serialization/sanitization unchanged since it's plain text, and stays human-readable if
// something ever goes wrong mid-pipeline.
export function formulaToken(index: number): string {
  return `⟦QLFORMULA:${index}⟧`;
}

const FORMULA_TOKEN_RE = /⟦QLFORMULA:(\d+)⟧/g;

export function extractFormulas(html: string): ExtractedHtml {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const formulas: ExtractedFormula[] = [];
  doc.querySelectorAll('span.ql-formula').forEach(node => {
    const index = formulas.length;
    formulas.push({
      latex: node.getAttribute('data-latex') ?? '',
      display: node.getAttribute('data-display') === 'true',
    });
    node.replaceWith(doc.createTextNode(formulaToken(index)));
  });
  return { html: doc.body.innerHTML, formulas };
}

/** Splits sanitized HTML back into literal-HTML chunks and formula-token markers, in order. */
export function splitOnFormulaTokens(html: string): Array<{ kind: 'html'; value: string } | { kind: 'formula'; index: number }> {
  const parts = html.split(FORMULA_TOKEN_RE);
  // String.split with a capturing group interleaves: [text, captured, text, captured, ..., text]
  return parts
    .map((part, i) =>
      i % 2 === 1 ? { kind: 'formula' as const, index: Number(part) } : { kind: 'html' as const, value: part },
    )
    .filter(part => part.kind === 'formula' || part.value.length > 0);
}
