import { describe, it, expect } from 'vitest';
import { deriveInviteStatus, parseBulkEmails } from '@/lib/class-permissions';

describe('deriveInviteStatus', () => {
  const now = new Date('2026-07-14T12:00:00Z');

  it('reads a pending invite with a future expiry as pending', () => {
    expect(deriveInviteStatus({ status: 'pending', expiresAt: new Date('2026-07-15T00:00:00Z') }, now)).toBe('pending');
  });

  it('reads a pending invite with a past expiry as expired', () => {
    expect(deriveInviteStatus({ status: 'pending', expiresAt: new Date('2026-07-01T00:00:00Z') }, now)).toBe('expired');
  });

  it('treats an invite expiring at exactly `now` as still pending (strict less-than)', () => {
    expect(deriveInviteStatus({ status: 'pending', expiresAt: now }, now)).toBe('pending');
  });

  it('never overrides an already-accepted invite, even past its expiry', () => {
    expect(deriveInviteStatus({ status: 'accepted', expiresAt: new Date('2026-07-01T00:00:00Z') }, now)).toBe('accepted');
  });

  it('leaves an already-expired invite as expired', () => {
    expect(deriveInviteStatus({ status: 'expired', expiresAt: new Date('2026-07-01T00:00:00Z') }, now)).toBe('expired');
  });
});

describe('parseBulkEmails', () => {
  it('splits on commas', () => {
    expect(parseBulkEmails('a@x.com, b@x.com,c@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('splits on newlines', () => {
    expect(parseBulkEmails('a@x.com\nb@x.com\nc@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('handles mixed commas and newlines with extra whitespace', () => {
    expect(parseBulkEmails('a@x.com,\n  b@x.com \n,c@x.com')).toEqual(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('lowercases and dedupes', () => {
    expect(parseBulkEmails('A@x.com, a@x.com, a@X.com')).toEqual(['a@x.com']);
  });

  it('drops invalid entries silently rather than throwing', () => {
    expect(parseBulkEmails('a@x.com, not-an-email, , b@x.com')).toEqual(['a@x.com', 'b@x.com']);
  });

  it('returns an empty array for input with no valid emails', () => {
    expect(parseBulkEmails('nope, still nope')).toEqual([]);
  });
});
