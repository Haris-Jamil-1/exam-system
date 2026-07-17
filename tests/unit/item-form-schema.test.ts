import { describe, it, expect } from 'vitest';
import { itemFormSchema } from '@/lib/item-form-schema';

describe('itemFormSchema (Task 3 — manual item builder save)', () => {
  it('accepts a valid payload with a real number for marks', () => {
    const result = itemFormSchema.safeParse({ stem: 'What is 2+2?', marks: 4 });
    expect(result.success).toBe(true);
  });

  it('rejects marks as a string — this is the exact bug: an unregistered valueAsNumber left marks as a string and failed validation with zero rendered error', () => {
    const result = itemFormSchema.safeParse({ stem: 'What is 2+2?', marks: '10' });
    expect(result.success).toBe(false);
  });

  it('rejects marks below 1', () => {
    const result = itemFormSchema.safeParse({ stem: 'What is 2+2?', marks: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a too-short stem', () => {
    const result = itemFormSchema.safeParse({ stem: 'Hi', marks: 4 });
    expect(result.success).toBe(false);
  });

  it('tags is optional', () => {
    const result = itemFormSchema.safeParse({ stem: 'What is 2+2?', marks: 4 });
    expect(result.success).toBe(true);
  });
});
