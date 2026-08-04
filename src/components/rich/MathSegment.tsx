'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Renders exactly one LaTeX expression via KaTeX (mhchem included, so `\ce{...}` works here too).
 *
 * Security: there is no path from stored content to raw HTML anywhere in this feature. Literal
 * text is rendered as React children (escaped by React); this component hands the LaTeX *source
 * string* to KaTeX, which compiles it into its own fixed markup vocabulary. `trust: false` is the
 * switch that disables every KaTeX command capable of emitting arbitrary URLs, attributes or
 * markup (`\href`, `\url`, `\includegraphics`, `\html*`), so a stem containing
 * `\href{javascript:...}{x}` renders as inert text rather than a link. `dangerouslySetInnerHTML`
 * is used nowhere in this codebase and this feature does not introduce it — KaTeX writes into a
 * DOM node React does not own, which is why the pre-render fallback below is a sibling element
 * rather than this node's children.
 */
export default function MathSegment({ latex, display }: { latex: string; display: boolean }) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState<'pending' | 'rendered' | 'failed'>('pending');

  useEffect(() => {
    let cancelled = false;

    // Async inner function rather than a synchronous effect body — this repo's established pattern
    // for the React Compiler `set-state-in-effect` rule.
    async function render() {
      try {
        const { default: katex } = await import('./katex-loader');
        const host = hostRef.current;
        if (cancelled || !host) return;
        katex.render(latex, host, {
          displayMode: display,
          throwOnError: false,
          errorColor: '#dc2626',
          trust: false,
          strict: 'ignore',
          maxSize: 20,
          maxExpand: 1000,
          output: 'htmlAndMathml',
        });
        if (!cancelled) setStatus('rendered');
      } catch {
        // Chunk failed to load (offline, blocked asset). Fall back to showing the source rather
        // than dropping the content — a student must never silently lose part of a question.
        if (!cancelled) setStatus('failed');
      }
    }

    void render();
    return () => {
      cancelled = true;
    };
  }, [latex, display]);

  return (
    <span className={cn(display && 'block my-2 overflow-x-auto', !display && 'inline-block')}>
      {status !== 'rendered' && (
        <span
          className={cn(
            'font-mono text-[0.9em]',
            status === 'pending' ? 'opacity-60' : 'text-red-600',
          )}
        >
          {latex}
        </span>
      )}
      <span ref={hostRef} className={cn(status !== 'rendered' && 'hidden')} />
    </span>
  );
}
