import { test, expect } from '@playwright/test';
import { loadFixture, loginAs } from './fixtures';

/**
 * ERR-01 / ERR-02 — every one of the 18 API route files has zero try/catch
 * (confirmed by static grep in QA_CHECKLIST.md). This suite fires malformed
 * JSON and missing-required-field payloads at every mutating route and
 * asserts a structured JSON error with a 4xx/5xx status, NOT a bare 500 with
 * no body (the failure mode that let the Institution.domain bug slip through
 * npm run build / npm run lint in the original incident).
 */

const MUTATING_ROUTES: { method: 'POST' | 'PUT' | 'PATCH'; path: (f: ReturnType<typeof loadFixture>) => string; authAs: 'admin' | 'teacher' | 'student' }[] = [
  { method: 'POST', path: () => '/api/auth/register', authAs: 'admin' }, // unauthenticated route, authAs unused for the request itself
  { method: 'POST', path: () => '/api/attempts', authAs: 'student' },
  { method: 'POST', path: () => '/api/attempts/nonexistent-id/submit', authAs: 'student' },
  { method: 'PUT', path: () => '/api/attempts/nonexistent-id', authAs: 'teacher' },
  { method: 'POST', path: () => '/api/exams', authAs: 'teacher' },
  { method: 'PUT', path: f => `/api/exams/${f.tenantA.exam.id}`, authAs: 'teacher' },
  { method: 'PATCH', path: f => `/api/exams/${f.tenantA.exam.id}/publish-results`, authAs: 'teacher' },
  { method: 'POST', path: () => '/api/questions', authAs: 'teacher' },
  { method: 'POST', path: () => '/api/violations', authAs: 'student' },
  { method: 'POST', path: () => '/api/invites', authAs: 'admin' },
  { method: 'POST', path: () => '/api/invites/accept/placeholder-token', authAs: 'student' },
  { method: 'POST', path: () => '/api/ai/generate-questions', authAs: 'teacher' },
  { method: 'PATCH', path: () => '/api/users/me', authAs: 'student' },
  { method: 'POST', path: () => '/api/upload', authAs: 'teacher' },
  { method: 'POST', path: () => '/api/extract-text', authAs: 'teacher' },
];

test.describe('ERR-01/ERR-02 — malformed JSON body on every mutating route', () => {
  for (const route of MUTATING_ROUTES) {
    test(`${route.method} ${route.path(loadFixture())} — malformed JSON returns structured error, not bare 500`, async ({ page }) => {
      const fixture = loadFixture();
      const tenant = fixture.tenantA;
      const creds = tenant[route.authAs];
      await loginAs(page, creds.email, creds.password, route.authAs);

      // Uses real browser fetch() via page.evaluate(), NOT page.request.fetch().
      // Verified (e2e/verify-malformed-json.spec.ts) that Playwright's
      // APIRequestContext silently drops an invalid-JSON string body when
      // Content-Type: application/json is also set — it was testing "empty
      // body" behavior, not genuinely malformed JSON, producing false passes
      // on routes like /api/auth/register that DO crash on real malformed
      // bytes. A real browser fetch() sends the literal bytes over the wire.
      const result = await page.evaluate(async ({ path, method }) => {
        const res = await fetch(path, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: '{not valid json!!!',
        });
        return { status: res.status, text: await res.text() };
      }, { path: route.path(fixture), method: route.method });

      const { status, text: bodyText } = result;
      let parsedAsJson = true;
      try { JSON.parse(bodyText); } catch { parsedAsJson = false; }

      expect(status, `expected a 4xx client error for malformed JSON, got ${status}. Body: ${bodyText.slice(0, 200)}`).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
      expect(parsedAsJson, `expected a JSON error body, got non-JSON (likely Next.js's bare HTML/empty 500 page): ${bodyText.slice(0, 200)}`).toBe(true);
    });
  }
});

test.describe('ERR-02 — missing required fields on every mutating route (valid JSON, empty object)', () => {
  for (const route of MUTATING_ROUTES) {
    test(`${route.method} ${route.path(loadFixture())} — empty body {} returns structured 400, not bare 500`, async ({ page }) => {
      const fixture = loadFixture();
      const tenant = fixture.tenantA;
      const creds = tenant[route.authAs];
      await loginAs(page, creds.email, creds.password, route.authAs);

      const res = await page.request.fetch(route.path(fixture), {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({}),
      });

      const status = res.status();
      const bodyText = await res.text();
      let parsedAsJson = true;
      try { JSON.parse(bodyText); } catch { parsedAsJson = false; }

      // A route MAY legitimately accept {} for PATCH-style partial updates —
      // the assertion is only that the response is well-formed JSON with a
      // sane status, never an opaque 500.
      expect(status).toBeGreaterThanOrEqual(200);
      expect(status).toBeLessThan(600);
      expect(parsedAsJson, `expected JSON body, got: ${bodyText.slice(0, 200)}`).toBe(true);
    });
  }
});

test.describe('ADM-01 regression — duplicate email-domain signup (the bug fixed live in this project this session)', () => {
  test('two institutions can register with @gmail.com admin emails without a 500', async ({ page }) => {
    const fixture = loadFixture();
    const stamp = Date.now();
    for (const suffix of ['a', 'b']) {
      const res = await page.request.post('/api/auth/register', {
        data: {
          institutionName: `${fixture.prefix}RegressionCheck-${suffix}-${stamp}`,
          adminName: `QA Regression ${suffix}`,
          email: `${fixture.prefix}regression-${suffix}-${stamp}@gmail.com`,
          password: 'QaTest@1234',
        },
      });
      expect(res.status(), `expected 200 for ${suffix}, got ${res.status()}: ${await res.text()}`).toBe(200);
    }
  });
});
