# ExamPro — AI-Proctored E-Testing Platform

## Session Log

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
- **Phase 1** ✅ — Full mock UI across all 3 dashboards (2026-06-21)
- **Phase 2** ✅ — Supabase Auth + Prisma DB + all API routes wired to real data (2026-06-25, commit `1cfda61`)
- **Phase 2 hardening** ✅ **COMPLETE** — every P0/P1 finding from the 2026-07-03 QA audit is now fixed, independently verified against live prod DB, and either shipped or explicitly resolved with user sign-off (2026-07-06, see Session Log, both rounds). Cross-tenant IDOR gaps closed (SEC-01–04), exam time-window enforced server-side (SEC-07/STU-01/TIME-02), silent score truncation fixed (SCR-05), all mutating routes return clean JSON on malformed input (ERR-01/02), the 2 real production rows affected by the pre-06-25 scoring bug were recalculated and logged in `CORRECTIONS.md` (DAT-01), the per-question-marks-lost-on-reload bug is fixed (STU-03), a full per-student answer review pane now exists for teachers (TCH-03), and the `resultsPublishedAt` API-contract nit is fixed. Nothing from that audit remains open except the camera-widget overlap (user checking it themselves in a real browser — not code) and RLS/SEC-08 (accepted as a known risk, see below).
- **Phase 3** — Not started yet, explicitly held pending a separate kickoff from the user. Next: AI grading, face detection, Supabase Realtime, psychometrics (see Phase 3 Next Steps below).

**Pending manual action**: Supabase dashboard → Authentication → URL Configuration → set Site URL to `https://exam-system-sigma.vercel.app` and add it to Additional Redirect URLs (without this, invite emails redirect to localhost).

**Known Accepted Risk**: no database-level RLS (SEC-08) — app-layer checks are the sole enforcement mechanism. Accepted by the user 2026-07-06; revisit after Phase 3's shape settles. See Session Log for detail.

---

## Build Status
- `npm run build` → **PASSES** (0 errors, 51 routes)
- `npm run lint` → 6 pre-existing baseline problems (3 errors/3 warnings in `useExamTimer.ts`, `invite/[token]/page.tsx`, etc. — predate this session, confirmed via `git stash` diff, not introduced by any fix here)
- `npx tsc --noEmit` → clean
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

### Exam-Taking (no dashboard shell, desktop-only)
| Route | Description |
|---|---|
| `/exam/[examId]` | Live exam: timer, proctoring, question nav |
| `/exam/[examId]/complete` | Submission confirmation + trust score |

### Admin (`/admin/*`)
`/admin` · `/admin/teachers` · `/admin/exams` · `/admin/items` · `/admin/analytics` · `/admin/settings` · `/admin/institutions` · `/admin/users` · `/admin/curriculum`

### Teacher (`/teacher/*`)
`/teacher` · `/teacher/exams` · `/teacher/exams/new` · `/teacher/exams/[id]/edit` · `/teacher/exams/[id]/monitor` · `/teacher/exams/[id]/results` · `/teacher/items` · `/teacher/items/new` · `/teacher/monitor` · `/teacher/students` · `/teacher/analytics` · `/teacher/settings`

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
| `/api/users/me` | GET, PATCH | Current user profile |
| `/api/upload` | POST | Supabase Storage upload (bucket: `exam-uploads`); accepts pdf, doc, docx, md, txt, etc. |
| `/api/ai/generate-questions` | POST | AI question generation (mock) |

---

## Phase 3 Next Steps
Not started — awaiting a separate kickoff from the user (Phase 2 hardening is fully closed as of 2026-07-06, nothing carried over).
- **AI grading**: `POST /api/grade` via Claude API (`claude-sonnet-4-6`) for essay + coding questions
- **Face detection**: replace `FaceDetector.tsx` mock with `face-api.js` (load models from `/public/models/`)
- **Supabase Realtime**: replace 10s polling in `teacher/monitor` with channel subscriptions
- **Trust score**: violation-count formula (`Math.max(0, 100 - violationCount * 15)`) is already computed and persisted server-side in `ExamAttempt.trustScore` on submit (fixed 2026-06-25); this item is about revisiting whether that formula itself is the right one, not about wiring persistence (already done)
- **Psychometrics**: replace random FI%/DI% in `teacher/items` with real answer-based calculation
- **Worth considering alongside Phase 3**: RLS policies for `Question`/`ExamAttempt`/`Answer`/`Exam` (currently an accepted risk, see Current Status), and a human check of the camera-widget/Submit-button overlap (`QA_MANUAL.md`)

---

## Demo Accounts (Supabase Auth)
| Role | Email | Password |
|---|---|---|
| Admin | admin@demo.exampro.com | Demo@1234 |
| Teacher | teacher@demo.exampro.com | Demo@1234 |
| Student | student@demo.exampro.com | Demo@1234 |

---

## Environment Variables (Vercel)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
NEXT_PUBLIC_APP_URL=https://exam-system-sigma.vercel.app
DATABASE_URL          # pgBouncer — port 6543
DIRECT_URL            # direct connection — port 5432 (used by prisma db push)
ANTHROPIC_API_KEY     # Phase 3 only
```
