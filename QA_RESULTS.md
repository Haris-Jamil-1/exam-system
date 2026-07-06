# ExamPro — QA Execution Results (Phase 1 + 2)

Run date: 2026-07-03. Source checklist: `QA_CHECKLIST.md`. Test-and-report only — no app bugs were fixed. This is the final, complete results document after three rounds against the live database: an initial parallel run (noisy, discarded), a serial run (surfaced 3 test-harness defects), and a final serial run after fixing those defects (this document's source of truth).

## Run commands used
```
export QA_ALLOW_PROD_OVERRIDE=i-understand-this-writes-to-prod   # set per-shell-session, never persisted
npx tsx tests/fixtures/seed-tenants.ts
npx playwright test --workers=1
npx playwright test golden-path -g "GOLD-01" --workers=1   # one targeted rerun, see "GOLD-01" below
npx tsx scripts/qa-data-integrity-audit.ts                 # read-only, see DAT-01 finding below
```

## Authorization and guard override

Targeted **`rlbtdpnmdnaxlccelxdr`** (the same Supabase project backing `https://exam-system-sigma.vercel.app`), with explicit one-off human authorization overriding `tests/fixtures/guard-non-prod.ts`'s default refusal via a named flag (`QA_ALLOW_PROD_OVERRIDE=i-understand-this-writes-to-prod`), not a silent bypass. **All test data from the final run is left in place as evidence** — see "Data retention note" below for one caveat.

**Schema check (pre-flight, unchanged across all runs):** `Answer.marksAwarded` and `ExamAttempt.score` are still `Int?` in `prisma/schema.prisma` — testing against the original bug, not a fix.

**Data retention note:** an intermediate teardown/reseed cycle while fixing test-harness defects deleted the tenants that held the *first* round of SEC-01–04 evidence. That evidence was already fully captured as exact HTTP status/body text in this document's history and was **regenerated with fresh live DB rows** in the final run below — nothing is missing, but flagging the process error for transparency.

## Why serial, not parallel

Parallel execution (4 workers) against one live dev server + real Supabase Auth produced heavy login timeouts and cross-test contamination — infra noise, not app signal. All results below are from serial (`--workers=1`) runs.

## Three test-harness defects found and fixed mid-run
1. **Invalid enum value**: several tests used `proctoringLevel: 'low'`; the real schema (`src/app/api/exams/route.ts`) only accepts `basic|standard|strict`. Fixed to `'standard'` everywhere.
2. **Shared-fixture contamination**: `ERR-03` and `GOLD-01` reused the single seeded exam+student that other tests (`ERR-06`, `ERR-07`) had already driven to a terminal state. Fixed: `GOLD-01` now uses a dedicated `goldExam` seeded exclusively for it; `ERR-03` creates two fresh exams in a non-colliding time window.
3. **Playwright `request.fetch()` silently drops invalid-JSON string bodies** when `Content-Type: application/json` is also set — turning "malformed JSON" tests into accidental "empty body" tests. Fixed: `ERR-01`'s malformed-JSON assertions now use real browser `fetch()` via `page.evaluate()`, which sends the literal bytes over the wire. This fix **reversed several earlier false passes** — see below.

A fourth issue was found and fixed without being a "defect" per se: `ADM-04`'s and `ERR-03`'s exam-approval calls didn't set `status: 'live'`/`'scheduled'`, so the exams stayed `draft` and were invisible to the schedule-conflict query — fixed by adding `status` to the approval payload (`ADM-04`) and by using a time window that doesn't collide with other live exams (`ERR-03`). `GOLD-01` additionally needed two fixes discovered by actually watching it run: the exam-taking UI is one-question-per-screen (not a single scrollable page), and a floating camera-preview widget (`fixed bottom-right`) physically overlaps and intercepts clicks on the Submit button, requiring an offset click position.

## Final summary counts

| Outcome | Count |
|---|---|
| PASS (scoring, unit, no DB) | 33 |
| PASS (e2e, real HTTP/UI against live DB) | 24 |
| **FAIL — confirmed real app bug** | 12 (see below; some are one item counted across multiple sub-checks) |
| FAIL — test-infra only, not a checklist item (`TCH-01` selector) | 1 |

**52 e2e tests in the final full run: 24 passed, 28 failed** (plus one targeted rerun of `GOLD-01` alone, which passed after its own fix — see below). Every failure in the final run has a specific, verified explanation; none are unexplained.

---

## Confirmed real bugs (final evidence)

### SEC-01 (P0) — CONFIRMED
Tenant B teacher: `GET /api/questions?examId=<Tenant A's exam>` → **200**. Full question data, including per-option `isCorrect`, leaked cross-tenant. Evidence: `[{"id":"...","examId":"...","type":"mcq","stem":"QA: 2 + 2 = ?",...,"options":[{"id":"...","text":"3","isCorrect":false},{"id":"...","text":"4","isCorrect":true}...]`.

### SEC-02 (P0) — CONFIRMED
Tenant B teacher: `POST /api/questions` targeting Tenant A's exam → **201**. A rogue question was actually created inside another institution's exam.

### SEC-03, GET half (P0) — CONFIRMED
Tenant B teacher: `GET /api/attempts/<Tenant A student's attempt>` → **200**. Full attempt data (score, trustScore, violationCount) leaked cross-tenant. **The PUT half (overwriting another tenant's `trustScore`) has still not been exercised** — Playwright stops a test at its first failed assertion, and the GET check fails first every run. Left as a genuine gap in this suite, not a pass.

### SEC-04 (P1) — CONFIRMED
Tenant B **admin**: `PUT /api/exams/<Tenant A's exam>` with a title change → **200**. Tenant A's exam is renamed by an outside institution's admin, with zero institution-boundary check.

### SEC-07 (P0) — CONFIRMED
`POST /api/attempts` on a freshly-created exam whose `startTime` is 1 hour in the future → **201**. No time-window enforcement exists before an exam's scheduled start. This is the item you specifically flagged for confirmation.

### STU-01 / TIME-02 (P0) — CONFIRMED
`POST /api/attempts` on an exam whose `endTime` is 1 hour in the past → **201**. No enforcement exists after an exam's scheduled end either. Combined with SEC-07: `POST /api/attempts` has **no time-window check of any kind**.

### SCR-05 (P0) — CONFIRMED, and the mechanism is worse than originally predicted
Original prediction: a float `marksAwarded` (e.g., 8 marks ÷ 3 pairs × 1 correct = 2.667) would crash the submit transaction via a Prisma type-validation error against the `Int` column, leaving the attempt stuck `in_progress`.

**What actually happens, confirmed by querying the live row after a real submission:**
```json
{ "marksAwarded": 2, "isCorrect": false, "response": { "...": "Definition B", "...": "Definition B", "...": "Definition B" } }
```
The submission **does not crash** — `ExamAttempt.status` correctly reaches `"submitted"`. Instead, the computed value `2.667` is **silently truncated to `2`** somewhere between the JS `scoreAnswers()` calculation and the Postgres `Int` column write. The student is quietly under-scored by ~0.67 marks on this single question with **no error, no log, no indication anything went wrong** — arguably a worse failure mode than a crash, since a crash would at least be noticed. This reproduces on every matching/ordering question whose marks aren't evenly divisible by its pair/item count.

### ERR-01 (P0) — CONFIRMED broadly, corrects an earlier false-passing result
With genuinely malformed JSON bytes sent via real browser `fetch()` (not Playwright's request context, which was shown to silently drop such bodies): **all 15 tested mutating routes** return a non-JSON, bare-failure response — `POST /api/auth/register`, `POST /api/attempts`, `POST /api/attempts/[id]/submit`, `PUT /api/attempts/[id]`, `POST /api/exams`, `PUT /api/exams/[id]`, `PATCH /api/exams/[id]/publish-results`, `POST /api/questions`, `POST /api/violations`, `POST /api/invites`, `POST /api/invites/accept/[token]`, `POST /api/ai/generate-questions`, `PATCH /api/users/me`, `POST /api/upload`, `POST /api/extract-text`. This decisively confirms QA_CHECKLIST.md's original "zero of 18 routes have try/catch" finding — including `/api/auth/register`, the exact route involved in the signup bug fixed earlier this session, which is **still** unguarded against malformed input (just not against the specific unique-constraint bug that was fixed).

### ERR-02, upload/extract-text (P1) — CONFIRMED
Even a trivial, syntactically-valid empty JSON body (`{}`) crashes `POST /api/upload` and `POST /api/extract-text` with a non-JSON response — likely because these routes expect `multipart/form-data` and choke on any JSON-typed body, but the failure mode (bare crash, not a clean 400) is the same "no error handling" issue.

### STU-03 (P0) — CONFIRMED
Live-UI evidence from `GOLD-01`: per-question marks are visible on the post-submit `/complete` page, then **not visible after a reload of that same page** (`Per-question breakdown still visible after reload: false`) — exactly the sessionStorage-cleared-after-one-read behavior predicted from the code read.

### TCH-03 (P1, missing feature) — CONFIRMED
Live-UI evidence from `GOLD-01`: the teacher results page exposes **no** per-question answer drilldown for any question type (`Teacher results page exposes any per-question answer drilldown: false`).

#### DAT-01 (P0) — CONFIRMED, and this one touches REAL production data, not just QA tenants
`npx tsx scripts/qa-data-integrity-audit.ts` was run against the live database (read-only — `SELECT`s only, no writes, confirmed by reading the script before running it). It queries **all** `Answer` rows for `mcq`/`true_false` questions across the whole database, not just QA-prefixed data. Real exam titles came back in the results ("Final", "MIDTERM", "quiz#2", "QUIZ", "CHECK", "Q&A2" — clearly pre-existing production/demo exams, not this session's `qa_*`-prefixed ones), with real violation counts (1 to 44 per exam).

**Result: 2 real `Answer` rows disagree with current scoring logic**, both `submittedAt: "2026-06-25T14:04:06.442Z"` — a timestamp that lines up exactly with CLAUDE.md's own session log entry for that date ("Destructive QA Audit + 7 Critical Fixes," which includes the MCQ/true_false scoring fix). This is very likely **real evidence of actual student submissions scored under the pre-fix comparison bug** (comparing answer to option text instead of option ID), sitting in the database uncorrected. Per the checklist's explicit instruction, this was **not** rewritten — it's a report-only finding requiring a human decision (whether affected students should be rescored and/or renotified). Exact row IDs are in the script's output; rerun `npm run test:data-integrity` to see them again.

## New finding (not in original checklist) — `resultsPublishedAt` field silently omitted instead of `null`
`src/lib/data/exams.ts`'s `mapExam()`: `resultsPublishedAt: e.resultsPublishedAt?.toISOString()`. Optional-chaining on a `null` Prisma value evaluates to `undefined`, and `JSON.stringify` drops `undefined`-valued keys entirely — so `GET /api/exams/[examId]` never sends `"resultsPublishedAt": null` for an unpublished exam, it just omits the key. Minor (nothing in the current codebase does a strict `=== null` check against it — the one consumer found, `analytics.ts`, uses a falsy check that works either way), but a real API-contract bug worth a one-line fix (`?? null` instead of relying on `?.`).

---

## Confirmed passing (real evidence, final run)

- **STU-02 — matching-option shuffle genuinely works.** Two page loads of the same question produced different right-hand option orders: `[Definition B, Definition A, Definition C]` then `[Definition B, Definition C, Definition A]`.
- **ADM-01** (API + live-UI variants), **ADM-03**, **ADM-04** (after the `status:'live'` fix — real schedule conflict correctly detected and blocked the second approval), **TCH-04** (publish-results correctly sets `resultsPublishedAt` after being called — modulo the "before" value being `undefined` instead of `null`, noted above as its own finding), **ERR-03** (after using isolated fresh exams — two students submitting concurrently against their own attempts both succeeded cleanly, no corruption), **ERR-06**, **ERR-07**, **STU-04**, **TIME-05**, **SEC-05** (all 3 sub-cases), **SEC-06** — all confirmed with real HTTP round trips against the live database.
- **GOLD-01** (full golden path) — passes end-to-end once its own harness issues were fixed (see below): registration, matching-option-shuffle (confirmed above), answering, submitting an exam containing the SCR-05 non-divisible-marks questions (confirmed truncation above, no crash), and the STU-03/TCH-03 live confirmations above.

## Test-infra-only, not a checklist item
- **TCH-01** (a sanity check I added, not in QA_CHECKLIST.md) — selector timeout on the item-bank form's question-type dropdown. Not resolved; low priority since it's not a tracked checklist item.

---

## GOLD-01 — full account of what it took to get a clean run

Three real issues were found and fixed purely by watching this test execute, none of them app bugs:
1. The exam-taking UI is one-question-per-screen with sidebar navigation (buttons "1"–"6"), not a single scrollable page — the test now navigates explicitly between questions.
2. A floating camera-preview widget (`fixed bottom-4 right-4`, part of the proctoring UI) visually and functionally overlaps the Submit button. `force: true` alone did not help — it skips Playwright's obstruction check but still dispatches the click at the button's geometric center, which is exactly where the widget sits. Clicking a specific offset near the button's left edge (`position: { x: 10, y: 10 }`) landed correctly. **This may or may not affect a real user** depending on viewport size and browser chrome — flagged in QA_MANUAL.md as worth a human look, since headless Chromium's no-camera state might render the widget differently than a real webcam stream would.
3. Fixture sharing (see "three test-harness defects" above).

None of these are being reported as app findings — they're documented so the test remains reproducible and so the camera-widget overlap gets a human look.

---

## All FAILs by priority (P0 → P2) — final, confirmed

**P0:**
- SEC-01 — cross-tenant answer-key leak
- SEC-02 — cross-tenant question injection
- SEC-03 (GET half; PUT half unverified) — cross-tenant attempt data leak
- SEC-07 — no enforcement before exam start
- STU-01/TIME-02 — no enforcement after exam end
- SCR-05 — silent mark truncation (float → Int) on matching/ordering partial credit, no crash, no error
- ERR-01 — all 15 tested mutating routes crash ungracefully on malformed JSON, including `/api/auth/register`
- STU-03 — per-question marks lost after one reload
- **DAT-01 — 2 real production `Answer` rows (not QA test data) still scored under the pre-06-25-fix bug, sitting uncorrected in the live database**

**P1:**
- SEC-04 — cross-institution admin exam mutation
- ERR-02 (`/api/upload`, `/api/extract-text`) — crash on even a trivial empty JSON body
- TCH-03 — no per-student answer review pane exists for teachers, any question type

**P2 / new, minor:**
- `resultsPublishedAt` silently omitted instead of returned as explicit `null`

## Genuinely still-unverified (not a pass, not a confirmed fail)
- The camera-widget/Submit-button overlap's real-world impact on actual users (see QA_MANUAL.md) — requires a real browser at a normal viewport, not scriptable.

## Post-fix follow-up (2026-07-06, this session)
- **SEC-03's PUT half — now CONFIRMED FIXED.** The GET+PUT institution-scoping fix landed together in commit `cde294b`, but the e2e suite never independently exercised the PUT case (Playwright stops at the first failed assertion, which was always the GET check). Verified directly against live DB with a disposable script: Tenant B admin `PUT /api/attempts/[id]` on Tenant A's attempt → 404, `trustScore`/`violationCount` left untouched (100/0), and Tenant A's own teacher can still legitimately update it (200). No longer an open gap.
- **DAT-02 — now CONFIRMED FIXED, not just a static finding.** `deleteExam` (`src/lib/data/exams.ts`) already deletes violations → attempts → exam in one FK-safe transaction. This session independently exercised real deletes of disposable exams that had live attempts attached (during SEC-04/SCR-05/SEC-07/SEC-03 verification scripts) — every one succeeded cleanly (200), no orphaned rows, no FK errors. The underlying schema still has no `onDelete` on `ExamAttempt.exam`/`Violation.exam`, so a delete that bypasses the app layer (raw SQL) would still fail/orphan — that architectural note stands — but the actual product code path is confirmed safe.

## Plain summary
**13 confirmed real bugs this run** (counting SEC-03 as one item for its confirmed GET half, ERR-01/ERR-02 each as one item despite spanning many routes, and DAT-01 as one item for its 2 flagged rows). **9 are P0**, 3 are P1, 1 is a new minor finding. All test data from the final run remains in the database as evidence, per instruction. DAT-01's finding is the one exception worth flagging loudest — it's not QA-tenant data, it's real historical production answers.

## Files changed this run (test harness only, no app code touched)
```
e2e/checklist-coverage.spec.ts     enum fix, status:'live' fix, ERR-03 isolated-exam fix, TCH-04 null/undefined fix
e2e/security-idor.spec.ts          enum fix
e2e/golden-path.spec.ts            per-question navigation, submit-button click-position fix, dedicated goldExam
e2e/error-handling.spec.ts         malformed-JSON now uses real browser fetch() via page.evaluate()
e2e/fixtures.ts                    added goldExam to the TenantFixture type
tests/fixtures/seed-tenants.ts     added a dedicated goldExam per tenant; refactored exam+question creation into a reusable function
tests/fixtures/guard-non-prod.ts   added the named QA_ALLOW_PROD_OVERRIDE escape hatch (see diff in git history)
```
`e2e/verify-malformed-json.spec.ts` (ad-hoc, used to diagnose defect #3 above) has been deleted.
