# QA test suite — setup

Source of truth for what these tests cover: `QA_CHECKLIST.md` at the repo root.
Results from the most recent run: `QA_RESULTS.md`. Manual-only items: `QA_MANUAL.md`.

## Why this needs setup before it runs

At the time this suite was written, the only backend configured anywhere in
this repo (`.env.local`) is a single Supabase project (`rlbtdpnmdnaxlccelxdr`)
that is also the production database behind `https://exam-system-sigma.vercel.app`.
This suite creates exams, attempts, submissions, and Supabase Auth users — it
must never run against that project. `tests/fixtures/guard-non-prod.ts` is
imported by every script that touches the network/DB and throws immediately
if the required `TEST_*` env vars are missing OR resolve to the known prod
project ref / app URL.

## One-time setup

You need a **second, fully separate Supabase project** (not just a second
Postgres database — this app also depends on Supabase Auth, which only
exists per-project, not per-database). Free tier is enough for testing.

1. Create a new Supabase project (e.g. `exampro-qa`).
2. In its dashboard: Settings → API → copy the Project URL, anon/publishable key, and service role/secret key.
3. Settings → Database → copy the pooled (6543) and direct (5432) connection strings.
4. Push the schema to it:
   ```
   TEST_DATABASE_URL="<pooled connection string>?pgbouncer=true" \
   DIRECT_URL="<direct connection string>" \
   npx prisma db push --schema prisma/schema.prisma
   ```
   (Prisma's `db push` reads `DIRECT_URL` from the schema's datasource config, not a `TEST_` prefix — export it as plain `DIRECT_URL` for this one command only, in a shell that does NOT also have the prod `.env.local` sourced.)
5. Export the runtime env vars this suite actually reads (put these in a `.env.test.local` you `source`/`export` before running — do NOT add them to `.env.local`):
   ```
   export TEST_BASE_URL=http://localhost:3100
   export TEST_PORT=3100
   export TEST_DATABASE_URL="<pooled connection string>?pgbouncer=true"
   export TEST_DIRECT_URL="<direct connection string>"
   export TEST_SUPABASE_URL="https://<your-qa-project-ref>.supabase.co"
   export TEST_SUPABASE_ANON_KEY="<anon/publishable key>"
   export TEST_SUPABASE_SECRET_KEY="<service role/secret key>"
   ```

## Running

```
npm run test:unit              # scoring engine — no env vars needed, runs anywhere
npm run test:e2e               # seeds two tenants, then runs the full Playwright suite
npm run test:e2e:teardown      # explicit cleanup (not automatic — see e2e/global-teardown.ts)
npm run test:data-integrity    # DAT-01/DAT-02 audit script, report-only, never rewrites data
```

`npm run test:e2e:seed` on its own (re)creates `tests/fixtures/.qa-fixture.json`,
which every Playwright spec reads via `e2e/fixtures.ts`'s `loadFixture()`. Delete
that file and rerun the seed script if you need a clean pair of tenants.

## What's namespaced

Every institution/exam/user created by `seed-tenants.ts` is prefixed with
`QA_PREFIX` (default `qa_<timestamp>_`). `teardown-tenants.ts` deletes by
walking each tenant's institution id recorded in `.qa-fixture.json`, in
FK-safe order (several relations are `onDelete: Restrict`, not `Cascade` —
see DAT-02 in `QA_CHECKLIST.md`), then deletes the corresponding Supabase
Auth users.
