# ExamPro — AI-Proctored E-Testing Platform

## Session Log

### 2026-07-14 — Password reset rework, Classes/ClassInvite/ClassEnrollment, admin deactivation ✅

Four-part spec, each area independently verified against the live prod DB (schema DDL + RLS applied via `scripts/mgmt-sql.sh` — `DIRECT_URL`:5432 is blocked again this session, but `DATABASE_URL`:6543/pgBouncer is reachable, **a new finding**: the app itself (`lib/prisma.ts`) always connects via `DATABASE_URL`, so `npm run dev` works fully against the live DB even when direct Prisma CLI calls need the pooler override — unblocks real Playwright-driven QA that prior sessions couldn't do). 120/120 vitest green (29 new).

- **Password reset** — moved off the earlier same-session `/forgot-password`+`/reset-password` pages to `/auth/forgot-password` + `/auth/reset-password` per spec (both under a new `src/app/auth/layout.tsx`, harmless for the sibling `/auth/callback` route handler). New `PasswordResetAttempt` log + `POST /api/auth/forgot-password` enforces per-email rate limiting (3/15min, `isRateLimited` in `class-permissions.ts`) before calling `resetPasswordForEmail` server-side (moved off the client to make the limit enforceable). `/auth/callback` now honors a same-site-only `next` param and redirects a failed/expired code-exchange to `/auth/reset-password?error=expired` instead of the generic login error, so `reset-password`'s server component can render a clear expired/invalid state distinct from the working form.
- **Class / ClassInvite / ClassEnrollment** (new models) — one teacher → many `Class` rows; invite/accept deliberately reuses the *existing* `InviteToken`/`/invite/[token]` pattern's proven shape (token → public validate route → accept route creates-or-links the Supabase+Prisma account) rather than a new mechanism, layered as its own self-contained model per spec. Bulk invite (`parseBulkEmails` — comma/newline, deduped, invalid dropped) branches per email: an existing student in the same institution gets enrolled only once already authenticated as that exact account (`/classes/join/[token]`'s `needs_login` state sends them to `/login?redirect=...` instead of ever resetting their password); a brand-new email gets the same Supabase-admin-createUser signup form `/invite/[token]` already uses. `teacher/classes` (list+create) and `teacher/classes/[classId]` (roster, invite dialog, invite-status list) are new pages; nav + i18n (`nav.classes`) added.
- **Removal / deactivation RBAC** — `src/lib/class-permissions.ts` (pure, mirrors `item-bank-permissions.ts`): `canManageClass`/`canRemoveEnrollment` (teacher-owns-class OR institution admin, cross-tenant hard-denied), `canDeactivateUser` (institution admin only, never another admin, never a super admin, never self — separate from and narrower than the Super Admin panel's own `/api/super/suspend`, same `User.suspendedAt` flag). Teacher roster removal deletes only the `ClassEnrollment` row (`window.confirm`, matching this codebase's existing delete-confirmation convention — no new dialog component). Admin deactivation (`setUserSuspension` in `lib/data/users.ts`, wired into `admin/teachers` and `admin/users`) cascades by archiving (not deleting) the teacher's classes; enrollment history and exams are untouched.
- **RLS** — `Class`/`ClassInvite`/`ClassEnrollment` get the same SELECT-only, `authenticated`-role policy shape as the 4 tables from 2026-07-11 (narrows SEC-08 further; confirmed live via `pg_policies`).
- **Bug found via live QA, fixed (not scope creep — this is the exact mechanism the deactivation feature depends on)**: `GET/PATCH /api/users/me` reimplemented its own auth check with a bare `supabase.auth.getUser()` instead of `getAuthUser()`, so a just-deactivated user's session-bootstrap call kept succeeding — the suspension had no effect on the one endpoint every login calls first. Fixed by routing both handlers through `getAuthUser()`.
- **Known pre-existing, unrelated bug surfaced (not fixed, out of scope)**: `DashboardShell`'s avatar-initials computation reads `localStorage` client-side, causing a real SSR/client hydration mismatch on every dashboard page (not introduced this session — confirmed via `git stash`). It doesn't corrupt any mutation (server actions still complete correctly, verified via direct API calls alongside the UI-driven ones in QA), but it does cause React to discard and remount the page's component tree after the mismatch, which made pure UI-click-only QA assertions flaky. Worth a follow-up pass.
- **Verification**: `tsc`/`lint` (3-error/1-warning baseline, unchanged) / `build` (74 routes) all clean · `vitest` 120/120 · disposable, self-cleaning Playwright + Prisma script against the live dev server + live DB (two throwaway institutions, admin/2 teachers/2 students) covering class creation, bulk invite → both accept paths, enrollment removal (teacher-owned and cross-tenant-denied), admin deactivation cascade, and the rate-limit 429 boundary — all passed, all QA data cleaned up afterward.

### 2026-07-12 — Phase 3 follow-up: hosted Judge0, Vercel Python psychometrics, Master Admin Panel ✅

Three follow-up tasks (progress: `docs/phase3/FOLLOWUP_PROGRESS.md`), each committed separately, 91/91 vitest + 10/10 pytest green throughout:
- **Hosted Judge0** — self-hosted docker-compose removed; client targets the pay-per-use Shared Cloud API via `JUDGE0_API_URL`+`JUDGE0_API_KEY` (sends both `Authorization: Bearer` and `X-Auth-Token`, provider-agnostic). New `JudgeUsageLog` (one row per coding-answer grading event, `submissionCount` = test cases run = billing unit) is the per-institution cost attribution; per-institution monthly submission counter (`judgeMonthlyQuota`/`judgeUsageCount`, default 1000) reuses the AI-quota mechanism with a shared month rollover — quota hit means the answer is held for manual grading, never a failed exam.
- **Psychometrics inside Vercel** — the standalone FastAPI service is gone; `api/psychometrics/compute.py` is a Vercel Python Function (auto-detected via root `requirements.txt`, stateless, well under the duration cap), stats module moved unchanged (`_stats.py`), client calls it internally; `PSYCHOMETRICS_URL` removed (supersedes the 2026-07-11 entry's deployment notes).
- **Master Admin Panel** — new platform tier ABOVE institution admins: `User.isSuperAdmin` (deliberately not a `Role` value; own `getSuperAdmin()` gate, set manually via SQL: `UPDATE "User" SET "isSuperAdmin" = true WHERE email = '...'`). `/super` page + `/api/super/*`: all institutions with teacher/student/active-exam counts, monthly Judge0 + Claude usage with env-tunable cost estimates (`JUDGE0_COST_PER_SUBMISSION` default $0.0005, `AI_COST_PER_CALL` default $0.02), and suspend/unsuspend for institutions and users. Suspension is a soft `suspendedAt` flag enforced in `getAuthUser` (suspended user, or any non-super user of a suspended institution, is treated as unauthenticated); super admins can't suspend each other from the panel. Middleware lets authenticated users reach `/super`; the DB flag on every API route is the actual gate.

### 2026-07-11 — Phase 3 implementation ✅ (all 5 areas; architecture docs in `docs/phase3/`, progress log in `docs/phase3/IMPLEMENTATION_PROGRESS.md`)

Implemented per the 6 architecture docs written earlier the same day (`docs/phase3/01–06`) under Haris's autonomous-kickoff prompt with 12 locked decisions. 8 commits, each independently verified (tsc / lint baseline / build / vitest — now 91 tests — plus 10 pytest fixtures for the stats service). **Live-server QA was impossible this session**: the local network blocks outbound Postgres ports (5432/6543), so the dev server can't reach the DB. All DDL was applied and row-level verified over HTTPS via the Supabase Management API (`scripts/mgmt-sql.sh`, reusable helper, CLI keychain token). A deferred live-QA checklist is in IMPLEMENTATION_PROGRESS.md — run it when pg egress returns.

- **Proctoring (doc 01)**: real client-side detection replaces every mock — MediaPipe Face Landmarker (face count + coarse gaze via nose-cheek ratio + both-irises heuristic; adaptation: one runtime instead of face-api.js + MediaPipe), COCO-SSD phone/book/laptop on sampled frames, sustained-episode audio VAD; all models self-hosted in `public/models/` (~23MB, no external calls). `ProctoringEventBuffer` batches events (10s/20-event/immediate-high) to a batched `POST /api/violations` with server-side severity re-derivation, clientSeq idempotency, and a 30s heartbeat (`ProctoringHeartbeat`) that makes detector suppression visible. Trust score v2 (severity/duration/confidence-weighted, per-type caps) recomputed live on every ingest. Evidence per decision 1: snapshot only on multi-face/phone/sustained-no-face, private storage path, visible capture indicator (decision 3), 30-day purge cron, consent line on the instructions screen. Also fixed a pre-existing hole: students could write violations against other students' attemptIds (no ownership check).
- **Live monitoring (doc 04)**: per-exam monitor now runs on Supabase Realtime (debounced refresh triggers; polling retained as fallback — 10s down/60s live, with a Live/Polling badge). Roster gains heartbeat-staleness "Disconnected" state, needs-attention sort, trust<60/high-severity flagging. The Phase-1 fake "live feed" (teacher's own camera!) is replaced by on-demand snapshots via a new `MonitorDirective` table (snapshot/warning/force_submit — one mechanism, doubles as the audit log of teacher actions). Force-submit: directive for live clients, `/api/monitor/force-finalize` for dead ones (finally closes the browser-died-mid-exam gap). Browser `Notification` for high-severity when tab hidden (decision 12; Web Push infra deferred per doc 04's scope valve).
- **AI generation (doc 02)**: now async — 202 + `GenerationJob` row + Vercel background work (`after()`), polled via `/api/ai/jobs/[jobId]` with a 5-min staleness sweep. Real Claude call (`claude-sonnet-5` per doc 02 via one `AI_MODEL` env-overridable constant, structured output, zod-validated, retry≤2, injection-hardened source framing) with **mock fallback when `ANTHROPIC_API_KEY` is absent** — job records `model: 'mock'`. Dup detection both layers: 30 recent stems in-prompt + pg_trgm >0.6 → `ai-possible-duplicate` tag + badge. Decision 5: `Institution.aiMonthlyQuota` (default 1000) with atomic monthly counter and hard 429.
- **AI grading (doc 03)**: two-stage completion — essay/coding answers enter `Answer.gradingStatus = pending_ai` at submit (both normal and sectioned routes), AI suggestions run in background, and **only teacher confirm/override ever writes marks** (decision 4, no auto-confirm). Append-only `AnswerGrading` log with per-event `rubricSnapshot` = the dispute trail (adaptation: JSON rubric on the question + snapshots, instead of a separate versioned Rubric entity; `gradingStatus` is the state machine instead of a GradingJob table). Essay: per-criterion scores with quoted evidence + injection flags. Coding: self-hosted Judge0 (`judge0/docker-compose.yml`, decision 7, `JUDGE0_URL` env) runs test cases, Claude reviews quality, combined 70/30 (per-question override); marks never awarded when the sandbox is unavailable. GradingPanel on the TCH-03 per-student page; minimal rubric editor (name | points | description lines) in Add Question for essays. AI unavailable in any way → answers stay pending for manual grading.
- **Psychometrics (doc 05)**: `ItemAdministrationStat` (upsert per administration) + `ExamReliabilityStat` + `Question.sourceItemId` (stamped by both materialization paths — item-8 pooling and wizard fixed selection). New `psychometrics/` FastAPI service (decision 8; adaptation: pure-Python formulas, each validated against hand-computed pytest fixtures — no numpy needed at this scale): partial-credit facility index, pooled-aware corrected point-biserial, alpha/KR-20 (NULL for sparse pooled matrices, honestly), distractor quartiles, insufficientN<10 (decision 10), no IRT (decision 11). Triggers: nightly cron sweep + teacher on-demand recompute; both no-op without `PSYCHOMETRICS_URL`. The bank's FI%/DI% columns finally show real data.
- **SEC-08 annotation (decision 2 — narrows, does not erase, the 2026-07-06 sign-off)**: RLS is now ENABLED on exactly 4 tables — `Violation`, `ExamAttempt`, `ProctoringHeartbeat`, `MonitorDirective` — with SELECT-only policies for `authenticated` (students see own rows, teachers/admins their institution), added to gate Supabase Realtime reads. No write policies (side effect: direct PostgREST writes to these 4 tables, previously possible under default grants, are now denied). Prisma is unaffected (connects as table owner; non-FORCE RLS). **The rest of the schema remains app-layer-only enforcement — SEC-08 otherwise stands as accepted.**
- **New services to deploy when wanted** (app degrades gracefully without them): Judge0 (Docker, own host) and the psychometrics FastAPI container; plus env vars below.
- **Known deferred items**: live end-to-end QA (network blocker; checklist in IMPLEMENTATION_PROGRESS.md), grading-queue badges on the results table, per-administration stats drill-down UI, `Item.reviewedById` stamping on approve, Web Push, cross-exam `teacher/monitor` overview page still polls.

### 2026-07-09 (cont'd) — Multi-section exam architecture (spec item 9) ✅ (final item — all 9 spec items now complete)

The largest, most invasive item in the whole pass — touches the schema, the exam builder, the entire student exam-taking page, scoring, and both teacher-facing results pages. Built 100% additively on top of the existing non-sectioned flow: a normal exam has zero `ExamSection` rows and is unaffected end-to-end (same JSX, same `useExamTimer`, same question-locking mechanism), gated everywhere behind `isSectioned = sections.length > 0`.

- Schema: `ExamSection` (title, instructions, optional `durationMinutes`, `orderIndex`, `sectionWeight`, optional `passingThreshold`) and `SectionAttempt` (one per student per section — status/startedAt/submittedAt/score/totalMarks/scorePercentage/passed, `@@unique([attemptId, sectionId])`). `Question.sectionId` nullable FK — null means "no section" (default, fully backward-compatible), matching the same nullable-FK pattern already used for `Question.attemptId` in item 8.
- Teacher exam editor: new `SectionsManager` (full CRUD, weight-sums-to-100% validator, "Lock Completed Sections" / "Lock Answered Questions" toggles), plus a section `<Select>` in the Add Question form and per-question reassignment.
- Student exam page: generalizes item 1's single instructions-screen into a per-section loop — Section N instructions → Start Section N (seeds that section's own isolated timer, independent of the overall attempt) → answer → Submit Section → Section N+1 instructions... A header progress indicator (numbered circles, green check once a section is submitted) makes multi-section progress visible at a glance. Section deadline is `min(sectionStart + section.durationMinutes, exam.endTime)` — same "whichever is sooner" rule item 2 already established at the exam level, just re-scoped per section.
- Scoring (`lib/scoring.ts`'s new `computeSectionScores`): groups answers by `question.sectionId`, computes raw/scaled score per section, applies `sectionWeight` for a weighted composite, and evaluates each section's own `passingThreshold` independently — a section can fail its threshold and flag the whole attempt `Failed` even when the composite score alone would read as a clean pass. The last section's submit call triggers this and finalizes the parent `ExamAttempt`.
- **Judgment call flagged explicitly (this is the one the user asked about specifically)**: a section-threshold failure is a real, silent trap for a teacher skimming a results table by percentage alone — a student can score 75% overall and still have failed the exam. Rather than leave this implicit, added a `sectionsFailed` flag (derived from `SectionAttempt.passed === false`, no schema change needed) threaded through `getStudentResults()` into the results table's Pass/Fail badge (renders **"Fail (section)"**, not a plain "Pass", even when the raw percentage alone would clear the bar) and through the student's own `complete` page (the score card and headline text now read "Section threshold not met" instead of a contradictory "Pass" sitting right above the section-breakdown card's own failure banner).
- Per-student teacher review page (TCH-03, extended not rebuilt): answers are now grouped by section with a section-breakdown summary card above them; each question already carried the right data because `getStudentSubmissionDetail()`'s question query was already attempt-scoped from item 8's audit (`OR: [{attemptId: null}, {attemptId: thisAttempt}]`) — sections and pooling compose correctly together with no extra work.
- Cleanup: removed a genuinely-dead `sectionAttemptStartedAt` state variable (setter called at 3 sites, value never read — local closures already had what was needed at each call site) and gave `submittedSectionIds` a real purpose (the header progress indicator) instead of leaving it set-but-unread.
- **Verification**: 10 new unit tests (`tests/unit/section-scoring.test.ts` — weighted composite math, per-section threshold override, unsectioned-exam pass-through). Fresh `tsc --noEmit` clean · `eslint` back to the exact pre-existing 3-error/1-warning baseline (one stale `eslint-disable-line` from before this item existed turned out to be silently masking nothing once cleaned up, and got removed) · `next build` passes (51 routes) · `vitest` 63/63. Extensive live QA against the real dev server + live DB: built a disposable 2-section exam (Section A: easy, 50% weight, 50% threshold; Section B: hard, 50% weight, 90% threshold — deliberately designed so a student could pass the composite but fail Section B), drove an actual browser through the full student flow via Playwright (login → instructions → Section A start/answer/submit → Section B start/answer/submit → complete page), and independently confirmed at the DB level that both `SectionAttempt` rows and the finalized `ExamAttempt` (6/8, 75%) matched exactly. Confirmed both teacher-facing consequences live: the results table showed "Fail (section)" despite 75%, and the per-student page correctly grouped Section A / Section B answers with the right per-section pass/fail badges. All QA data (exam, sections, questions, attempt) cleaned up afterward.

### 2026-07-09 (cont'd) — Stratified dynamic pooling & test blueprint (spec item 8) ✅

The most architecturally significant item this session — every student can now get a genuinely different, randomly-drawn question set for the same exam, which meant auditing and fixing every place in the codebase that assumed "one shared Question list per exam."

- `Question.attemptId` (nullable FK, `onDelete: Cascade`) added: `null` = the exam's normal fixed/shared question (unchanged default), set = privately materialized for exactly one attempt. **Every query that lists "this exam's questions" had to be audited** — a bare `{ examId }` filter would otherwise mix every student's individually-drawn pooled questions together. Fixed: `getQuestions()` (teacher's fixed-question editor, now `attemptId: null` only), new `getQuestionsForAttempt()` (fixed + this-one-attempt's-pooled, used by the student exam page and the submit/scoring route), and `getStudentSubmissionDetail()` (teacher's per-student review pane, now attempt-scoped instead of exam-wide). Confirmed already-safe by inspection: the results/complete page and `getQuestionDifficulty()` were already driven from `Answer` rows (attempt-scoped by construction), not from `Question.findMany({examId})`.
- Wizard Settings step: the old inert "Dynamic Question Pooling" stub (poolSize/questionLimit, never wired to anything, explicitly labeled "Phase 2 feature") is replaced with a real Blueprint Matrix (`BlueprintPoolingPanel`) — bank multi-select, then a table of every distinct CLO across those banks with its available approved-item count and a target-draw input (clamped to available), total exam length derived live as the sum of draws. Stored as `settings.dynamicPoolingBankIds` + `settings.dynamicPoolingBlueprint: { [cloId]: count }`.
- JIT stratified sampling (`lib/data/pooling.ts`'s `materializePooledQuestions`): on a brand-new attempt only (never re-drawn on resume), for each CLO draws `count` approved items via `ORDER BY RANDOM()` from the configured banks, concatenates every CLO's draw, shuffles once more, and copies the result into that attempt's private `Question` rows. Re-verifies every bankId actually belongs to the exam's own institution independently (the caller here is a student, who has no "accessible banks" permission concept to lean on the way the teacher-facing `getCloPoolCounts`/`getBanksForBlueprint` do via `getAccessibleBankIds()`).
- Student exam page: the pre-attempt instructions screen shows "Your question set is generated when you start" instead of a question count for a pooled exam (there's nothing to preview yet), and no longer disables the Start Exam button on `questions.length === 0` for that case. Right after the attempt is created, it re-fetches with the now-known `attemptId` — the first moment a pooled exam's real per-student set exists.
- Teacher-facing judgment call, called out explicitly since a teacher reviewing a pooled exam sees something structurally different than before: the exam editor now labels the list "Fixed Questions" and shows a banner explaining pooled questions aren't managed there; the results page shows a similar banner above the difficulty chart, pointing to the already-existing per-student "View answers" page (TCH-03) for any one student's exact questions, since there is no longer one shared "the exam's questions" to show question-by-question stats against.
- Also fixed a real IDOR while auditing `lib/data/questions.ts`: `createQuestion()` had **zero ownership check** — any authenticated user could inject a question into any exam by ID. Added the same institution+teacher-ownership check `updateQuestion`/`deleteQuestion` already had.
- **Verification**: fresh `tsc --noEmit` clean · `eslint` at the same pre-existing 3-error/2-warning baseline (one new violation introduced and fixed during this pass — a `setState` called synchronously in an effect body in the new `BlueprintPoolingPanel`, fixed by matching this codebase's established inner-async-function pattern from `CurriculumPicker`) · `next build` passes · `vitest` 53/53 (unchanged — this item's logic is DB-query-driven throughout, not pure-function-testable, so verification leaned on live QA instead) · extensive live QA: built a real blueprint (2 CLOs × 2 items each) across a disposable bank, ran two different students through the same pooled exam end-to-end via the actual UI, and independently confirmed at the DB level that their 8 total `Question` rows split cleanly 4-and-4 by `attemptId` with zero overlap, each attempt scored 8/8 correctly, and the teacher's per-student review page showed exactly — and only — each student's own actual questions. All QA data (bank, items, exam, second student) cleaned up afterward.
- **Known scope-limited gap, left for a future pass**: there is no facility-index/discrimination-index calculator that ties back to the source `Item` for pooled exams (per-item psychometrics across "the 4 people who happened to draw this specific item" would need a new aggregate, not something that existed before this item either — `Item.facilityIndex`/`discriminationIndex` fields exist in the schema but no calculator populates them anywhere in the codebase, pooled or not).

### 2026-07-09 (cont'd) — CLO-aware, batch-controlled AI generation (spec item 7) ✅ (items 8-9 next)

- `MAX_BATCH_SIZE = 15` (`src/lib/ai/constants.ts`) shared between client (quantity input cap + reactive "Generate {n} Questions" label) and server (hard `zod` `.max()` rejection with a structured 400 — never reaches generation/persistence).
- `AiGeneratePanel` gained a `CurriculumPicker` (reused from `items/new`, Course → Topic → CLO cascading selects) and a quantity `Input`; client-side blocks submission outside `[1, MAX_BATCH_SIZE]` with a visible error, mirroring the server check.
- Server resolves `learningObjectiveId` → CLO text before generating, **and verifies the CLO's course belongs to the caller's own institution** — `LearningObjective` has no institution scoping of its own in the schema (only inherited via `topic → course → institutionId`), so this was a real, previously-unguarded cross-tenant read path (a teacher could otherwise have pulled another institution's CLO text into a generation prompt). Confirmed blocked (400) via a disposable throwaway second-institution CLO.
- The mock generator (`lib/ai/question-generator.ts`) now honors the actual requested `count` instead of silently capping at 5 — cycles its canned pool with a `(variant N)` suffix once exhausted so a batch of, say, 12 returns 12 distinguishable items — and folds the resolved CLO text into each item's `explanation` as `[Aligned to CLO: ...]`, so CLO-awareness is observable end-to-end even without a real LLM call yet. The real-prompt-injection directive string from the spec is written into the route as a ready-to-activate comment, gated behind the same `Phase 3: call Anthropic API here` marker used elsewhere in this codebase.
- Every generated item gets `learningObjectiveId` stamped on creation.
- **Bug found and fixed during QA, not just added tests around**: the batch-creation `prisma.$transaction([...])` call hit Prisma's default 5s interactive-transaction timeout once real network latency was involved — reproduced live as a hard 500 on a batch of 8 against the remote dev DB. Fixed by dropping the transaction wrapper in favor of `Promise.all` of independent creates (no cross-row invariant needs atomicity here; a partially-succeeded batch of drafts is harmless, the teacher just reviews what landed).
- **Verification**: 6 new unit tests (`tests/unit/question-generator.test.ts` — count honored exactly, no duplicate stems under cycling, CLO text folded correctly) · fresh `tsc --noEmit` clean · `eslint` at the same pre-existing 3-error/2-warning baseline · `next build` passes · `vitest` 53/53 · live QA: server-side batch-size rejection (count=20 → 400), server-side cross-tenant CLO rejection (400), and the full happy path (quantity=8 + CLO selected through the real cascading picker → 8 items land in the bank, each correctly stamped and explanation-tagged) — verified directly against Postgres, not just the UI. All QA data (bank, items, throwaway institution) cleaned up afterward.

### 2026-07-09 (cont'd) — Item Bank RBAC + AI-generation decoupling (spec items 5–6) ✅ (in progress overall — items 7–9 next)

Continuation of the same day's spec work — items 1–4 shipped first (see entry below), then items 5–9 tackled in dependency order (5 → 6 → 7 → 8 → 9, per `requirements.md`'s own phasing). This entry covers 5 and 6; 7–9 will get their own entries as they land.

**Item 5 — Multi-Tiered Item Bank & RBAC:**
- New `ItemBank` / `ItemBankAccess` models (`bankLevel: institutional|personal`, `permissionRole: owner|editor|viewer`); `Item.bankId` added (nullable, backfilled — `scripts/backfill-item-banks.ts` — every pre-existing item got assigned to a new per-institution "Legacy Items" institutional bank so nothing was orphaned).
- Single permission function (`src/lib/item-bank-permissions.ts`'s `resolveBankPermission`) is the one and only place bank access is decided — every route/data function goes through it. Cross-tenant is a hard, unconditional deny before any role/ownership logic runs. **Deliberate design call**: institution admins get implicit `owner` on every bank in their own institution (including personal ones) — this matches the admin-authority pattern already established for exams/questions (SEC-01..04) and was required to avoid regressing the pre-existing admin item-review workflow, which has always seen every item in the institution regardless of author.
- Along the way, fixed a real pre-existing IDOR: `updateItem`/`getItemById` in `lib/data/items.ts` had **zero auth or institution checks** — any authenticated user could read or mutate any item by ID, institution-blind. Now fully permission-checked.
- `teacher/items` reworked into a 3-tab bank dashboard (Institution / My Private / Shared with Me) → bank detail page (`teacher/items/[bankId]`) → "Manage Access" modal for inviting colleagues (institution-scoped search, EDITOR/VIEWER roles). Admin gets a parallel `admin/item-banks` page to create institutional banks and assign teacher editors (can't reuse the teacher route — middleware blocks admins from `/teacher/*`).
- **Verification**: unit tests added (`tests/unit/item-bank-permissions.test.ts`, 14 tests covering every branch of the permission function including adversarial cross-tenant cases) + a live cross-tenant Playwright pass against a disposable second institution — confirmed the dashboard never leaks another tenant's banks, direct URL navigation to another tenant's bank is denied, a self-grant attack (POST collaborators as an outsider) returns 403, and a legitimate owner attempting to grant access to a user from a different institution is also blocked. Also drove the full legitimate same-institution collaboration path end-to-end (owner invites colleague → colleague sees it under "Shared with Me" → colleague has editor rights, no "Manage Access"). All QA data created and cleaned up via disposable scripts, same as every prior session's pattern.

**Item 6 — Decouple AI Generation from Exam Wizard:**
- Exam wizard's "AI Generation" step removed entirely; stepper is now Basic Info → Select Questions (cross-bank picker, backed by item 5's `getAccessibleBankIds()`) → Settings.
- `/api/ai/generate-questions` now takes `itemBankId` (permission-checked, editor+) and saves generated questions **directly to the `Item` table** as drafts, returning the created rows — previously it was stateless (returned JSON only) and the wizard persisted client-side.
- New "Generate with AI" button + panel on the bank detail page (editor+ only), alongside "Add Question"/"Import CSV".
- **Verification**: live Playwright pass confirmed the wizard stepper no longer mentions AI Generation, generation from the bank page creates exactly the requested items scoped to that bank with `status: draft`, and they appear immediately in the bank's item list — checked against the DB directly, not just the UI (this dev environment's remote-DB latency produced several false "not working" readings from fixed-timeout screenshots during testing; each was confirmed a timing artifact, not a real bug, by querying Postgres directly).

**Fresh verification before commit** (per explicit request, not reusing earlier results): `npx tsc --noEmit` clean · `npm run lint` → 3 errors/2 warnings, all pre-existing baseline (unchanged from before this session) · `npm run build` passes · `npm run test:unit` → 47/47 passing.

**Known gap, not addressed yet**: the full Playwright e2e suite (`npm run test:e2e`) requires a second, fully separate Supabase project (`tests/README.md`) whose credentials are not configured in this environment — could not be run. All verification above was either `vitest` unit tests (env-independent) or manual live-DB QA via disposable, self-cleaning scripts, matching this repo's established pattern for sessions without e2e credentials.

### 2026-07-09 — Student UI & Time Controls (spec items 1–4) ✅

A 9-item spec ("Student UI & Time Controls Updates") came in. Full gap analysis against the actual codebase written to `requirements.md` first — items 1–4 (pre-exam instructions, availability-vs-duration auto-submit, per-item time limits, optional AI proctoring toggle) are additive and were implemented + QA'd this pass. Items 5–9 (multi-tiered Item Bank RBAC, decoupling AI generation from the exam wizard, CLO-aware batch AI generation, stratified dynamic pooling, multi-section exam architecture) are each a ground-up schema/architecture addition — scoped out to a dedicated follow-up session per user decision; full plan for each remains in `requirements.md`.

**Shipped this pass:**
- **Pre-exam instructions screen** — `Exam.instructions` (String?) added to schema. Exam wizard Step 1 and the exam edit page now have an instructions textarea. Student exam flow (`exam/[examId]/page.tsx`) inserts an Instructions screen with a "Start Exam" button between the biometric gate and the exam UI; the duration timer is not computed/started until that button is clicked (`handleStartExam`), never on page load.
- **Availability window vs. duration auto-submit** — `Exam.startTime`/`endTime`/`duration` already existed as separate fields (just needed correct wiring, no schema change). Client now seeds the countdown from `min(startedAt + duration*60s, endTime)` computed at Start-Exam click, not from `endTime` alone as before. Server (`/api/attempts/[attemptId]/submit`) independently recomputes the same deadline and now writes `status: 'auto_submitted'` vs `'submitted'` based on whether the request landed at/after it — this also makes real use of the previously-dead `auto_submitted` enum value.
- **Per-item time limits** — `Question.timeLimitSeconds` / `Item.timeLimitSeconds` (Int?, optional) added. Exam edit page and "Add Question" form expose it per question. Student exam page renders a mini countdown (`ItemCountdownBadge`, remounts via `key={question.id}` to reset cleanly without a setState-in-effect anti-pattern) that auto-advances to the next question on expiry and permanently locks "Previous"/sidebar navigation back to any expired question index.
- **Optional AI proctoring toggle** — `Exam.isProctoringEnabled` (Boolean, default true) added. Wizard Settings step and the exam edit page have an "Enable AI Proctoring" toggle. When off, the student exam page skips the biometric onboarding gate entirely and never mounts `<ProctoringOverlay>` (no camera/mic `getUserMedia`, no tab/fullscreen/audio/face monitors) — verified via a headless-browser QA pass that no `<video>` element is ever created when the toggle is off, and that the biometric gate still renders correctly when proctoring is on + `strict`.

**Verification**: `npx tsc --noEmit` clean · `npm run lint` → 3 errors/2 warnings, all pre-existing baseline (confirmed via `git stash` diff — actually one fewer warning than the prior 3-warning baseline, since `serverOffset` is now used) · `npm run build` → passes, 51 routes. Manually driven end-to-end against the live dev server + prod DB with a disposable, self-cleaning Playwright + Prisma script (two throwaway exams, deleted after): confirmed the instructions screen blocks the timer until clicked, the per-item timer auto-advances and locks `Previous` at expiry, and the proctoring toggle correctly gates the biometric gate + camera widget in both directions.

**Known residual gap, not addressed this pass**: there is still no background job that force-submits an attempt if the student's own browser tab dies before the client-side timer fires (e.g. crash, closed tab, lost network) — the server-side deadline check in the submit route only labels a late submission correctly, it doesn't independently force one to happen. Would need a cron/scheduled task; out of scope for this pass, noted for Phase 3 planning.

### 2026-07-06 — QA_RESULTS.md Priority Fix Pass ✅

Worked `QA_RESULTS.md`'s P0/P1 findings from the 2026-07-03 QA audit in priority order. Each fix: implemented → typecheck/lint/build clean → verified against live prod DB (`rlbtdpnmdnaxlccelxdr`) with a disposable, self-cleaning script → committed and pushed individually.

**Fixed and verified this pass:**
- **SEC-04** (`251f0f1`) — `PUT`/`DELETE /api/exams/[examId]` and `updateQuestion`/`deleteQuestion` (`lib/data/questions.ts`) skipped ownership checks entirely for `role === 'admin'`, letting any institution's admin mutate/delete another institution's exams and questions. Added institution scoping matching the SEC-01/02/03 pattern.
- **SCR-05** (`397be86`) — `Answer.marksAwarded` / `ExamAttempt.score` were `Int`, silently truncating fractional partial credit on matching/ordering questions (e.g. 8÷3×1 = 2.667 → stored as 2, no error). Changed both to `Float`, applied live via `prisma db push` (no migrations dir in this project — datasource URL comes from `prisma.config.ts`, not the schema file).
- **SEC-07 / STU-01 / TIME-02** (`82c6bd5`) — `POST /api/attempts` had no server-side `startTime`/`endTime` check at all. Added enforcement that gates only brand-new attempts (existing attempts always resumable); before-start is blocked unless the teacher manually went live early (`status === 'live'`), after-end is always blocked.
- **ERR-01 / ERR-02** (`63c2d19`) — all 15 mutating routes crashed with a bare non-JSON response on malformed JSON or wrong Content-Type. Added `withErrorHandling()` in `src/lib/api-auth.ts` and applied it to every mutating handler; malformed input now returns structured 4xx JSON.
- **SEC-03 PUT half + DAT-02** (`3ae2d16`, docs only) — both were already safe (PUT institution check landed with the GET fix in `cde294b`; `deleteExam`'s FK-safe transaction already handles cascade correctly) but had never been independently exercised. Verified live, no code change needed; closed out in `QA_MANUAL.md`.

**Round 2 — DAT-01 correction + remaining scope cleanup, same day, after user sign-off:**
- **DAT-01** (`a7d6fe4`) — per explicit user decision, recalculated and corrected the 2 flagged production `Answer` rows (both belonged to the same `ExamAttempt`, exam "MIDTERM"): `isCorrect` false→true and `marksAwarded` 0→4 on each, parent attempt `score`/`scorePercentage` recomputed 0/0%→8/67%. A 3rd answer in the same attempt was independently checked and confirmed genuinely wrong (left untouched). Full before/after values and root cause logged in new `CORRECTIONS.md`. Re-ran the read-only audit afterward: 0 rows now flagged (down from 2).
- **STU-03** (`5f55451`) — per-question breakdown was read once from `sessionStorage` then deleted, so a hard reload of `/exam/[examId]/complete` lost it permanently. Moved the source of truth server-side: `GET /api/attempts/[attemptId]` now returns a `perQuestion` array; the exam page passes `attemptId` in the redirect URL instead of stashing data in `sessionStorage`, so the completion page re-fetches fresh on every load.
- **resultsPublishedAt** (`58f60e1`) — `mapExam()` used `?.toISOString()` with no `?? null` fallback, so `JSON.stringify` silently dropped the key for unpublished exams instead of sending `null`. One-line fix + widened the `Exam` type.
- **TCH-03** (`16feb07`) — added the missing per-student answer review pane: new `getStudentSubmissionDetail()` in `lib/data/students.ts` (all 10 question types, resolves option IDs to readable text, mirrors `scoring.ts`'s matching/ordering index alignment) backing a new `teacher/exams/[examId]/results/[studentId]` page, linked from a new "View answers" column on the results table. Scoped with the same institution/ownership pattern as this session's other IDOR fixes.

**Camera-widget/Submit-button overlap** — user will check this themselves in a real browser per `QA_MANUAL.md`'s steps; not blocking, not further action needed from here.

**Known Accepted Risk (user sign-off, revisit after Phase 3's shape settles):**
- **SEC-08 — no database-level RLS.** All authorization is enforced at the application layer (API routes / `lib/data` functions) — there is no Postgres RLS backstop on `Question`, `ExamAttempt`, `Answer`, or `Exam`. App-layer checks are now solid everywhere touched this session, but a future route/function that forgets a check has no defense-in-depth. Accepted as a known risk for now rather than a blocking gap.

**Build status (final, both rounds)**: `npm run build` → PASSES (0 errors, 51 routes) · `npm run lint` → 6 pre-existing baseline problems (down from 7 — one incidentally resolved by the STU-03 fix; confirmed via `git stash` diff that none were introduced by this session) · `npx tsc --noEmit` → clean.

### 2026-06-25 — Destructive QA Audit + 7 Critical Fixes ✅

**CLAUDE.md**: Refactored from 902 lines to ~150 lines (compressed all session logs).

**Security Fixes (CRITICAL)**
- C1: `GET /api/questions` — students now get `getQuestionsForStudent()` (strips correctAnswer, explanation, isCorrect). Was serving full question data to students.
- C2: Admin approve/reject buttons — now call `PUT /api/exams/[id]` before updating local state. Were fake UI-only state changes.
- C3: `POST /api/attempts/[id]/submit` — trustScore removed from schema (was accepted from client body). Now calculated server-side: `Math.max(0, 100 - violationCount * 15)`.
- C4: `PUT /api/attempts/[id]` — students blocked from PUT (could manipulate their own trustScore/violationCount).
- C5: Submit route — examId in body now verified against attempt.examId.

**Security Fixes (HIGH)**
- H1: `POST /api/attempts` — added role check, only students may create attempts.
- H2: `GET /api/violations` — students scoped to own ID; teachers scoped to institution boundary.
- H3: `deleteQuestion` / `updateQuestion` — ownership check added (only exam's teacher or admin may mutate).
- H4: All 3 settings pages + admin/page.tsx — replaced hardcoded "University of Technology" with real `getMyInstitution()` call.

**Scoring Fix (CRITICAL)**
- MCQ/true_false answers were **always scored wrong**: student sends option ID but scoring compared vs option text. Fixed: now checks `option.isCorrect` flag by ID lookup.
- MRQ: now compares selected option IDs against correct option IDs (not texts).
- Ordering: maps student option IDs to texts before comparing against `correctAnswer` texts.

**Feature Fixes**
- FIX 1 — Notifications: Added `GET /api/notifications` (derives from real DB: violations, pending exams, accepted invites). DashboardShell now polls every 30s instead of showing hardcoded mock data.
- FIX 2 — File uploads: Added `.doc` and `.md` to `ALLOWED_EXTENSIONS`; default allowed types updated to include all 5 requested types.
- FIX 3 — Scoring engine: See above (critical scoring bug).
- FIX 4 — Teacher results auto-refresh: Results page now polls every 15s.
- FIX 5 — FaceDetector: Changed `end-4` to `right-4` for explicit bottom-right positioning.
- FIX 6 — Eye button detail panel: Full violations timeline with severity badges + scrollable list.
- FIX 7 — DB gaps: Removed all hardcoded `inst-1`/`teacher-1` IDs from app pages; wired exam share modal `sendBulk`/`sendIndividual` to `POST /api/invites`.
- Missing import: `forbidden` added to `api/attempts/[id]/route.ts` import.

**Build status**: `npm run build` → PASSES (0 errors, 50 routes) · `npm run lint` → PASSES (0 errors, 0 warnings)

---

## Current Status
- **Classes + password-reset rework + admin deactivation** ✅ **COMPLETE** (2026-07-14) — `Class`/`ClassInvite`/`ClassEnrollment` models with per-class bulk student invites (reusing the existing `InviteToken` accept-flow pattern), teacher roster removal, institution-admin account deactivation (cascades to archiving the teacher's classes), RLS on all 3 new tables, and password reset moved to `/auth/forgot-password`+`/auth/reset-password` with per-email rate limiting and explicit expired-link states. See Session Log for the `/api/users/me` suspension-bypass bug found and fixed along the way.
- **Phase 1** ✅ — Full mock UI across all 3 dashboards (2026-06-21)
- **Phase 2** ✅ — Supabase Auth + Prisma DB + all API routes wired to real data (2026-06-25, commit `1cfda61`)
- **Phase 2 hardening** ✅ **COMPLETE** — every P0/P1 finding from the 2026-07-03 QA audit is now fixed, independently verified against live prod DB, and either shipped or explicitly resolved with user sign-off (2026-07-06, see Session Log, both rounds). Cross-tenant IDOR gaps closed (SEC-01–04), exam time-window enforced server-side (SEC-07/STU-01/TIME-02), silent score truncation fixed (SCR-05), all mutating routes return clean JSON on malformed input (ERR-01/02), the 2 real production rows affected by the pre-06-25 scoring bug were recalculated and logged in `CORRECTIONS.md` (DAT-01), the per-question-marks-lost-on-reload bug is fixed (STU-03), a full per-student answer review pane now exists for teachers (TCH-03), and the `resultsPublishedAt` API-contract nit is fixed. Nothing from that audit remains open except the camera-widget overlap (user checking it themselves in a real browser — not code) and RLS/SEC-08 (accepted as a known risk, see below).
- **Phase 3** ✅ **IMPLEMENTED** (2026-07-11) — real proctoring signals (MediaPipe/COCO-SSD/VAD, events-only), Realtime live monitoring with teacher actions, async AI item generation, AI-assisted grading with mandatory teacher confirmation (Judge0 for code), and real psychometrics (Python service). See the 2026-07-11 Session Log entry and `docs/phase3/IMPLEMENTATION_PROGRESS.md`. Live end-to-end QA deferred (session network blocked pg egress); deploy steps: set `ANTHROPIC_API_KEY` on Vercel, optionally stand up Judge0 + the psychometrics service.
- **Post-Phase-2 gap-analysis pass (`requirements.md`'s 9 items)** ✅ **COMPLETE** (2026-07-09) — Student UI & time controls (items 1–4: pre-exam instructions, availability-vs-duration auto-submit, per-item timers, proctoring toggle), Item Bank RBAC + AI-generation decoupling (items 5–6), CLO-aware batch AI generation (item 7), stratified dynamic pooling (item 8), and multi-section exam architecture (item 9) are all implemented, unit-tested, and independently live-QA'd against the real dev server + live DB. See Session Log for full detail on each item, including the judgment calls made where the spec was silent (especially item 9's teacher-facing section-threshold-failure display and item 8's teacher-facing pooled-question review).

**Pending manual action**: Supabase dashboard → Authentication → URL Configuration → set Site URL to `https://exam-system-sigma.vercel.app` and add it to Additional Redirect URLs (without this, invite emails redirect to localhost).

**Known Accepted Risk**: no database-level RLS (SEC-08) — app-layer checks are the sole enforcement mechanism. Accepted by the user 2026-07-06; revisit after Phase 3's shape settles. See Session Log for detail.

---

## Build Status
- `npm run build` → **PASSES** (0 errors, 74 routes)
- `npm run lint` → 4 pre-existing baseline problems (3 errors/1 warning in `useExamTimer.ts`, `invite/[token]/page.tsx`, `exam/[examId]/page.tsx` — predate this session, confirmed via `git stash` diff)
- `npx tsc --noEmit` → clean
- `npx vitest run` → 120/120 passing (+ `pytest` 10/10 in `psychometrics/`)
- Last verified: 2026-07-14 (Classes/ClassInvite/ClassEnrollment, password-reset rework, admin deactivation)
- Last verified: 2026-07-11 (Phase 3 implementation, all tracks)
- Last verified: 2026-07-09 (multi-section exam architecture, item 9, final item of the gap-analysis pass)
- Last verified: 2026-07-06 (QA_RESULTS.md priority fix pass, both rounds)
- Live: https://exam-system-sigma.vercel.app

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router, TypeScript strict |
| Styling | Tailwind CSS v4 (no `tailwind.config.ts`) |
| UI Components | shadcn/ui (manual, no CLI) |
| State | Zustand (`useExamStore`, `useProctoringStore`) |
| Forms | react-hook-form + Zod v4 |
| i18n | next-intl v4 (cookie-based, NOT URL-based) |
| Charts | recharts |
| Auth | Supabase Auth (`@supabase/ssr`) |
| Database | Prisma v7 + `@prisma/adapter-pg` → Supabase PostgreSQL |

---

## Critical Rules (DO NOT BREAK)

### Tailwind v4
- No `tailwind.config.ts` — it breaks v4. CSS variables live in `globals.css` inside `:root {}` / `@theme {}`.
- Use logical CSS everywhere: `ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-` (RTL support).

### DashboardShell Padding
- Shell `<main>` provides `px-4 py-6 sm:px-6 lg:px-8`. Pages must NOT add outer padding.
- Pages use only `space-y-6` at root level.

### Data Layer
- `components → src/lib/data/* ('use server' + Prisma) → Supabase PostgreSQL`
- Components never import from `mock-data` directly. All `lib/data` functions are `async`.
- `institutionId` / `teacherId` / `authorId` / `studentId` always resolved from Supabase JWT, never from request body.

### React Compiler ESLint Rules (strict)
- `purity`: No `Math.random()`, `Date.now()` during render — use `useEffect`.
- `immutability`: No `localStorage` or `document.cookie` writes inside component bodies — extract outside.
- `set-state-in-effect`: No `setState()` synchronously in `useEffect` — use lazy `useState(() => {...})`.
- `refs`: No `ref.current = value` during render — wrap in `useEffect`.
- `incompatible-library`: Don't use `react-hook-form`'s `watch()` — use controlled state + `register`.

### Badge / Status Colors
- Variants: `default | secondary | destructive | outline | success | warning | danger | info`
- `draft`→`outline`, `scheduled`→`info`, `live`→`danger`+animate-pulse dot, `completed`→`secondary`
- Difficulty: `easy`→`success`, `medium`→`warning`, `hard`→`danger`
- Avatar: Teacher `#1E88E5`, Admin `#7C3AED`, Student `#16A34A`

---

## Route Map

### Public
| Route | Description |
|---|---|
| `/` | Landing page |
| `/login` | Supabase auth login |
| `/register` | Institution admin registration |
| `/invite/[token]` | Invite acceptance page |
| `/invite/setup` | Name entry for newly invited users |
| `/auth/callback` | Supabase OAuth / magic-link handler |
| `/auth/forgot-password` | Request a password reset email |
| `/auth/reset-password` | Set a new password (valid recovery session only) |
| `/classes/join/[token]` | Class invite acceptance page |

### Exam-Taking (no dashboard shell, desktop-only)
| Route | Description |
|---|---|
| `/exam/[examId]` | Live exam: timer, proctoring, question nav |
| `/exam/[examId]/complete` | Submission confirmation + trust score |

### Admin (`/admin/*`)
`/admin` · `/admin/teachers` · `/admin/exams` · `/admin/items` · `/admin/analytics` · `/admin/settings` · `/admin/institutions` · `/admin/users` · `/admin/curriculum`

### Teacher (`/teacher/*`)
`/teacher` · `/teacher/exams` · `/teacher/exams/new` · `/teacher/exams/[id]/edit` · `/teacher/exams/[id]/monitor` · `/teacher/exams/[id]/results` · `/teacher/items` · `/teacher/items/new` · `/teacher/classes` · `/teacher/classes/[id]` · `/teacher/monitor` · `/teacher/students` · `/teacher/analytics` · `/teacher/settings`

### Student (`/student/*`)
`/student` · `/student/exams` · `/student/results` · `/student/settings`

### API Routes (all require Supabase JWT via `getAuthUser()`)
| Route | Method | Description |
|---|---|---|
| `/api/exams` | GET, POST | List / create exams |
| `/api/exams/[id]` | GET, PUT, DELETE | Single exam CRUD |
| `/api/exams/[id]/publish-results` | PATCH | Set `resultsPublishedAt` |
| `/api/questions` | GET, POST | List / create; students get sanitized via `getQuestionsForStudent()` |
| `/api/attempts` | GET, POST | Start / resume attempt (students only for POST) |
| `/api/attempts/[id]` | GET, PUT | Single attempt; PUT blocked for students |
| `/api/attempts/[id]/submit` | POST | Score + persist all answers; trustScore calculated server-side |
| `/api/violations` | GET, POST | Log / fetch violations; scoped to institution |
| `/api/analytics` | GET | Analytics data |
| `/api/notifications` | GET | Real notifications derived from DB (violations, pending exams, invites); polled every 30s |
| `/api/invites` | POST | Send Supabase invite email |
| `/api/invites/token/[token]` | GET | Validate invite token (public) |
| `/api/auth/forgot-password` | POST | Request password reset (rate-limited per email, public) |
| `/api/classes` | GET, POST | List / create classes (teacher; admin sees institution-wide) |
| `/api/classes/[classId]` | GET, PATCH | Single class; rename / archive |
| `/api/classes/[classId]/enrollments` | GET | List a class's roster |
| `/api/classes/[classId]/enrollments/[studentId]` | DELETE | Remove a student from a class (enrollment only, not the account) |
| `/api/classes/[classId]/invites` | GET, POST | List / bulk-send class invites |
| `/api/class-invites/token/[token]` | GET | Validate a class invite token (public) |
| `/api/class-invites/accept/[token]` | POST | Accept a class invite — creates the account if new, else requires the caller already be signed in as that account (public) |
| `/api/users/[userId]` | PATCH | Admin deactivate/reactivate a teacher or student in their own institution |
| `/api/users/me` | GET, PATCH | Current user profile |
| `/api/upload` | POST | Supabase Storage upload (bucket: `exam-uploads`); accepts pdf, doc, docx, md, txt, etc. |
| `/api/ai/generate-questions` | POST | Async AI generation → 202 {jobId} (real Claude or mock fallback) |
| `/api/ai/jobs/[jobId]` | GET | Generation job status polling |
| `/api/grading/answers/[answerId]` | POST | Teacher confirm/override/regrade an AI-graded answer |
| `/api/monitor/directives` | GET, POST | Teacher monitor actions (snapshot/warning/force-submit) + student fallback poll |
| `/api/monitor/directives/[id]` | PATCH | Student fulfils a directive |
| `/api/monitor/force-finalize` | POST | Server-side finalization of a dead attempt |
| `/api/evidence` | GET | Signed URL for violation/directive evidence (teacher-scoped) |
| `/api/psychometrics/recompute` | POST | On-demand stat run for one exam |
| `/api/cron/purge-evidence` | GET | Daily 30-day evidence retention purge |
| `/api/cron/psychometrics` | GET | Nightly stats sweep |

---

## Phase 3 Status — IMPLEMENTED 2026-07-11 ✅
All five areas from Haris's kickoff list are implemented (see the 2026-07-11 Session Log entry and `docs/phase3/IMPLEMENTATION_PROGRESS.md`):
- **AI creation of exam** → async, quota-capped, dedup-checked item generation into banks (real Claude when `ANTHROPIC_API_KEY` set, mock fallback otherwise)
- **AI grading of essay/coding by Claude** → suggestion + mandatory teacher confirmation; Judge0 sandbox for code execution
- **Face / double-face / tab-switch / background-noise / abnormal-gaze / prohibited-object detection** → real client-side models (MediaPipe + COCO-SSD + VAD), episode-based, events-only (no raw media)
- **Live real-time monitoring by teacher** → Supabase Realtime + on-demand snapshots + warnings + force-submit
- **Real psychometric stats** → `psychometrics/` FastAPI service, per-administration versioned stats, real FI/DI in the bank

Deferred (tracked in IMPLEMENTATION_PROGRESS.md): live end-to-end QA (network blocked pg egress this session), grading-queue badges on results table, per-administration stats drill-down UI, Web Push, camera-widget overlap human check (`QA_MANUAL.md`).

---

## Environment Variables (Vercel)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
NEXT_PUBLIC_APP_URL=https://exam-system-sigma.vercel.app
DATABASE_URL          # pgBouncer — port 6543
DIRECT_URL            # direct connection — port 5432 (used by prisma db push)
ANTHROPIC_API_KEY     # Phase 3 — enables real AI generation + grading (mock/manual fallback without it)
AI_MODEL              # optional — overrides the default claude-sonnet-5 for generation/grading
CRON_SECRET           # optional — protects /api/cron/* routes (Vercel sends it automatically when set)
JUDGE0_API_URL        # hosted pay-per-use Judge0 (judge0.com Shared Cloud, e.g. https://judge0-ce.p.sulu.sh); unset = coding graded manually
JUDGE0_API_KEY        # key for the hosted Judge0 API
PSYCHOMETRICS_SECRET  # optional shared secret for the internal psychometrics function (X-Service-Key)
```
