import { describe, it, expect } from 'vitest';
import { classifyStartExamResponse, classifySectionStartResponse } from '@/lib/exam-start-errors';

// Phase 7.1 Bug 1 & 2: these classifiers are the entire fix — handleStartExam and
// handleStartSection previously ignored the response status/body shape entirely and always
// proceeded down the success path, corrupting session state on every rejection. Exercising the
// classifier directly for every response shape the backend can actually send (see
// PHASE_6_PROGRESS.md / PHASE_7_PROGRESS.md for where insufficient_pool/invalid_section_weights
// come from) is what "confirms no session is written" reduces to: the component only ever
// writes session state on the `ok: true` branch, so as long as every failure shape classifies
// to `ok: false`, the corrupt-session bug is structurally impossible.

describe('classifyStartExamResponse — success path (no regression)', () => {
  it('classifies a real 201 as ok with the attempt payload', () => {
    const outcome = classifyStartExamResponse(201, { id: 'attempt-1', startedAt: '2026-07-17T00:00:00.000Z' });
    expect(outcome).toEqual({ ok: true, attempt: { id: 'attempt-1', startedAt: '2026-07-17T00:00:00.000Z' } });
  });

  it('does not classify a 201 with a malformed body as ok', () => {
    const outcome = classifyStartExamResponse(201, {});
    expect(outcome.ok).toBe(false);
  });
});

describe('classifyStartExamResponse — the four rejection kinds', () => {
  it('not_started', () => {
    const outcome = classifyStartExamResponse(403, { error: 'not_started', message: 'This exam has not started yet.' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('not_started');
      expect(outcome.studentMessage).toContain('not started');
      expect(outcome.instructorDetail).toBeUndefined();
    }
  });

  it('exam_ended', () => {
    const outcome = classifyStartExamResponse(403, { error: 'exam_ended', message: 'This exam has already ended.' });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('exam_ended');
      expect(outcome.studentMessage).toContain('ended');
    }
  });

  it('insufficient_pool — student message never leaks raw CLO/shortfall internals, but instructorDetail carries them', () => {
    const outcome = classifyStartExamResponse(409, {
      error: 'insufficient_pool',
      message: 'This exam cannot start right now — its question pool is smaller than configured.',
      shortfalls: [{ cloId: 'clo-1', needed: 5, available: 2 }],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('insufficient_pool');
      expect(outcome.studentMessage).not.toContain('clo-1');
      expect(outcome.studentMessage).not.toContain('shortfall');
      expect(outcome.studentMessage.toLowerCase()).toContain('instructor');
      expect(outcome.instructorDetail).toContain('clo-1');
      expect(outcome.instructorDetail).toContain('insufficient_pool');
    }
  });

  it('invalid_section_weights — same pattern as insufficient_pool', () => {
    const outcome = classifyStartExamResponse(400, {
      error: 'invalid_section_weights',
      message: "This exam's section weights sum to 80%, not 100% — contact your instructor.",
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe('invalid_section_weights');
      expect(outcome.studentMessage.toLowerCase()).toContain('instructor');
      expect(outcome.instructorDetail).toContain('80%');
    }
  });

  it('an unrecognized error shape falls into "unknown" rather than crashing or masquerading as success', () => {
    const outcome = classifyStartExamResponse(500, {});
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe('unknown');
  });
});

describe('classifySectionStartResponse', () => {
  it('returns null (no message) for a successful start', () => {
    expect(classifySectionStartResponse(201, {})).toBeNull();
  });

  it('surfaces the backend error message on the section-sequential-lock 403', () => {
    const message = classifySectionStartResponse(403, { error: 'Complete the previous section first' });
    expect(message).toBe('Complete the previous section first');
  });

  it('falls back to a generic message when the body has no error field', () => {
    const message = classifySectionStartResponse(500, {});
    expect(message).toMatch(/not available/i);
  });
});
