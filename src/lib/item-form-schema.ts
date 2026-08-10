// Pure, testable validation schema for the manual item-builder form
// (teacher/items/new/page.tsx). Extracted out of the page component so the exact bug this
// closes — an `<input type="number">` registered without `valueAsNumber: true` handing
// react-hook-form a string, which z.number() then rejected silently with no rendered error —
// has a regression test that doesn't need a React/DOM test environment (this repo has none;
// see PHASE_7_1_PROGRESS.md for why pure-function extraction is the established pattern here
// instead of adding one). The fix is `valueAsNumber: true` on the `register('marks')` call in
// the page component (matching this codebase's existing convention, e.g. the exam wizard's
// `register('duration', { valueAsNumber: true })`) — this schema only needs to validate the
// already-coerced number, not perform the coercion itself.
import { z } from 'zod';
import { stripHtml } from '@/lib/rich-text';

// Stem is now authored through the Quill editor, so it may be genuine HTML (e.g. `<p></p>`) —
// checking raw string length would let visually-empty content trivially pass (`<p></p>` is 7
// characters). `stripHtml` is a no-op on plain text, so this is unaffected for anything not
// authored via Quill.
export const itemFormSchema = z.object({
  stem: z.string().refine(v => stripHtml(v).length >= 5, 'Question stem is required'),
  marks: z.number().min(1, 'Marks must be at least 1'),
  tags: z.string().optional(),
});

export type ItemFormData = z.infer<typeof itemFormSchema>;
