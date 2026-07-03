import { test, expect } from '@playwright/test';
import { loadFixture, loginAs } from './fixtures';

/**
 * SEC-01 through SEC-08 from QA_CHECKLIST.md. Tenant B's users attempt to
 * read/mutate Tenant A's resources. All of these are PREDICTED to FAIL
 * (return 200 instead of 403/404) based on static code reading — that is
 * the correct, informative outcome for a security regression test. See
 * QA_RESULTS.md for whether they actually did.
 */

test.describe('SEC-01 — GET /api/questions cross-tenant answer-key leak', () => {
  test('Tenant B teacher reading Tenant A exam questions should be blocked', async ({ page }) => {
    const fixture = loadFixture();
    await loginAs(page, fixture.tenantB.teacher.email, fixture.tenantB.teacher.password, 'teacher');

    const res = await page.request.get(`/api/questions?examId=${fixture.tenantA.exam.id}`);
    const body = await res.json().catch(() => null);

    expect(res.status(), `expected 403/404, got ${res.status()}. Body: ${JSON.stringify(body).slice(0, 300)}`).toBeGreaterThanOrEqual(400);
    // Even if a future fix changes the status code, correctAnswer must never leak to a non-owning tenant.
    if (Array.isArray(body)) {
      const leaked = body.some((q: Record<string, unknown>) => 'correctAnswer' in q || 'isCorrect' in q);
      expect(leaked, 'correctAnswer/isCorrect leaked cross-tenant').toBe(false);
    }
  });
});

test.describe('SEC-02 — POST /api/questions cross-tenant question injection', () => {
  test('Tenant B teacher should not be able to add a question to Tenant A exam', async ({ page }) => {
    const fixture = loadFixture();
    await loginAs(page, fixture.tenantB.teacher.email, fixture.tenantB.teacher.password, 'teacher');

    const res = await page.request.post('/api/questions', {
      data: {
        examId: fixture.tenantA.exam.id,
        type: 'mcq', stem: 'QA IDOR injected question', marks: 1, difficulty: 'easy', order: 99,
        options: [{ id: 'x', text: 'x', isCorrect: true }],
      },
    });

    expect(res.status(), `expected 403/404, got ${res.status()}`).toBeGreaterThanOrEqual(400);
  });
});

test.describe('SEC-03 — GET/PUT /api/attempts/[id] cross-tenant', () => {
  test('Tenant B teacher reading a Tenant A student attempt should be blocked', async ({ page }) => {
    const fixture = loadFixture();
    // First, Tenant A student must have an attempt to read — start one via the real flow.
    await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
    const startRes = await page.request.post('/api/attempts', { data: { examId: fixture.tenantA.exam.id } });
    expect(startRes.status(), 'precondition: Tenant A student must be able to start an attempt').toBe(201);
    const attempt = await startRes.json() as { id: string };
    await page.context().clearCookies();

    await loginAs(page, fixture.tenantB.teacher.email, fixture.tenantB.teacher.password, 'teacher');
    const getRes = await page.request.get(`/api/attempts/${attempt.id}`);
    expect(getRes.status(), `expected 403/404, got ${getRes.status()}`).toBeGreaterThanOrEqual(400);

    const putRes = await page.request.put(`/api/attempts/${attempt.id}`, { data: { trustScore: 0 } });
    expect(putRes.status(), `expected 403/404, got ${putRes.status()}`).toBeGreaterThanOrEqual(400);
  });
});

test.describe('SEC-05 — role escalation regression checks', () => {
  test('H1: student cannot be blocked from POST /api/attempts for their OWN exam (sanity: this should succeed)', async ({ page }) => {
    const fixture = loadFixture();
    await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
    const res = await page.request.post('/api/attempts', { data: { examId: fixture.tenantA.exam.id } });
    expect(res.status()).toBe(201);
  });

  test('C4: student is forbidden from PUT /api/attempts/[id]', async ({ page }) => {
    const fixture = loadFixture();
    await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
    const startRes = await page.request.post('/api/attempts', { data: { examId: fixture.tenantA.exam.id } });
    const attempt = await startRes.json() as { id: string };

    const res = await page.request.put(`/api/attempts/${attempt.id}`, { data: { trustScore: 100 } });
    expect(res.status()).toBe(403);
  });

  test('student cannot create a question (teacher/admin only)', async ({ page }) => {
    const fixture = loadFixture();
    await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
    const res = await page.request.post('/api/questions', {
      data: { examId: fixture.tenantA.exam.id, type: 'mcq', stem: 'x', marks: 1, difficulty: 'easy', order: 1 },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('SEC-06 — violations scoping regression check (H2)', () => {
  test('student GET /api/violations only ever returns their own violations, never another student\'s', async ({ page }) => {
    const fixture = loadFixture();
    await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
    const res = await page.request.get('/api/violations');
    expect(res.status()).toBe(200);
    const violations = await res.json() as Array<{ studentId?: string }>;
    for (const v of violations) {
      if (v.studentId) expect(v.studentId).toBe(fixture.tenantA.student.id);
    }
  });
});

test.describe('SEC-07 — attempt-start time-window enforcement', () => {
  test('POST /api/attempts before exam startTime should be blocked (uses a freshly-created future exam)', async ({ page }) => {
    const fixture = loadFixture();
    await loginAs(page, fixture.tenantA.teacher.email, fixture.tenantA.teacher.password, 'teacher');

    // Create + approve a future exam via the real API so this test is self-contained.
    const createRes = await page.request.post('/api/exams', {
      data: {
        title: `${fixture.prefix}Future exam`,
        subject: 'QA', duration: 30, totalMarks: 10, passingMarks: 5,
        startTime: new Date(Date.now() + 60 * 60_000).toISOString(),
        endTime: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        settings: { navigationMode: 'free', proctoringLevel: 'low' },
      },
    });
    expect(createRes.status(), await createRes.text()).toBe(201);
    const exam = await createRes.json() as { id: string };

    await page.context().clearCookies();
    await loginAs(page, fixture.tenantA.student.email, fixture.tenantA.student.password, 'student');
    const startRes = await page.request.post('/api/attempts', { data: { examId: exam.id } });

    expect(startRes.status(), `expected the API to block starting an attempt before startTime, got ${startRes.status()} — see QA_CHECKLIST.md SEC-07`).toBeGreaterThanOrEqual(400);
  });
});
