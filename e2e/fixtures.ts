import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

export type TenantFixture = {
  institutionId: string;
  institutionName: string;
  admin: { id: string; email: string; password: string };
  teacher: { id: string; email: string; password: string };
  student: { id: string; email: string; password: string };
  exam: { id: string; title: string; startTime: string; endTime: string };
  questions: Record<string, string>;
};

export type QaFixture = {
  prefix: string;
  tenantA: TenantFixture;
  tenantB: TenantFixture;
  createdAt: string;
};

export function loadFixture(): QaFixture {
  const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', '.qa-fixture.json');
  return JSON.parse(readFileSync(fixturePath, 'utf-8')) as QaFixture;
}

/**
 * Logs in through the real /login UI (not a cookie hack) so the session
 * cookie Supabase SSR sets is exactly what the app itself produces. Once
 * logged in, `page.request` shares the same authenticated cookie jar, so it
 * can be used as a plain HTTP client for API-level assertions (error
 * handling, IDOR, etc.) without reimplementing Supabase's cookie format.
 */
export async function loginAs(page: Page, email: string, password: string, expectedRole: 'admin' | 'teacher' | 'student') {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(`**/${expectedRole}`, { timeout: 15_000 });
}
