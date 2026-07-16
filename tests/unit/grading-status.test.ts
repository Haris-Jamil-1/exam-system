import { describe, it, expect } from 'vitest';
import { isGradingFinalized, canOverrideGrading } from '@/lib/grading-status';

// Phase 7.1 Bug 3: GradingPanel previously hid the entire override control once gradingStatus
// was 'confirmed' OR 'overridden', collapsing them into one "resolved" state — but the backend
// (Phase 7's grading-override fix) deliberately still permits re-overriding an 'overridden'
// (not yet 'confirmed') answer. These two functions are the actual visibility rule the
// component now uses; testing them directly proves the override control is reachable exactly
// when it should be, without needing to render GradingPanel itself.

describe('isGradingFinalized / canOverrideGrading', () => {
  it('confirmed is the only finalized state', () => {
    expect(isGradingFinalized('confirmed')).toBe(true);
    expect(canOverrideGrading('confirmed')).toBe(false);
  });

  it('overridden is NOT finalized — the override control stays reachable', () => {
    expect(isGradingFinalized('overridden')).toBe(false);
    expect(canOverrideGrading('overridden')).toBe(true);
  });

  it('ai_suggested and pending_ai are both not finalized', () => {
    expect(isGradingFinalized('ai_suggested')).toBe(false);
    expect(canOverrideGrading('ai_suggested')).toBe(true);
    expect(isGradingFinalized('pending_ai')).toBe(false);
    expect(canOverrideGrading('pending_ai')).toBe(true);
  });
});
