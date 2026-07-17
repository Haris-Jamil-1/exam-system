import { describe, it, expect, vi, beforeEach } from 'vitest';

// Task 1's fix (student profile name not persisting) was purely client-side wiring — the
// student settings page's onSubmit never called any API at all. PATCH /api/users/me itself
// already worked correctly before this session (confirmed by reading it) and is the exact
// mechanism the fix now correctly invokes for both the student and teacher settings pages.
// This locks down that mechanism at the route level; the client-side wiring itself is verified
// via live Playwright QA (same approach as the already-fixed teacher/settings page).

const { mockGetAuthUser, mockUserUpdate } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockUserUpdate: vi.fn(),
}));

vi.mock('@/lib/api-auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-auth')>('@/lib/api-auth');
  return { ...actual, getAuthUser: mockGetAuthUser };
});
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { update: mockUserUpdate } },
}));

import { PATCH } from '@/app/api/users/me/route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/users/me', () => {
  it('rejects an unauthenticated request', async () => {
    mockGetAuthUser.mockResolvedValue(null);
    const res = await PATCH(makeRequest({ name: 'New Name' }));
    expect(res.status).toBe(401);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it('persists a valid name change and returns the updated user', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'student-1' });
    mockUserUpdate.mockResolvedValue({
      id: 'student-1', name: 'New Name', email: 'a@example.com',
      role: 'student', institutionId: 'inst-a', avatarUrl: null,
    });

    const res = await PATCH(makeRequest({ name: 'New Name' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe('New Name');
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      data: { name: 'New Name' },
    });
  });

  it('rejects a name shorter than 2 characters with a structured 400, not a silent no-op', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'student-1' });
    const res = await PATCH(makeRequest({ name: 'A' }));
    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
