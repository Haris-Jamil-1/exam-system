import { defineConfig } from '@playwright/test';

/**
 * Requires TEST_BASE_URL / TEST_DATABASE_URL / TEST_DIRECT_URL /
 * TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY / TEST_SUPABASE_SECRET_KEY to
 * point at a non-prod Supabase project + database. See tests/README.md.
 * globalSetup/globalTeardown seed and tear down two isolated tenants; every
 * spec reads them via e2e/fixtures.ts's loadFixture().
 */
const PORT = process.env.TEST_PORT ?? '3100';
const baseURL = process.env.TEST_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false, // shared seeded fixtures — avoid cross-test races
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e/.results.json' }]],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx next dev -p ' + PORT,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      // Map TEST_* -> the real var names the app reads, so the dev server
      // instance used for this run is never wired to prod, regardless of
      // what .env.local on disk contains.
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      DIRECT_URL: process.env.TEST_DIRECT_URL!,
      NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL!,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.TEST_SUPABASE_ANON_KEY!,
      SUPABASE_SECRET_KEY: process.env.TEST_SUPABASE_SECRET_KEY!,
      NEXT_PUBLIC_APP_URL: baseURL,
    },
  },
});
