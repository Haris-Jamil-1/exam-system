# Phase 6 Progress (2026-07-17)

## Headline finding

Same pattern as Phase 5: this spec's 4 tasks (Item Bank RBAC, decouple AI generation from the
wizard, CLO-aware batch generation, stratified dynamic pooling) are near-verbatim restatements
of spec items 5–8 from the 2026-07-09 session (see `CLAUDE.md`'s Session Log) and Phase 3's
follow-up work. Rather than re-implement, this pass audited each task against the current code
(4 parallel research passes, one per task) and found:

- **Tasks 1–3: production code already matches the spec closely.** The gap in all three was
  **committed automated test coverage** — prior sessions verified this behavior via disposable
  live-DB QA scripts and Playwright, never as regression tests. Closed that gap this pass.
- **Task 4: two real, previously-unaddressed bugs**, exactly the ones the spec calls out as
  "the highest-risk part of this phase" — silently under-drawing when the approved pool shrank
  below the blueprint's target, and a genuine double-materialization race on concurrent
  exam-start. Both fixed this pass, not merely tested.

## Task 1 — Multi-Tiered Item Bank & RBAC

**Already implemented** (2026-07-09 "item 5"): `ItemBank`/`ItemBankAccess` schema,
`resolveBankPermission` single-source-of-truth permission function, editor-cannot-delete/
cannot-change-core-settings, `POST /api/item-banks/[bankId]/collaborators` with server-side
same-institution enforcement, three-tab dashboard, Manage Access modal. No behavior changed
this pass.

**Flag-don't-guess items — both already resolved in existing code, confirmed matching the
spec's stated defaults:**
- Institutional-bank EDITOR inviting others: **no** — `addCollaborator` requires `canManage`
  (owner-only), and an institutional-bank editor's role never resolves to `owner`
  (`item-bank-permissions.ts`). Matches the spec's default.
- Personal-bank owner leaving the institution: **nothing automated** — no reassignment logic
  exists anywhere in the codebase. Matches the spec's default by omission; genuinely
  unaddressed, flagged here (as before) for manual admin handling if it ever comes up.

**New this pass:**
- `tests/unit/item-bank-data.test.ts` (11 tests, first mocked-Prisma test file in this repo) —
  the 4 scenarios the spec explicitly requires as committed tests: editor cannot delete an
  institutional bank or change its `ownerId`/`bankLevel`; viewer cannot create or update items
  in any bank; a user with zero `ItemBankAccess` rows gets `[]` from `getSharedWithMeBanks()`
  without even querying `ItemBank` (API-layer invisibility, not just UI); cross-institution
  collaborator invites are rejected server-side even when the caller legitimately owns the bank.
  (No `deleteItem` function exists anywhere in this codebase — only bank deletion — so "viewer
  cannot delete items" has no corresponding capability to test; noted, not built, since adding
  item deletion wasn't asked for.)
- **RLS on `ItemBank`/`ItemBankAccess`, live-verified — this was the one real gap.** Confirmed
  via `pg_class.relrowsecurity` that both tables had RLS disabled (`false`/`false`), unlike the
  Phase-3 realtime tables and the Class* tables. Applied SELECT-only `authenticated` policies
  matching the established shape (owner/explicit-grant/admin-in-institution can read; hard
  cross-tenant deny). **Hit and fixed a real issue while applying it**: the naive first draft
  caused `ERROR 42P17: infinite recursion detected in policy for relation "ItemBank"` — each
  table's policy queried the other RLS-protected table, and Postgres re-evaluates RLS on every
  subquery, including in the middle of evaluating the other table's own policy. Fixed with two
  `SECURITY DEFINER` helper functions (`item_bank_can_read`, `item_bank_can_manage`) that bypass
  RLS internally while the outer policy still filters per-caller — standard pattern for this
  exact class of mutual-reference recursion. **Live-verified with real cross-user/cross-
  institution queries** (disposable institutions/users/banks, `SET ROLE authenticated` +
  `SET request.jwt.claims`): a teacher with only a viewer grant on an institutional bank saw
  exactly that bank and nothing else; a same-institution teacher with no grant on either bank
  saw neither; a cross-institution teacher saw zero rows from either table even with a real
  (if hypothetical) access row in play; the bank owner saw their own personal bank but correctly
  *not* the institutional bank they have no grant on. All disposable fixtures confirmed deleted
  afterward (`count = 0` across all 3 QA tables).

## Task 2 — Decouple AI Generation from the Exam Wizard

**Already implemented** (2026-07-09 "item 6"): wizard stepper is Basic Info → Select Questions
→ Settings with zero AI-related step/state; `AiGeneratePanel` lives on the bank detail page
with file upload, paste-content, difficulty/type dropdowns; `/api/ai/generate-questions` takes
`itemBankId` (not `examId`), is permission-checked (editor+), and items land directly in `Item`
as drafts. Confirmed via full-codebase grep that **no dead `examId`-based code path exists
anywhere** — not a leftover route file, not a stale client call. No behavior changed this pass.

**New this pass:** `tests/unit/generate-questions-route.test.ts` (first route-handler-level
test in this repo) — asserts the old `examId`-shaped payload is rejected (400, `itemBankId` is
`min(1)`-required by the zod schema so a payload missing it never reaches permission/persistence
logic), a nonexistent `itemBankId` returns 404, a viewer-only caller gets 403, and a valid
editor+ call creates a `GenerationJob` scoped to that exact bank.

## Task 3 — CLO-Aware, Batch-Controlled AI Generation

**Already implemented** (2026-07-09 "item 7"): `MAX_BATCH_SIZE = 15` named constant shared
client/server; CLO dropdown + quantity input with reactive "Generate {n} Questions" label;
server-side zod `.max(MAX_BATCH_SIZE)` enforcement independent of the client; `learningObjectiveId`
resolved to text and institution-checked before prompting; every created `Item` in a batch gets
`learningObjectiveId` stamped unconditionally from the job. The real-Claude prompt string
(`claude-generator.ts`) is a near-verbatim match to the spec's required sentence (second sentence
verbatim; first sentence semantically identical, minor phrasing). No behavior changed this pass.

**New this pass:**
- Added to `generate-questions-route.test.ts`: a client-bypassed `count = MAX_BATCH_SIZE + 35`
  POST directly to the route handler is rejected 400 before any `GenerationJob` row or
  background job is created; `count = MAX_BATCH_SIZE` exactly is accepted; a nonexistent
  `learningObjectiveId` returns a clear 400 (`error` matches `/learningObjectiveId/i`), not a
  silent ignore; a CLO belonging to a different institution than the bank is rejected the same
  way; a valid same-institution CLO resolves its text onto the job's `promptParams.cloText`.
- `tests/unit/generation-job.test.ts` (2 tests) — exercises the actual persistence step
  (`runGenerationJob`, not just the route): every item in a 3-item generated batch gets the
  job's `learningObjectiveId` stamped, none null; when no CLO was specified on the job, items
  are created with an explicit `null` (not silently defaulted to something else).

## Task 4 — Stratified Dynamic Pooling & Test Blueprint Integration (real fixes, not just tests)

**Already implemented and unchanged:** Blueprint Matrix UI with live available-count clamping,
`Exam.settings.dynamicPoolingBlueprint` storage shape, per-attempt private `Question` rows
(`attemptId` set) read fresh from DB on every load — determinism was already correct and
remains so.

**Two real bugs found and fixed this pass, both exactly matching the spec's own "highest-risk"
callouts:**

1. **Insufficient pool at runtime was silently swallowed.** `materializePooledQuestions`'s draw
   query was `ORDER BY RANDOM() LIMIT ${count}` with no check that `count` rows actually came
   back — if the approved pool for a CLO had shrunk below the blueprint's target (an item
   deleted/unapproved after the blueprint was saved), the exam silently started with fewer
   questions than configured, with zero signal to the student, the teacher, or any log.
   **Fixed**: before drawing anything, the actual current approved-item count per CLO is
   computed and compared against the blueprint target; any shortfall throws a new
   `InsufficientPoolError` (in the new `src/lib/data/pooling-errors.ts` — kept out of
   `pooling.ts` because that file is a `'use server'` module, which requires every export to be
   an async Server Action, and a thrown `Error` subclass isn't one; a first draft that exported
   the class from `pooling.ts` broke Next's build with "module has no exports at all"). The
   route now catches this and returns **409 `{ error: 'insufficient_pool', shortfalls: [...] }`**
   with per-CLO needed/available counts — a clear, actionable error instead of a crash or a
   silent shorter exam.
   - **Product decision explicitly flagged, not made silently, per the spec's own instruction**:
     this pass chose to **block the exam-start attempt entirely** (safest default — never serve
     a student a mis-scoped exam without anyone knowing) rather than auto-adjust the draw count
     down or merely alert an admin asynchronously while still letting the student in. The
     auto-adjust-down alternative is more student-friendly (they don't get stuck at the exam
     door) but changes what the exam actually measures without the instructor's explicit
     sign-off — **this tradeoff is Haris's call, not made unilaterally here.** If auto-adjust is
     preferred, the change is localized: swap the `throw` in `pooling.ts` for clamping each
     CLO's draw to `min(needed, available)` and returning a flag on the response instead.

2. **Concurrent exam-start could double-materialize a pooled exam's question set.**
   `POST /api/attempts` read `existing` via a separate query, then called `examAttempt.upsert`,
   then materialized pooled questions `if (!existing)` — two near-simultaneous requests for the
   same student+exam (double-click, two open tabs) could both observe `existing === null` before
   either write landed, and both would then materialize their own private `Question` set for
   the same attempt, since `upsert` doesn't distinguish "I just created this" from "this already
   existed." **Fixed**: attempt creation and pooled-question materialization now run inside one
   `prisma.$transaction`. `examAttempt.create` (not `upsert`) is the sole arbiter — the DB's
   unique constraint on `(examId, studentId)` guarantees only one concurrent caller's insert can
   succeed; the loser catches the `P2002` unique-violation, re-reads the winner's row via
   `findUniqueOrThrow`, and — critically — **never calls `materializePooledQuestions`**, since
   materialization is now gated on "did *this specific call* just create the row," not on a
   stale pre-transaction read. If materialization throws `InsufficientPoolError`, the whole
   transaction (attempt row included) rolls back, so a failed start never leaves an orphaned
   half-materialized attempt behind.

**New this pass:**
- `tests/unit/pooling.test.ts` (4 tests) — draw count matches blueprint exactly across multiple
  CLOs; `InsufficientPoolError` thrown (not a crash, not a partial draw — zero `Question` rows
  created) when a CLO's pool has shrunk below target; the error reports *every* short CLO, not
  just the first found; the pre-existing cross-institution bank guard still holds (untouched
  behavior, confirmed unbroken).
- `tests/unit/attempts-pooling-concurrency.test.ts` (3 tests) — **the spec's explicitly required
  concurrent exam-start test**: two `POST /api/attempts` calls launched via `Promise.all` for
  the same student+exam resolve to the same attempt id with `materializePooledQuestions` called
  exactly once (not twice); a genuine sequential resume (first call fully completes, then a
  second real request) also does not re-materialize; an insufficient-pool failure returns 409
  and leaves zero attempt rows behind (transaction rollback verified, not just asserted).

## Live verification against Supabase (`rlbtdpnmdnaxlccelxdr`)

This session had direct Postgres egress (`DATABASE_URL`:6543/pgBouncer reachable when env vars
are exported into the shell before any module import — see note below), so live QA ran against
a real local dev server + the live DB via a disposable, self-cleaning Playwright + Prisma
script (real browser login, real Supabase session cookies, not hand-crafted):

- **RLS on `ItemBank`/`ItemBankAccess`**: see Task 1 above — 4 real cross-user/cross-institution
  query attempts via `SET ROLE authenticated` + `SET request.jwt.claims`, all behaved exactly
  per the permission model. All fixture rows confirmed deleted afterward.
- **JIT assembler, healthy pool**: a real student, logged in via a real browser session, started
  a disposable exam blueprinted for 3 questions from a CLO with 5 approved items available —
  `POST /api/attempts` returned 201 and exactly 3 `Question` rows were materialized, verified
  directly against Postgres (not just the API response).
- **JIT assembler, insufficient pool**: the same student started a disposable exam blueprinted
  for 5 questions from a CLO with only 2 approved items available — `POST /api/attempts`
  returned **409 `insufficient_pool`** with the correct shortfall detail, and no `ExamAttempt`
  row existed afterward (confirmed via a direct Postgres query — the transaction rollback is
  real, not just unit-tested).
- **Batch-size server-side rejection**: a real teacher session POSTed `count: 50` directly to
  `/api/ai/generate-questions` (bypassing any client-side cap) — got back 400
  (`"Too big: expected number to be <=15"`) and zero `GenerationJob` rows were created.
- All disposable institutions/users/banks/items/exams/CLOs and the two Supabase Auth users
  created for this QA pass were deleted afterward; re-queried and confirmed `count = 0`.

**Note for future sessions**: this session's shell *did* have direct Postgres egress via
`DATABASE_URL` (unlike several recent sessions where it was blocked) — but only when the env
vars are exported into the shell (or otherwise present in `process.env`) *before* `src/lib/prisma.ts`
is ever imported. A `tsx script.ts` that does `import 'dotenv/config'` followed by a static
`import { prisma } from '...'` at the top of the same file will silently fail with `Database
"haris" does not exist` — ES module imports are hoisted and all evaluated (including their
top-level side effects) before the importing file's own top-level code runs, so `prisma.ts`
reads `process.env.DATABASE_URL` before `dotenv`'s `config()` call ever executes, and falls back
to a local default. Fix: either `source`/export the relevant `.env.local` vars into the shell
before invoking `tsx` at all, or dynamically `await import('./src/lib/prisma')` after calling
`config()`.

## Verification

- `npx tsc --noEmit` → clean
- `npm run lint` → 3 errors / 1 warning, unchanged pre-existing baseline (`useExamTimer.ts`,
  `invite/[token]/page.tsx`, `exam/[examId]/page.tsx` — predate this session)
- `npm run build` → passes, 74 routes (unchanged — no new pages/routes added, only test files
  and two small production-code fixes)
- `npx vitest run` → **156/156 passing** (127 baseline + 29 new: 11 item-bank-data + 9
  generate-questions-route + 2 generation-job + 4 pooling + 3 attempts-pooling-concurrency)

## Explicitly out of scope / untouched per the brief

- The Phase 5 auto-finalize-dead-attempts decision was not touched, per instruction — no cron
  job was added anywhere in this pass.
- No `deleteItem` (single-item deletion) capability was added — it didn't exist before this
  pass either; the spec's "VIEWER cannot delete items" requirement has no corresponding
  capability to guard yet.
- The auto-adjust-down-vs-block-exam-start product decision for insufficient pool (Task 4,
  item 1 above) is flagged for Haris, not decided unilaterally — current behavior blocks.
