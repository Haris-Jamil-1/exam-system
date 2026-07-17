import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindUnique } = vi.hoisted(() => ({ mockFindUnique: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mockFindUnique } },
}));

import { isEmailActiveElsewhere } from '@/lib/data/invite-guards';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isEmailActiveElsewhere (Task 4 — cross-institution invite block)', () => {
  it('returns false when no user exists for the email', async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await isEmailActiveElsewhere('new@example.com', 'inst-a')).toBe(false);
  });

  it('returns false for an existing member of the SAME institution', async () => {
    mockFindUnique.mockResolvedValue({ institutionId: 'inst-a', suspendedAt: null });
    expect(await isEmailActiveElsewhere('same@example.com', 'inst-a')).toBe(false);
  });

  it('returns true for an ACTIVE member of a DIFFERENT institution', async () => {
    mockFindUnique.mockResolvedValue({ institutionId: 'inst-b', suspendedAt: null });
    expect(await isEmailActiveElsewhere('other@example.com', 'inst-a')).toBe(true);
  });

  it('returns false for a SUSPENDED member of a different institution (not "active" elsewhere)', async () => {
    mockFindUnique.mockResolvedValue({ institutionId: 'inst-b', suspendedAt: new Date() });
    expect(await isEmailActiveElsewhere('suspended@example.com', 'inst-a')).toBe(false);
  });

  it('queries by the email exactly once', async () => {
    mockFindUnique.mockResolvedValue(null);
    await isEmailActiveElsewhere('check@example.com', 'inst-a');
    expect(mockFindUnique).toHaveBeenCalledTimes(1);
    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'check@example.com' } }));
  });
});
