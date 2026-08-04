import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/lib/ai/claude-generator';

// Generated items are written straight into the same plain-string columns the math/chemistry
// renderer reads (see src/lib/rich-text.ts). Without explicit notation rules in the system prompt
// the model emits "H2SO4" and "x^2" as literal text, which then renders literally — the feature
// silently doesn't apply to AI-authored items. These tests pin the guidance to the prompt so a
// future prompt edit can't drop it unnoticed.

const base = {
  text: 'Source material about acids and bases.',
  count: 3,
  difficulty: 'medium' as const,
  type: 'mcq' as const,
  existingStems: [],
};

describe('buildSystemPrompt — math/chemistry notation guidance', () => {
  it('tells the model to use inline and display math delimiters', () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt).toContain('$...$');
    expect(prompt).toContain('$$...$$');
  });

  it('tells the model to use mhchem for chemistry rather than bare text', () => {
    const prompt = buildSystemPrompt(base);
    expect(prompt).toContain('\\ce{');
    expect(prompt).toMatch(/mhchem/i);
    expect(prompt).toContain('H2SO4');
  });

  it('covers every field a question stores, not just the stem', () => {
    const prompt = buildSystemPrompt(base);
    for (const field of ['stem', 'option', 'correctAnswer', 'explanation']) {
      expect(prompt).toContain(field);
    }
  });

  it('requires literal currency to be escaped, matching the renderer\'s own rule', () => {
    // The renderer refuses to read "costs $5 and $10" as math; the model is told to escape
    // currency outright so a mixed stem can never parse ambiguously.
    expect(buildSystemPrompt(base)).toContain('\\$');
  });

  it('tells the model to leave non-technical subjects as plain text', () => {
    expect(buildSystemPrompt(base)).toMatch(/non-technical subjects.*no delimiters/i);
  });

  it('keeps the pre-existing prompt contract intact', () => {
    const prompt = buildSystemPrompt({ ...base, cloText: 'Explain acid-base neutralisation' });
    expect(prompt).toContain('Explain acid-base neutralisation');
    expect(prompt).toContain('<source_material>');
    expect(prompt).toMatch(/exactly 4 options/);
  });

  it('still lists existing stems for duplicate avoidance', () => {
    const prompt = buildSystemPrompt({ ...base, existingStems: ['What is a Brønsted acid?'] });
    expect(prompt).toContain('What is a Brønsted acid?');
  });
});
