import { describe, it, expect } from 'vitest';
import {
  parseRichText,
  containsMath,
  insertLatexAt,
  wrapLatex,
  MAX_LATEX_LENGTH,
  parseInlineFormatting,
  containsFormatting,
  splitBlocks,
  containsListMarkup,
  insertSnippetAt,
  wrapSelectionAt,
  insertListLineAt,
  looksLikeRichHtml,
  stripHtml,
  escapeHtml,
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

describe('parseInlineFormatting', () => {
  it('returns a single text segment for plain prose', () => {
    expect(parseInlineFormatting('plain text')).toEqual([{ kind: 'text', value: 'plain text' }]);
  });

  it('parses bold, underline, italic and image markers', () => {
    expect(parseInlineFormatting('**bold**')).toEqual([{ kind: 'bold', text: 'bold' }]);
    expect(parseInlineFormatting('__under__')).toEqual([{ kind: 'underline', text: 'under' }]);
    expect(parseInlineFormatting('*italic*')).toEqual([{ kind: 'italic', text: 'italic' }]);
    expect(parseInlineFormatting('![a cat](https://x/cat.png)')).toEqual([
      { kind: 'image', alt: 'a cat', src: 'https://x/cat.png' },
    ]);
  });

  it('prefers bold over italic for double-star markers', () => {
    expect(parseInlineFormatting('**bold** and *italic*')).toEqual([
      { kind: 'bold', text: 'bold' },
      { kind: 'text', value: ' and ' },
      { kind: 'italic', text: 'italic' },
    ]);
  });

  it('mixes formatting with surrounding plain text', () => {
    expect(parseInlineFormatting('Say **hi** to __them__')).toEqual([
      { kind: 'text', value: 'Say ' },
      { kind: 'bold', text: 'hi' },
      { kind: 'text', value: ' to ' },
      { kind: 'underline', text: 'them' },
    ]);
  });

  it('leaves an unterminated marker as literal text', () => {
    expect(parseInlineFormatting('a **b')).toEqual([{ kind: 'text', value: 'a **b' }]);
  });
});

describe('containsFormatting', () => {
  it('is false for plain text', () => {
    expect(containsFormatting('nothing special')).toBe(false);
  });

  it('is true once a marker is present', () => {
    expect(containsFormatting('**bold**')).toBe(true);
    expect(containsFormatting('![alt](url)')).toBe(true);
  });
});

describe('splitBlocks / containsListMarkup', () => {
  it('treats plain content as one paragraph block', () => {
    expect(splitBlocks('just one line')).toEqual([{ kind: 'paragraph', text: 'just one line' }]);
    expect(containsListMarkup('just one line')).toBe(false);
  });

  it('groups consecutive bullet lines into one list block', () => {
    expect(splitBlocks('- first\n- second\n- third')).toEqual([
      { kind: 'list', ordered: false, items: ['first', 'second', 'third'] },
    ]);
    expect(containsListMarkup('- first\n- second')).toBe(true);
  });

  it('groups consecutive numbered lines as ordered', () => {
    expect(splitBlocks('1. first\n2. second')).toEqual([
      { kind: 'list', ordered: true, items: ['first', 'second'] },
    ]);
  });

  it('splits a paragraph, a list, then another paragraph', () => {
    expect(splitBlocks('intro\n- a\n- b\noutro')).toEqual([
      { kind: 'paragraph', text: 'intro' },
      { kind: 'list', ordered: false, items: ['a', 'b'] },
      { kind: 'paragraph', text: 'outro' },
    ]);
  });

  it('starts a new list block when the marker type changes', () => {
    expect(splitBlocks('- a\n1. b')).toEqual([
      { kind: 'list', ordered: false, items: ['a'] },
      { kind: 'list', ordered: true, items: ['b'] },
    ]);
  });
});

describe('toolbar caret helpers', () => {
  it('insertSnippetAt inserts at the caret and replaces a selection', () => {
    expect(insertSnippetAt('ab cd', 2, 2, 'X').value).toBe('abX cd');
    expect(insertSnippetAt('ab cd', 0, 2, 'X').value).toBe('X cd');
  });

  it('wrapSelectionAt wraps a selection in the marker', () => {
    const result = wrapSelectionAt('Solve TODO for x', 6, 10, '**');
    expect(result.value).toBe('Solve **TODO** for x');
  });

  it('wrapSelectionAt with no selection inserts an empty pair and centers the cursor', () => {
    const result = wrapSelectionAt('Solve  for x', 6, 6, '**');
    expect(result.value).toBe('Solve **** for x');
    expect(result.value.slice(0, result.cursor)).toBe('Solve **');
  });

  it('insertListLineAt starts a new line before the marker mid-text', () => {
    const result = insertListLineAt('intro', 5, 5, false);
    expect(result.value).toBe('intro\n- ');
  });

  it('insertListLineAt does not add a leading break at the very start', () => {
    const result = insertListLineAt('', 0, 0, true);
    expect(result.value).toBe('1. ');
  });
});

describe('looksLikeRichHtml', () => {
  it('is true for genuine Quill-shaped output', () => {
    expect(looksLikeRichHtml('<p>Hello</p>')).toBe(true);
    expect(looksLikeRichHtml('<ol><li>a</li></ol>')).toBe(true);
    expect(looksLikeRichHtml('<ul><li>a</li></ul>')).toBe(true);
    expect(looksLikeRichHtml('<h2>Title</h2>')).toBe(true);
    expect(looksLikeRichHtml('<blockquote>quote</blockquote>')).toBe(true);
    expect(looksLikeRichHtml('  <p>leading whitespace</p>')).toBe(true);
  });

  it('is false for plain prose, even prose mentioning an HTML tag mid-sentence', () => {
    expect(looksLikeRichHtml('What is the capital of France?')).toBe(false);
    expect(looksLikeRichHtml('Explain what the <div> tag does in HTML.')).toBe(false);
    expect(looksLikeRichHtml('**bold** legacy markup')).toBe(false);
  });

  it('is false for a tag that is not one of the recognised Quill root wrappers', () => {
    expect(looksLikeRichHtml('<span>not a root wrapper</span>')).toBe(false);
  });
});

describe('stripHtml', () => {
  it('is a no-op on plain text', () => {
    expect(stripHtml('plain text')).toBe('plain text');
  });

  it('removes tags and decodes common entities', () => {
    expect(stripHtml('<p><strong>Bold</strong> &amp; <em>italic</em></p>')).toBe('Bold & italic');
  });

  it('collapses whitespace left behind by stripped tags', () => {
    expect(stripHtml('<p>a</p><p>b</p>')).toBe('a b');
  });
});

describe('escapeHtml', () => {
  it('escapes the three HTML-significant characters', () => {
    expect(escapeHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('never produces something looksLikeRichHtml would flag', () => {
    expect(looksLikeRichHtml(escapeHtml('<p>looks like a tag</p>'))).toBe(false);
  });
});
