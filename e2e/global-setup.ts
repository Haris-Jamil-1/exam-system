import { assertNonProd } from '../tests/fixtures/guard-non-prod';

export default async function globalSetup() {
  assertNonProd();
  // Seeding is done via `npm run test:e2e` (see package.json), which runs
  // seed-tenants.ts before invoking `playwright test`, rather than here —
  // keeps the seed script independently runnable/debuggable outside Playwright.
  const { existsSync } = await import('node:fs');
  const path = await import('node:path');
  const fixturePath = path.join(__dirname, '..', 'tests', 'fixtures', '.qa-fixture.json');
  if (!existsSync(fixturePath)) {
    throw new Error(
      'tests/fixtures/.qa-fixture.json not found. Run `npx tsx tests/fixtures/seed-tenants.ts` ' +
      '(with TEST_* env vars set) before running the e2e suite, or use `npm run test:e2e` which does both.'
    );
  }
}
