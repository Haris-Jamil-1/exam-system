// Deliberately NOT a 'use server' module (same reason as item-bank-permissions.ts): Next.js
// requires every export of a 'use server' file to be an async Server Action, and a thrown
// Error class isn't one. pooling.ts throws this; route.ts (and tests) import it from here.

/**
 * Thrown when the blueprint's target draw for one or more CLOs now exceeds the actual
 * approved item pool at exam-start time (e.g. an item was deleted/unapproved after the
 * blueprint was saved). Callers must not let this crash exam-start — it should surface as
 * a clear, structured error to the student/teacher, never a silent under-draw.
 */
export class InsufficientPoolError extends Error {
  constructor(public readonly shortfalls: { cloId: string; cloText: string; needed: number; available: number }[]) {
    super(
      `Exam cannot start: insufficient approved question pool for ${shortfalls.length} learning objective(s): ` +
      shortfalls.map(s => `${s.cloText} (needs ${s.needed}, has ${s.available})`).join('; '),
    );
    this.name = 'InsufficientPoolError';
  }
}
