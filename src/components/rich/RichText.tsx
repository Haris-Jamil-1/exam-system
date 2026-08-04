'use client';

import { useMemo } from 'react';
import { parseRichText } from '@/lib/rich-text';
import MathSegment from './MathSegment';

export interface RichTextProps {
  /** Raw field value straight from the database — plain text that may contain LaTeX delimiters. */
  content: string | null | undefined;
  className?: string;
}

/**
 * The single renderer for question stems, answer options and explanations. Every surface that
 * displays authored content — the student exam page, the post-submission review, the teacher's
 * per-student answer review, the item builder's live preview, the bank/admin/wizard list previews —
 * goes through this one component, so math and chemistry can never render differently in two
 * places or be supported in one and not the other.
 *
 * Fast path: content with no delimiters renders as a plain React text child, exactly as these call
 * sites did before math support existed, and never touches the KaTeX chunk.
 */
export function RichText({ content, className }: RichTextProps) {
  const source = content ?? '';
  const segments = useMemo(() => parseRichText(source), [source]);
  const hasMath = segments.some(segment => segment.kind === 'math');

  if (!hasMath) {
    return <span className={className}>{source}</span>;
  }

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={index}>{segment.value}</span>
        ) : (
          <MathSegment key={index} latex={segment.latex} display={segment.display} />
        ),
      )}
    </span>
  );
}
