import { describe, it, expect } from 'vitest';
import { isRateLimited } from '@/lib/class-permissions';

describe('isRateLimited', () => {
  const now = new Date('2026-07-14T12:00:00Z');
  const options = { max: 3, windowMs: 15 * 60_000 };

  it('allows requests under the threshold', () => {
    const attempts = [
      new Date(now.getTime() - 5 * 60_000),
      new Date(now.getTime() - 2 * 60_000),
    ];
    expect(isRateLimited(attempts, now, options)).toBe(false);
  });

  it('blocks once the count reaches max within the window', () => {
    const attempts = [
      new Date(now.getTime() - 10 * 60_000),
      new Date(now.getTime() - 5 * 60_000),
      new Date(now.getTime() - 1 * 60_000),
    ];
    expect(isRateLimited(attempts, now, options)).toBe(true);
  });

  it('ignores attempts outside the window even if there are many', () => {
    const attempts = [
      new Date(now.getTime() - 20 * 60_000),
      new Date(now.getTime() - 30 * 60_000),
      new Date(now.getTime() - 45 * 60_000),
    ];
    expect(isRateLimited(attempts, now, options)).toBe(false);
  });

  it('treats an attempt exactly at the window boundary as outside the window (strict greater-than)', () => {
    const attempts = [
      new Date(now.getTime() - options.windowMs),
      new Date(now.getTime() - options.windowMs),
    ];
    expect(isRateLimited(attempts, now, options)).toBe(false);
  });

  it('uses sensible defaults when options are omitted', () => {
    const attempts = [now, now, now];
    expect(isRateLimited(attempts, now)).toBe(true);
  });
});
