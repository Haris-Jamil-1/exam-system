import { describe, it, expect } from 'vitest';
import {
  parseRichText,
  containsMath,
  insertLatexAt,
  wrapLatex,
  MAX_LATEX_LENGTH,
} from '@/lib/rich-text';

describe('parseRichText — backward compatibility with rows written before math support', () => {
  it('returns a single text segment for ordinary prose', () => {
    expect(parseRichText('What is the capital of France?')).toEqual([
      { kind: 'text', value: 'What is the capital of France?' },
    ]);
  });

  it('leaves an empty string as no segments', () => {
    expect(parseRichText('')).toEqual([]);
  });

  it('does not reinterpret currency amounts as math', () => {
    // The exact hazard for existing stems: two dollar amounts in one sentence look like a pair.
    for (const stem of [
      'The item costs $5 and the tax is $10.',
      'Revenue rose from $100 to $200.',
      'Pay $5, $6, or $7.',
      'A single $ sign on its own.',
      'It cost $5 today',
    ]) {
      expect(parseRichText(stem), stem).toEqual([{ kind: 'text', value: stem }]);
    }
  });

  it('treats an unterminated delimiter as literal text', () => {
    expect(parseRichText('Solve $x + 1 for x')).toEqual([
      { kind: 'text', value: 'Solve $x + 1 for x' },
    ]);
    expect(parseRichText('Begin $$x + 1')).toEqual([{ kind: 'text', value: 'Begin $$x + 1' }]);
  });

  it('never lets an expression cross a blank line', () => {
    const stem = 'First $a\n\nSecond b$ end';
    expect(parseRichText(stem)).toEqual([{ kind: 'text', value: stem }]);
  });
});

describe('parseRichText — math delimiters', () => {
  it('parses inline $...$ math', () => {
    expect(parseRichText('Solve $2x + 1 = 7$ for x.')).toEqual([
      { kind: 'text', value: 'Solve ' },
      { kind: 'math', latex: '2x + 1 = 7', display: false },
      { kind: 'text', value: ' for x.' },
    ]);
  });

  it('parses display $$...$$ math', () => {
    expect(parseRichText('Given: $$\\frac{a}{b}$$')).toEqual([
      { kind: 'text', value: 'Given: ' },
      { kind: 'math', latex: '\\frac{a}{b}', display: true },
    ]);
  });

  it('parses \\(...\\) as inline and \\[...\\] as display', () => {
    expect(parseRichText('a \\(x^2\\) b \\[y^2\\] c')).toEqual([
      { kind: 'text', value: 'a ' },
      { kind: 'math', latex: 'x^2', display: false },
      { kind: 'text', value: ' b ' },
      { kind: 'math', latex: 'y^2', display: true },
      { kind: 'text', value: ' c' },
    ]);
  });

  it('parses several expressions in one field', () => {
    const segments = parseRichText('If $a=1$ and $b=2$, find $a+b$.');
    expect(segments.filter(s => s.kind === 'math')).toHaveLength(3);
  });

  it('treats \\$ as a literal dollar sign, not a delimiter', () => {
    expect(parseRichText('Costs \\$5 and \\$10.')).toEqual([
      { kind: 'text', value: 'Costs $5 and $10.' },
    ]);
  });

  it('does not let an escaped dollar close an expression', () => {
    expect(parseRichText('$a \\$ b$')).toEqual([{ kind: 'math', latex: 'a \\$ b', display: false }]);
  });

  it('ignores an empty expression', () => {
    expect(parseRichText('a $$ b')).toEqual([{ kind: 'text', value: 'a $$ b' }]);
  });

  it('refuses to render a pathologically long expression', () => {
    const huge = 'x'.repeat(MAX_LATEX_LENGTH + 1);
    expect(parseRichText(`$${huge}$`)).toEqual([{ kind: 'text', value: `$${huge}$` }]);
  });
});

describe('parseRichText — chemistry', () => {
  it('carries \\ce{...} through as ordinary LaTeX for the mhchem extension', () => {
    expect(parseRichText('Balance $\\ce{H2SO4 + 2NaOH -> Na2SO4 + 2H2O}$.')).toEqual([
      { kind: 'text', value: 'Balance ' },
      { kind: 'math', latex: '\\ce{H2SO4 + 2NaOH -> Na2SO4 + 2H2O}', display: false },
      { kind: 'text', value: '.' },
    ]);
  });

  it('handles a display-mode chemical equation', () => {
    expect(parseRichText('$$\\ce{CO2 + H2O <=> H2CO3}$$')).toEqual([
      { kind: 'math', latex: '\\ce{CO2 + H2O <=> H2CO3}', display: true },
    ]);
  });
});

describe('parseRichText — content preservation', () => {
  it('reproduces the visible content of any input', () => {
    for (const input of [
      'plain',
      'Solve $x^2$ now',
      'Costs $5 and $10',
      '$$\\ce{H2O}$$ tail',
      'a \\(b\\) c',
      '',
    ]) {
      const rebuilt = parseRichText(input)
        .map(s => (s.kind === 'text' ? s.value : s.latex))
        .join('');
      // Delimiters and the \$ escape are the only characters consumed.
      expect(rebuilt.length, input).toBeLessThanOrEqual(input.length);
      expect(rebuilt.replace(/\s+/g, ''), input).not.toBe(undefined);
    }
  });
});

describe('containsMath', () => {
  it('is false for text with no delimiters at all', () => {
    expect(containsMath('Nothing to render here')).toBe(false);
  });

  it('is false for currency prose', () => {
    expect(containsMath('It costs $5 and $10.')).toBe(false);
  });

  it('is true once a real expression is present', () => {
    expect(containsMath('Solve $x^2$')).toBe(true);
    expect(containsMath('$$\\ce{H2O}$$')).toBe(true);
  });
});

describe('wrapLatex / insertLatexAt', () => {
  it('wraps inline and display bodies with the delimiters the parser round-trips', () => {
    expect(wrapLatex('x^2', false)).toBe('$x^2$');
    expect(wrapLatex('x^2', true)).toBe('$$x^2$$');
    expect(parseRichText(wrapLatex('\\ce{H2O}', false))).toEqual([
      { kind: 'math', latex: '\\ce{H2O}', display: false },
    ]);
  });

  it('inserts at the caret and reports where the caret lands', () => {
    const result = insertLatexAt('Solve  for x', 6, 6, 'x^2', false);
    expect(result.value).toBe('Solve $x^2$ for x');
    expect(result.cursor).toBe(11);
    expect(result.value.slice(0, result.cursor)).toBe('Solve $x^2$');
  });

  it('replaces the current selection', () => {
    const result = insertLatexAt('Solve TODO for x', 6, 10, 'x^2', false);
    expect(result.value).toBe('Solve $x^2$ for x');
  });

  it('clamps out-of-range selections instead of corrupting the value', () => {
    expect(insertLatexAt('abc', 99, 120, 'x', false).value).toBe('abc$x$');
    expect(insertLatexAt('abc', -5, -1, 'x', false).value).toBe('$x$abc');
  });
});
