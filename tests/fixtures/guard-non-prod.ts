/**
 * Hard safety gate: every script that can write test data (seed, teardown, e2e
 * webServer boot) imports and calls this before touching any network/DB
 * resource. It fails CLOSED — missing config is treated the same as prod
 * config, both refuse to run. See QA_RESULTS.md for why this exists: the
 * only backend available at the time this suite was written is the single
 * prod Supabase project (ref rlbtdpnmdnaxlccelxdr) that also backs
 * https://exam-system-sigma.vercel.app.
 */

const KNOWN_PROD_MARKERS = [
  'rlbtdpnmdnaxlccelxdr', // prod Supabase project ref
  'exam-system-sigma.vercel.app', // prod app URL
];

function containsProdMarker(value: string | undefined): boolean {
  if (!value) return false;
  return KNOWN_PROD_MARKERS.some(marker => value.includes(marker));
}

export function assertNonProd() {
  const required = {
    TEST_BASE_URL: process.env.TEST_BASE_URL,
    TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    TEST_SUPABASE_URL: process.env.TEST_SUPABASE_URL,
    TEST_SUPABASE_ANON_KEY: process.env.TEST_SUPABASE_ANON_KEY,
    TEST_SUPABASE_SECRET_KEY: process.env.TEST_SUPABASE_SECRET_KEY,
  };

  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `[guard-non-prod] Refusing to run: missing required TEST_* env vars: ${missing.join(', ')}.\n` +
      `This suite requires a fully separate non-prod Supabase project + database. ` +
      `See tests/README.md for setup instructions. It will NOT fall back to .env.local ` +
      `(which points at the prod project) under any circumstance.`
    );
  }

  const offenders = Object.entries(required).filter(([, v]) => containsProdMarker(v));
  if (offenders.length > 0) {
    throw new Error(
      `[guard-non-prod] Refusing to run: the following TEST_* env vars resolve to the ` +
      `known PRODUCTION project/app: ${offenders.map(([k]) => k).join(', ')}. ` +
      `Never point this suite at prod.`
    );
  }
}

export function qaPrefix(): string {
  return process.env.QA_PREFIX ?? `qa_${Date.now()}_`;
}
