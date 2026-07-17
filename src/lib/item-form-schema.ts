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

export const itemFormSchema = z.object({
  stem: z.string().min(5, 'Question stem is required'),
  marks: z.number().min(1, 'Marks must be at least 1'),
  tags: z.string().optional(),
});

export type ItemFormData = z.infer<typeof itemFormSchema>;
