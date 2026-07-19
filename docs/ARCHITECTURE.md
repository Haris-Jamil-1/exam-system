# Evalix (formerly ExamPro) — System Architecture

> Audience: a developer or an LLM **without** codebase-access tools who needs to understand
> and safely modify this system. Every path, model, and route name in this document is real
> and current as of 2026-07-19.

Companion docs: [FEATURES.md](./FEATURES.md) (feature inventory) · [../README.md](../README.md)
(user guide) · [CORRECTIONS.md](./CORRECTIONS.md) (production data-correction audit trail).
Historical design docs and per-session progress logs were removed in the 2026-07-19 close-out
and are retrievable from git history.

---

## 1. Tech stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 16, App Router** (`src/app/`), TypeScript strict | No Pages Router anywhere |
| Styling | **Tailwind CSS v4** | **No `tailwind.config.ts`** — v4 breaks with one. Theme lives in `src/app/globals.css` (`:root {}` / `@theme {}`) |
| UI kit | shadcn/ui components, manually vendored in `src/components/ui/` | No shadcn CLI |
| State | Zustand — `src/store/examStore.ts`, `src/store/proctoringStore.ts` | |
| Forms | react-hook-form + Zod v4 | Never use `watch()` (React Compiler lint); use controlled state + `register` |
| i18n | next-intl v4, **cookie-based** (`locale` cookie, `en`/`ar`), not URL-based | `src/i18n/request.ts`, `messages/en.json`, `messages/ar.json`. RTL supported via logical CSS (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`) |
| Charts | recharts | |
| Auth | **Supabase Auth** via `@supabase/ssr` (cookie sessions) | |
| Database | **Supabase PostgreSQL**, accessed by **Prisma v7** with `@prisma/adapter-pg` | Prisma client generated into `src/generated/prisma` (gitignored) |
| Email | **Resend** (`src/lib/resend-client.ts`, lazy singleton) + Supabase's own invite/reset emails | |
| AI | Anthropic API (`@anthropic-ai/sdk`), model `claude-sonnet-5` overridable via `AI_MODEL` env | Mock fallback when `ANTHROPIC_API_KEY` unset |
| Code execution | Hosted Judge0 (pay-per-use, `JUDGE0_API_URL`/`JUDGE0_API_KEY`) | Coding answers graded manually when unset |
| Proctoring ML | Self-hosted, fully client-side: MediaPipe Face Landmarker + COCO-SSD (TensorFlow.js) + WebAudio energy VAD | Model assets in `public/models/` (~23 MB), zero external calls |
| Realtime | Supabase Realtime (Postgres changes + Broadcast channels) | Live monitor refresh, monitor directives, WebRTC signaling |
| Live video | Peer-to-peer WebRTC, STUN-only (`src/lib/webrtc-signaling.ts`) | No SFU/TURN — see §9 Gotchas |
| Psychometrics | **Vercel Python Function** `api/psychometrics/compute.py` (psycopg, pure-Python stats) | Auto-detected via root `requirements.txt` |
| Testing | vitest (`tests/unit/`, 275 tests) · Playwright (`e2e/`, needs a separate test Supabase project) · pytest (`api/psychometrics/test_stats.py`) | |
| Deployment | **Vercel** (`vercel.json`: build command, 2 cron routes) | Live: https://exam-system-sigma.vercel.app |

**How they fit together:** Browser → Next.js middleware (`src/middleware.ts`, session refresh +
role-path gating) → App Router pages (mostly client components calling `fetch('/api/...')`) or
server components → API route handlers in `src/app/api/**` → auth via `getAuthUser()`
(`src/lib/api-auth.ts`) → data functions in `src/lib/data/*` (`'use server'`) → Prisma →
Supabase Postgres. Supabase is used for **Auth**, **Postgres**, **Storage** (private bucket
`exam-uploads`), and **Realtime**. Prisma connects as the table owner, so Postgres RLS
(enabled on a subset of tables) gates only direct PostgREST/Realtime access, not the app.

---

## 2. Directory tree

```
exam-system/
├── CLAUDE.md                     # AI-session project instructions + full session log (dev history)
├── CLEANUP_PROGRESS.md           # 2026-07-19 close-out run log
├── README.md                     # Client-facing platform intro + user guide
├── package.json                  # Scripts: dev, build (prisma generate && next build), test:unit, test:e2e, test:data-integrity
├── next.config.ts                # Minimal — next-intl plugin wiring
├── vercel.json                   # Build config + cron schedules (purge-evidence 03:00, psychometrics 04:00 daily)
├── prisma.config.ts              # Prisma CLI datasource: DIRECT_URL ?? DATABASE_URL, loads .env.local
├── requirements.txt              # Root on purpose: makes Vercel detect the Python function in api/
├── components.json               # shadcn/ui config (style tokens)
├── eslint.config.mjs             # ESLint 9 flat config incl. React Compiler rules (see §8)
├── postcss.config.mjs            # Tailwind v4 postcss plugin
├── playwright.config.ts          # E2e config (TEST_* env vars, separate Supabase project)
├── vitest.config.ts              # Unit test config (node env, tests/unit)
├── tsconfig.json                 # @/* → src/*
│
├── prisma/
│   └── schema.prisma             # THE schema — ~40 models/enums; deployed with `prisma db push` (no migrations dir)
│
├── api/                          # Vercel Python Functions (NOT Next.js routes)
│   └── psychometrics/
│       ├── compute.py            # POST /api/psychometrics/compute — full-exam stat recompute (psycopg, direct SQL)
│       ├── _stats.py             # Pure stat formulas: facility index, corrected point-biserial, alpha, KR-20, distractors
│       └── test_stats.py         # pytest fixtures validating each formula against hand-computed values
│
├── docs/
│   ├── ARCHITECTURE.md           # This file
│   ├── FEATURES.md               # Client-facing feature inventory (tables)
│   └── CORRECTIONS.md            # Audit trail of the 2026-07-06 production data corrections
│
├── messages/
│   ├── en.json / ar.json         # next-intl translation catalogs
│
├── public/
│   ├── hero-proctoring.jpg       # Landing page hero image
│   └── models/                   # Self-hosted proctoring models (MUST stay reachable unauthenticated — see §9)
│       ├── mediapipe/            # face_landmarker.task + wasm/ runtime
│       └── coco-ssd/             # model.json + 5 weight shards
│
├── scripts/
│   ├── mgmt-sql.sh               # Run SQL over the Supabase Management API (HTTPS) when pg ports are blocked
│   ├── qa-data-integrity-audit.ts# Read-only scoring-consistency audit (npm run test:data-integrity)
│   └── backfill-item-banks.ts    # One-time historical backfill (items → "Legacy Items" banks); kept as a record
│
├── e2e/                          # Playwright suite (golden path, IDOR, error handling) — needs TEST_* Supabase project
├── tests/
│   ├── unit/                     # 38 vitest files / 275 tests — pure functions + mocked-Prisma route tests
│   └── fixtures/                 # e2e seed/teardown + non-prod guard
│
└── src/
    ├── middleware.ts             # Session refresh + public-prefix allowlist + role-path gating (see §4)
    ├── i18n/request.ts           # next-intl locale resolution from the `locale` cookie
    ├── types/index.ts            # Shared TS types used by UI pages
    │
    ├── app/
    │   ├── layout.tsx            # Root layout (NextIntlClientProvider, fonts, globals.css)
    │   ├── page.tsx              # Public landing page (bilingual, own inline navbar)
    │   ├── globals.css           # Tailwind v4 theme — ALL design tokens live here
    │   ├── (auth)/               # /login, /register (+ their layout)
    │   ├── auth/                 # /auth/callback (code exchange), /auth/forgot-password, /auth/reset-password
    │   ├── invite/               # /invite/[token] (accept), /invite/setup (name entry)
    │   ├── classes/join/[token]/ # Class-invite accept page (public)
    │   ├── exam/[examId]/        # Exam-taking page (no dashboard shell, desktop-only) + complete/
    │   ├── super/                # /super — platform Super Admin panel (single page)
    │   ├── (dashboard)/          # DashboardShell-wrapped role areas
    │   │   ├── admin/            # 9 pages: overview, teachers, exams, items, item-banks, analytics, settings, institutions, users, curriculum
    │   │   ├── teacher/          # exams (list/new/edit/monitor/results/results-per-student), items (banks), classes, monitor, students, analytics, settings
    │   │   └── student/          # overview, exams, results, settings
    │   └── api/                  # ~40 route handlers — full surface in §6
    │
    ├── components/
    │   ├── ui/                   # shadcn primitives (button, card, dialog, select, tabs, badge, input, password-input, …)
    │   ├── auth/                 # LoginForm, RegisterForm, ForgotPasswordForm, ResetPasswordForm
    │   ├── exam/                 # CodeQuestion, FileUploadQuestion, ItemCountdownBadge (per-item timer)
    │   ├── exams/                # SectionsManager (CRUD sections), BlueprintPoolingPanel (CLO draw matrix)
    │   ├── grading/GradingPanel.tsx      # Teacher confirm/override UI for AI-graded answers
    │   ├── items/AiGeneratePanel.tsx     # "Generate with AI" panel on a bank page
    │   ├── proctoring/           # ProctoringOverlay (orchestrator), FaceDetector, AudioMonitor, TabGuard,
    │   │                         # FullscreenGuard, BiometricOnboarding, DirectiveListener, ViolationAlert,
    │   │                         # WebRTCBroadcaster (student side of live video)
    │   └── shared/               # DashboardShell (nav/session shell), StudentActionsModal (monitor eye-button modal),
    │                             # BulkImportModal, CurriculumPicker, ManageAccessDialog, LanguageToggle,
    │                             # DesktopGuard, PageHeader
    │
    ├── hooks/
    │   ├── useExamTimer.ts       # Countdown seeded from server deadline
    │   ├── useMonitorRealtime.ts # Supabase Realtime subscription w/ polling fallback for monitor pages
    │   ├── useWebRTCViewer.ts    # Teacher side of live video (start/stop/state)
    │   ├── useCurrentUser.ts / useAvatarUpload.ts
    │
    ├── lib/
    │   ├── prisma.ts             # Singleton PrismaClient via @prisma/adapter-pg on DATABASE_URL (pgBouncer 6543)
    │   ├── api-auth.ts           # getAuthUser / getSuperAdmin / withErrorHandling / 401/403/404 helpers
    │   ├── supabase/             # client.ts (browser), server.ts (SSR cookies), admin.ts (service-role)
    │   ├── data/                 # 'use server' data layer — the ONLY place Prisma queries live (see §8)
    │   │   ├── exams.ts, questions.ts, items.ts, item-banks.ts, students.ts, users.ts,
    │   │   ├── classes.ts, invites.ts, invite-guards.ts, curriculum.ts, analytics.ts,
    │   │   ├── violations.ts, sections.ts, pooling.ts, pooling-errors.ts, index.ts (barrel)
    │   ├── ai/
    │   │   ├── claude-generator.ts  # Real Claude item generation; exports AI_MODEL (env-overridable, default claude-sonnet-5)
    │   │   ├── question-generator.ts# Mock generator (no API key fallback)
    │   │   ├── generation-job.ts    # Async job runner (Vercel after()), dedup, quota, CLO stamping
    │   │   ├── grading.ts           # Essay + coding AI grading (rubric snapshots)
    │   │   ├── judge0.ts            # Hosted Judge0 client (test-case execution)
    │   │   ├── quota.ts             # Per-institution monthly AI/Judge0 quota (atomic month rollover)
    │   │   └── constants.ts         # MAX_BATCH_SIZE = 15 (shared client+server)
    │   ├── proctoring/
    │   │   ├── event-buffer.ts   # ProctoringEventBuffer — batches events → POST /api/violations (10s / 20 events / immediate-high; revive() for StrictMode)
    │   │   ├── episodes.ts       # Episode open/close accounting for sustained signals
    │   │   ├── gaze.ts           # Pure gaze heuristics (nose-cheek ratio, iris corners)
    │   │   └── severity.ts       # Severity derivation incl. duration tiers (d>60s → high)
    │   ├── scoring.ts            # Deterministic scoring for all 10 question types + computeSectionScores
    │   ├── trust-score.ts        # Trust score v2 (severity/duration/confidence-weighted, per-type caps)
    │   ├── exam-deadline.ts      # computeSubmissionDeadline / isPastDeadline (min of duration, endTime)
    │   ├── exam-status.ts        # computeEffectiveExamStatus (scheduled→live→completed derived read-time; no cron)
    │   ├── exam-eligibility.ts   # Shared class-scoping rule (getStudentExams + POST /api/attempts)
    │   ├── exam-start-errors.ts  # classifyStartExamResponse / classifySectionStartResponse (client error UX)
    │   ├── grading-status.ts     # isGradingFinalized / canOverrideGrading (only `confirmed` is terminal)
    │   ├── item-bank-permissions.ts # resolveBankPermission — the ONE place bank access is decided
    │   ├── class-permissions.ts  # canManageClass / canRemoveEnrollment / canDeactivateUser / isRateLimited
    │   ├── invite-accept-decision.ts # resolveAcceptInviteAssignment (cross-institution block, suspended-elsewhere allowance)
    │   ├── item-form-schema.ts   # Zod schema for the manual item builder
    │   ├── bulk-email-file-parse.ts # CSV/XLSX email-list parser (shared by both bulk-invite dialogs)
    │   ├── webrtc-signaling.ts   # Channel naming (webrtc:{attemptId}), STUN config, signal types
    │   ├── psychometrics-client.ts # Internal caller of the Python function
    │   ├── resend-client.ts      # Lazy Resend singleton (module-scope construction breaks the build — see file comment)
    │   ├── api-auth.ts, utils.ts
    └── store/
        ├── examStore.ts          # Exam-taking client state
        └── proctoringStore.ts    # Proctoring runtime state
```

---

## 3. Data model (Prisma)

Single source of truth: `prisma/schema.prisma`. **There is no `prisma/migrations/` directory** —
the schema is deployed with `prisma db push` (see §8.4). Prisma CLI reads its connection from
`prisma.config.ts` (`DIRECT_URL ?? DATABASE_URL`), **not** from the schema file.

### 3.1 Tenancy & people

- **`Institution`** — the tenant. Fields: `name`, `domain`, unique `joinCode`, monthly AI quota
  (`aiMonthlyQuota`/`aiUsageCount`/`aiUsageMonth`) and Judge0 quota
  (`judgeMonthlyQuota`/`judgeUsageCount`, sharing `aiUsageMonth` for rollover), and
  `suspendedAt` (soft platform-level suspension). Has many: users, exams, items, courses,
  itemBanks, classes.
- **`User`** — one row per person, linked to Supabase Auth by unique `supabaseId`; unique
  `email` (globally — a user belongs to exactly **one** institution via scalar
  `institutionId`; there is no membership join table). `role` is the RBAC enum
  (`admin | teacher | student`).
  - **`isSuperAdmin` (Boolean) is deliberately NOT a `Role` value.** It is a platform-tier
    flag sitting *above* institution RBAC, set manually via SQL
    (`UPDATE "User" SET "isSuperAdmin" = true WHERE email = '...'`), checked only by
    `getSuperAdmin()` in `src/lib/api-auth.ts` and the `/api/super/*` routes. An institution
    admin cannot grant it and it grants nothing inside institution RBAC.
  - `suspendedAt` — soft user suspension (treated as unauthenticated by `getAuthUser()`).
- **`TeacherStudent`** — legacy direct teacher↔student link (institution-wide roster). Newer
  enrollment goes through Classes; roster queries take the **union** of both.
- **`InviteToken`** — email invite for teacher/student accounts (`token`, `role`,
  `institutionId`, `expiresAt`, `acceptedAt`).
- **`Class`** (teacher-owned, `archivedAt` for soft archive) → **`ClassInvite`**
  (per-class email invite, `ClassInviteStatus pending|accepted|expired`) →
  **`ClassEnrollment`** (`@@unique([classId, studentId])`).
- **`PasswordResetAttempt`** — append-only per-email log backing the 3-per-15-min reset rate
  limit.

### 3.2 Exams & content

- **`Exam`** — belongs to institution + teacher; optional `classId` (**null = visible to all
  of the teacher's TeacherStudent-linked students** — pre-Classes behavior; set = scoped to
  that class's roster). `status` (`draft|scheduled|live|completed` — but read-time effective
  status is derived by `src/lib/exam-status.ts`, no cron flips the DB value),
  `approvalStatus` (admin approval workflow), `startTime`/`endTime`/`duration` (deadline =
  whichever of start+duration or endTime comes first), `instructions`,
  `isProctoringEnabled`, `maxViolations`, `settings` (Json — holds
  `dynamicPoolingBankIds`, `dynamicPoolingBlueprint {cloId: count}`, `isSectionSequential`,
  `isItemSequential`, etc.), `resultsPublishedAt`.
- **`Question`** — a question **on an exam** (copied from bank items, never shared). Two
  crucial nullable FKs:
  - `attemptId`: **null = fixed/shared question every student sees; set = privately
    materialized for exactly one attempt by dynamic pooling.** Any query listing "this
    exam's questions" MUST filter on this or it will mix students' pooled draws
    (see `getQuestions` / `getQuestionsForAttempt` in `src/lib/data/questions.ts`).
  - `sectionId`: null = unsectioned exam.
  - Other: `type` (10-value enum: mcq, mrq, true_false, short_answer, essay, fill_blank,
    matching, ordering, coding, file_upload), `marks`, `correctAnswer` (Json),
    `timeLimitSeconds` (per-item timer), `rubric`/`gradingWeights` (AI grading),
    `sourceItemId` (link back to the bank `Item` for psychometrics), `learningObjectiveId`,
    coding fields (`codeLanguage`, `starterCode`, `testCases`), file-upload fields.
- **`Option`** — MCQ/MRQ/etc. choices with `isCorrect` (scoring compares option **IDs**, not
  text).
- **`ExamSection`** — title, instructions, optional `durationMinutes` (isolated section
  timer), `orderIndex`, `sectionWeight` (% of composite; server enforces sum=100 at exam
  start), optional `passingThreshold` (0–100; failing it flags the whole attempt Failed even
  if the composite passes).
- **`ExamEnrollment`** — (examId, studentId) enrollment record.

### 3.3 Item bank

- **`ItemBank`** — `bankLevel: institutional | personal`. `ownerId` is the Institution id for
  institutional banks and the creating User id for personal banks.
- **`ItemBankAccess`** — per-user grant (`owner | editor | viewer`). All access decisions go
  through `resolveBankPermission` (`src/lib/item-bank-permissions.ts`); institution admins
  get implicit `owner` on every bank in their institution; cross-institution is a hard deny.
- **`Item`** — the reusable bank item (same content fields as Question, plus `status`
  (`draft|review|approved|archived` — **only `approved` items are drawn by pooling**),
  `tags`, `version`/`previousVersionId`, rolling psychometrics
  (`facilityIndex`/`discriminationIndex`), AI provenance (`generationJobId`, `aiGenerated`,
  `reviewedById`), `bankId`, `learningObjectiveId`).
- **`ItemOption`** — options for bank items.
- **`GenerationJob`** — async AI generation job + audit/cost trail (`status: queued|running|
  succeeded|partial|failed`, `requestedCount`/`producedCount`, `promptParams`, `model`,
  token counts, `error`).

### 3.4 Attempts, answers, grading

- **`ExamAttempt`** — `@@unique([examId, studentId])` (one attempt per student per exam; this
  constraint is also the concurrency arbiter for pooling materialization). `status:
  in_progress | submitted | auto_submitted`, `score`/`totalMarks`/`scorePercentage` (Float —
  fractional partial credit), `trustScore` (0–100), `violationCount`, `biometricVerified`.
- **`SectionAttempt`** — per-section state/score (`@@unique([attemptId, sectionId])`);
  `startedAt` set when the student clicks "Start Section" (seeds the section timer).
- **`Answer`** — `@@unique([attemptId, questionId])`; `response` Json, `fileUrl`,
  `isCorrect`, `marksAwarded` (Float), `gradingStatus` (**null = deterministically scored;
  essay/coding state machine: `pending_ai → ai_suggested → confirmed | overridden`** — only
  `confirmed` is terminal).
- **`AnswerGrading`** — **append-only** grading event log (`kind: ai_suggestion |
  teacher_confirmation | teacher_override`), with `rubricSnapshot` (the exact rubric at
  event time — the dispute trail), `criterionScores`, `executionResult` (coding test runs),
  model/token accounting, `gradedById`. `Answer.marksAwarded` is only ever written by
  teacher events — the AI never auto-confirms.
- **`ItemLock`** — server enforcement for `settings.isItemSequential`
  (`@@unique([attemptId, questionId])`): one lock call per question on advance; second call
  → 403; submit routes prefer the locked `response` over the bulk payload. **There is no
  per-question autosave anywhere else** — answers live client-side until the one bulk
  submit POST (deliberate; explains why dead attempts can only force-finalize to 0).
- **`JudgeUsageLog`** — per-coding-grading Judge0 cost attribution
  (`submissionCount` = test cases run = billing unit; `status: executed | unavailable |
  quota_exceeded | error`).

### 3.5 Proctoring & monitoring

- **`Violation`** — one row per proctoring event/episode: `type` (9-value enum: tab_switch,
  window_blur, fullscreen_exit, no_face, multiple_faces, audio_detected, phone_detected,
  gaze_away, prohibited_object), `severity` (low/medium/high, **re-derived server-side**),
  `confidence`, `endedAt` (episode end), `clientSeq` (per-attempt monotonic counter →
  idempotency + suppressed-batch detection), `screenshotUrl` (evidence snapshot path).
- **`MonitorDirective`** — teacher→student actions (`kind: snapshot | warning |
  force_submit`; `status: pending | fulfilled | failed`; `resultPath` = snapshot storage
  path). Append-only ⇒ doubles as the audit log of teacher monitor actions. Delivered over
  Realtime with polling fallback.
- **`ProctoringHeartbeat`** — one upserted row per attempt (`lastSeq`, `lastSeenAt`), 30s
  cadence; staleness on an in_progress attempt renders as "Disconnected" on the monitor.

### 3.6 Psychometrics & curriculum

- **`ItemAdministrationStat`** — versioned per-(item, exam) stats: `facilityIndex`,
  `discrimination` (corrected point-biserial), `distractorStats`, `insufficientN` (<10
  responses display-gated). Upserted idempotently per compute run.
- **`ExamReliabilityStat`** — per exam: `cronbachAlpha`, `kr20`, `sectionAlphas`, N counts.
- **`Course` → `Topic` → `LearningObjective`** (CLO: `text`, `bloomsLevel` Remember…Create,
  `learningDomain` Knowledge/Skill/Values). CLOs are institution-scoped only **via**
  `topic.course.institutionId` — every CLO consumer must check that chain (a real
  cross-tenant bug was fixed here once already).

### 3.7 Relationship map (text ER)

```
Institution 1─* User, Exam, Item, Course, ItemBank, Class
User (role=teacher) 1─* Exam, Class, Item(author)
User (role=student) 1─* ExamAttempt, ClassEnrollment, Violation
TeacherStudent *─* (User teacher ↔ User student)     [legacy roster path]
Class 1─* ClassInvite, ClassEnrollment; Class 1─* Exam (optional exam.classId)
Exam 1─* Question, ExamSection, ExamAttempt, ExamEnrollment, Violation
ExamSection 1─* Question(sectionId), SectionAttempt
ExamAttempt 1─* Answer, Violation, Question(attemptId=pooled), SectionAttempt,
                ItemLock, MonitorDirective; 1─1 ProctoringHeartbeat
Answer 1─* AnswerGrading
ItemBank 1─* Item, ItemBankAccess, GenerationJob
Item *─1 LearningObjective (optional); Question *─1 LearningObjective (optional)
Question *─1 Item via sourceItemId (psychometrics provenance)
Course 1─* Topic 1─* LearningObjective
ItemAdministrationStat: (itemId, examId) unique — no FK relations (loose coupling)
```

---

## 4. Auth & RBAC

### 4.1 Login & session

- Login page `src/app/(auth)/login/page.tsx` → Supabase Auth password sign-in (browser client
  `src/lib/supabase/client.ts`). Sessions are **cookies** managed by `@supabase/ssr`.
- `src/app/auth/callback/route.ts` handles code exchange (OAuth/magic-link/recovery). It
  honors a **same-site-only** `next` param and redirects failed/expired recovery exchanges to
  `/auth/reset-password?error=expired`.
- After login the client calls `GET /api/users/me` to bootstrap the profile, which is cached
  in `localStorage['exam_user']` (display only — never trusted server-side).

### 4.2 The three auth layers

1. **Middleware** (`src/middleware.ts`) — runs on every request except static assets.
   - `PUBLIC_PREFIXES = ['/', '/login', '/register', '/invite', '/classes/join', '/api',
     '/_next', '/favicon', '/auth', '/models']` plus a static-asset **extension regex**
     (`STATIC_ASSET_RE`) so new `public/` files never need a middleware change. ⚠️ The
     `/models` entry is load-bearing: without it the proctoring model fetches were redirected
     to HTML and all vision detection silently died (fixed 2026-07-18).
   - Validates the JWT via `supabase.auth.getUser()` (**never** `getSession()` — that's
     unauthenticated). Unauthenticated → redirect `/login`.
   - Role-path gating from `user_metadata.role`: admin→`/admin`, teacher→`/teacher`,
     student→`/student` + `/exam`. Wrong prefix → redirect to your own dashboard.
   - `/super` passes through authenticated-only; the real gate is the DB flag (below).
   - Note `/api` is a public *prefix* here — **every API route does its own auth**; the
     middleware never protects APIs.
2. **`getAuthUser()`** (`src/lib/api-auth.ts`) — the canonical per-request server check used
   by every API route and data function: validates the Supabase JWT, loads the Prisma `User`
   by `supabaseId`, and returns `null` if the user is suspended **or** their institution is
   suspended (super admins are exempt from host-institution suspension only). All identity
   fields (`institutionId`, `teacherId`, `studentId`, `authorId`) are **always** resolved
   from this — never from a request body.
3. **Per-query scoping** — every `src/lib/data/*` function and route filters by
   `institutionId` (and ownership where relevant). This is the primary tenant-isolation
   mechanism (see the RLS caveat below).

### 4.3 Super Admin

`getSuperAdmin()` = `getAuthUser()` + `isSuperAdmin === true`. Used by `/super` page data and
`/api/super/*` (overview, per-institution users, suspend/unsuspend). Deliberately outside
role RBAC — see §3.1.

### 4.4 Row-Level Security (what exists and what doesn't)

**RLS is enabled on exactly 7 tables**, all SELECT-only for the `authenticated` role, added
to safely gate **Supabase Realtime/PostgREST reads** (Prisma connects as table owner and
bypasses non-FORCE RLS):

- `Violation`, `ExamAttempt`, `ProctoringHeartbeat`, `MonitorDirective` (2026-07-11) —
  student sees own rows; teacher/admin see their institution's.
- `ItemBank`, `ItemBankAccess` (2026-07-17) — uses `SECURITY DEFINER` helper functions to
  avoid mutual-recursion between the two tables' policies.
- `ItemLock` (2026-07-17).
- `Class`, `ClassInvite`, `ClassEnrollment` (2026-07-14) — same SELECT-only shape.
- Plus two **Realtime Broadcast Authorization** policies on `realtime.messages`
  (`webrtc_signaling_select` / `webrtc_signaling_insert`) restricting `webrtc:{attemptId}`
  channels to the attempt's own student or a teacher/admin in the same institution.

**Everything else (`Exam`, `Question`, `Answer`, `User`, `Item`, `ExamSection`,
`SectionAttempt`, …) has NO RLS** — app-layer checks are the sole enforcement. This is the
standing **SEC-08 accepted risk** (user sign-off 2026-07-06). Consequence for future work: a
new route/data function that forgets an institution check has no database backstop — treat
scoping as mandatory in review. RLS policies were applied live via `scripts/mgmt-sql.sh`
(they are **not** files in this repo; the Supabase project is the source of truth).

---

## 5. Core data-flow walkthroughs

### 5.1 Teacher creates an exam (manual + AI path)

1. `/teacher/exams/new` (`src/app/(dashboard)/teacher/exams/new/page.tsx`) — 3-step wizard:
   **Basic Info** (title, subject, times, duration, instructions, optional Class from
   `GET /api/classes`) → **Select Questions** (cross-bank picker over accessible banks) →
   **Settings** (proctoring toggle, sequential toggles, `BlueprintPoolingPanel` for dynamic
   pooling: pick banks → per-CLO draw counts, stored in
   `settings.dynamicPoolingBankIds/dynamicPoolingBlueprint`).
2. Submit → `POST /api/exams` → `createExam` in `src/lib/data/exams.ts` (teacherId +
   institutionId from JWT). Fixed-pick questions are **copied** from `Item`+`ItemOption`
   into `Question`+`Option` with `sourceItemId` stamped.
3. Editing: `/teacher/exams/[examId]/edit` → `PUT /api/exams/[examId]`. Sections via
   `SectionsManager` (`src/components/exams/SectionsManager.tsx`) → `src/lib/data/sections.ts`.
   Admin approval: admin pages flip `approvalStatus` via the same PUT.
4. **AI item creation is decoupled from the wizard** — it lives on the bank page:
   `/teacher/items/[bankId]` → `AiGeneratePanel` (CLO via `CurriculumPicker`, quantity ≤
   `MAX_BATCH_SIZE`=15) → `POST /api/ai/generate-questions` (`{itemBankId, count,
   learningObjectiveId?, sourceText?}`; editor+ permission via `resolveBankPermission`;
   CLO institution-chain verified) → 202 `{jobId}` + `GenerationJob` row → background run
   (`src/lib/ai/generation-job.ts` inside Vercel `after()`): quota check
   (`src/lib/ai/quota.ts`, 429 at cap), real Claude call
   (`src/lib/ai/claude-generator.ts`, zod-validated structured output, injection-hardened
   source framing, retry ≤2) **or** mock (`question-generator.ts`, `model:'mock'`) when
   `ANTHROPIC_API_KEY` unset; duplicate detection (30 recent stems in-prompt + pg_trgm >0.6
   → `ai-possible-duplicate` tag); items land as `status:'draft'` with
   `learningObjectiveId` + provenance stamped. Client polls `GET /api/ai/jobs/[jobId]`
   (5-min staleness sweep marks dead jobs failed).
   - Models touched: `GenerationJob`, `Item`, `ItemOption`, `Institution` (quota),
     `ItemBank`/`ItemBankAccess` (permission).

### 5.2 Question pooling / multi-section assembly

- **Pooling (per-student random draws)**: on **brand-new attempt only**, inside the
  `POST /api/attempts` transaction, `materializePooledQuestions`
  (`src/lib/data/pooling.ts`) checks the approved-item count per CLO **before drawing**
  (shortfall → `InsufficientPoolError` from `src/lib/data/pooling-errors.ts` → 409 with
  per-CLO detail, transaction rolls back, no orphan attempt); then per CLO draws `count`
  approved items `ORDER BY RANDOM()` from the blueprint's banks, shuffles, and **copies**
  them into `Question` rows with `attemptId = this attempt` (private per-student set).
  Concurrency: attempt creation uses `create` (not upsert) inside `prisma.$transaction`;
  the `@@unique([examId, studentId])` P2002 is the sole arbiter — the losing request never
  materializes. Resume never re-draws.
- **Sections**: `ExamSection` rows group questions via `Question.sectionId`. Exam start
  rejects a sectioned exam whose `sectionWeight`s don't sum to 100 (400; never blocks
  resume). Per-section timers seed from `SectionAttempt.startedAt`; section deadline =
  `min(sectionStart + durationMinutes, exam.endTime)`. `settings.isSectionSequential` is
  enforced by `POST /api/attempts/[attemptId]/sections/[sectionId]/start` (403 starting
  section N+1 before N submits); resubmission of a section → 409. Composite scoring in
  `computeSectionScores` (`src/lib/scoring.ts`): per-section scaled score × `sectionWeight`,
  each section's `passingThreshold` evaluated independently — a missed threshold flags the
  attempt Failed ("Fail (section)" in results) even at a passing composite.

### 5.3 Student takes an exam

1. Visibility: `/student/exams` → `getStudentExams` (`src/lib/data/exams.ts`) — institution
   + (class roster if `exam.classId` set, else TeacherStudent link) + time-derived status.
2. `/exam/[examId]` (`src/app/exam/[examId]/page.tsx` — the largest page; no dashboard
   shell; `DesktopGuard` blocks mobile). Flow: **biometric gate** (`BiometricOnboarding`,
   live `getUserMedia` preview, face+ID captures; verification is simulated — no real
   face-match backend) → **instructions screen** (consent line; pooled exams show "your
   question set is generated when you start") → **Start Exam** click:
   `POST /api/attempts` → eligibility gate (`src/lib/exam-eligibility.ts` — same rule as
   visibility, 403 otherwise), time-window gate (before start blocked unless teacher went
   live early; after end always blocked), transaction (create attempt + materialize pooled
   questions). Errors are classified client-side by
   `classifyStartExamResponse` (`src/lib/exam-start-errors.ts`) — the Start button stays
   retriable and no session state is written on failure.
3. Questions fetched via `GET /api/questions?examId=...` — students get
   `getQuestionsForStudent()` (strips `correctAnswer`/`explanation`/`isCorrect`); pooled
   exams re-fetch with the attemptId once known (`getQuestionsForAttempt`).
4. Timers: `useExamTimer` seeded from `min(startedAt + duration, endTime)` (server time via
   `GET /api/time`). Per-item `timeLimitSeconds` → `ItemCountdownBadge` (auto-advance +
   permanent nav-back lock at expiry). `isItemSequential` → one
   `POST /api/attempts/[attemptId]/items/[questionId]/lock` per advance (2nd call 403).
5. Submit (one bulk POST — **there is no autosave**): unsectioned →
   `POST /api/attempts/[attemptId]/submit`; sectioned → per-section
   `.../sections/[sectionId]/submit` (last section finalizes the attempt). The server
   recomputes the deadline independently (`src/lib/exam-deadline.ts`) and writes
   `submitted` vs `auto_submitted`; scoring in `src/lib/scoring.ts` (option-ID based;
   locked `ItemLock.response` values override the bulk payload); essay/coding answers
   enter `gradingStatus: pending_ai` with marks unset; trust score computed server-side.
6. Redirect to `/exam/[examId]/complete?attemptId=...` — re-fetches
   `GET /api/attempts/[attemptId]` (`perQuestion` breakdown server-side; survives reload).

### 5.4 Proctoring pipeline

Client (all detection is in-browser; **no raw media ever leaves the machine** except
explicit snapshot evidence):

1. `ProctoringOverlay` (`src/components/proctoring/ProctoringOverlay.tsx`) mounts when
   `exam.isProctoringEnabled` — orchestrates all detectors + `WebRTCBroadcaster` +
   `DirectiveListener`, holds the shared `ProctoringEventBuffer`.
2. Detectors → typed events: `FaceDetector` (MediaPipe Face Landmarker from
   `public/models/mediapipe/` — face count, gaze via `src/lib/proctoring/gaze.ts`
   heuristics; COCO-SSD from `public/models/coco-ssd/` on sampled frames → phone/book
   detection), `AudioMonitor` (WebAudio analyser energy VAD, smoothing 0.2, 2s-quiet
   episode close, 61s max-episode chunking), `TabGuard` (visibilitychange — emits
   **immediately on hide** + 16s escalation; a tab-hide owns the pending blur so
   `window_blur` never duplicates a tab_switch), `FullscreenGuard` (best-effort
   auto-enter + blocking "Fullscreen Required" overlay whose button re-enters inside a
   real user gesture; violation only on real exits).
3. `ProctoringEventBuffer` (`src/lib/proctoring/event-buffer.ts`) batches (10s / 20
   events / immediate for high severity; flushes immediately when the tab is hidden;
   `revive()` guards against React StrictMode's dev remount) →
   `POST /api/violations` (batch): validates attempt **ownership**, re-derives severity
   server-side (`src/lib/proctoring/severity.ts` — duration tiers incl. `d>60s → high`
   for gaze/audio), `clientSeq` idempotency, writes `Violation` rows, recomputes
   `ExamAttempt.trustScore` live (`src/lib/trust-score.ts` — severity/duration/confidence
   weighted with per-type caps).
4. Evidence snapshots (multi-face / phone / sustained no-face only): frame → `POST
   /api/upload` (service-role client → private `exam-uploads` bucket) → path on the
   violation; teacher fetches via `GET /api/evidence` (signed URL, teacher-scoped); 30-day
   purge by `GET /api/cron/purge-evidence`.
5. `ProctoringHeartbeat` upsert every 30s (detector-suppression visibility).

Teacher side (live monitoring):

6. `/teacher/exams/[examId]/monitor` and cross-exam `/teacher/monitor` —
   `useMonitorRealtime` subscribes to Supabase Realtime postgres-changes (RLS-gated) with
   debounced refetch; polling fallback (10s/60s) with a Live/Polling badge. Roster shows
   trust score, violation flags, heartbeat-staleness "Disconnected", needs-attention sort;
   browser `Notification` on high severity when the tab is hidden.
7. Eye button → `StudentActionsModal` (`src/components/shared/StudentActionsModal.tsx`):
   violations timeline, **Snapshot** (`POST /api/monitor/directives` kind=snapshot →
   student's `DirectiveListener` captures a frame → upload → `PATCH
   /api/monitor/directives/[id]` fulfilled), **Warning** banner, **Force submit**
   (directive for live clients; `POST /api/monitor/force-finalize` for dead ones — scores
   0 by design since answers only exist client-side), and **Go Live** — peer-to-peer
   WebRTC: `useWebRTCViewer` (teacher) ↔ `WebRTCBroadcaster` (student, reusing
   FaceDetector's already-open camera stream via `streamRef`), SDP/ICE signaled over the
   RLS-authorized `webrtc:{attemptId}` Realtime Broadcast channel, STUN-only.

### 5.5 Grading (manual + AI)

1. At submit, essay/coding answers → `gradingStatus: 'pending_ai'`; background AI runs
   `src/lib/ai/grading.ts`: essays get per-criterion rubric scores + quoted evidence +
   injection flags; coding runs Judge0 test cases (`src/lib/ai/judge0.ts`; quota via
   `JudgeUsageLog` + institution counters — quota hit ⇒ held for manual grading, never a
   fail) + Claude quality review, combined 70/30 (per-question `gradingWeights`
   override). Result → `AnswerGrading(kind:'ai_suggestion')` + `gradingStatus:
   'ai_suggested'`. **Marks are never auto-awarded.** No Anthropic key / any AI failure ⇒
   answers simply stay pending for manual grading.
2. Teacher reviews on `/teacher/exams/[examId]/results/[studentId]` via `GradingPanel` →
   `POST /api/grading/answers/[answerId]` (`action: confirm | override | regrade`):
   writes the teacher `AnswerGrading` row (with rubric snapshot), sets
   `Answer.marksAwarded`, recomputes the attempt score. A `confirmed` answer is terminal
   (further mutation → 409); an `overridden`-not-yet-confirmed one can still be changed
   (`src/lib/grading-status.ts`).
3. **Bulk approve**: `POST /api/grading/attempts/[attemptId]/bulk-approve` ("Approve All
   (N)") — transitions every `ai_suggested` answer to `confirmed` in one transaction +
   one score recompute; already-`overridden` answers are counted but untouched.

### 5.6 Bulk student invitations & multi-class management

1. `/teacher/classes` (create/list) → `POST /api/classes`; per-class page
   `/teacher/classes/[classId]` (roster from `GET /api/classes/[classId]/enrollments`,
   removal via `DELETE .../enrollments/[studentId]` — enrollment row only, permission via
   `canRemoveEnrollment` in `src/lib/class-permissions.ts`).
2. Invite dialog (paste or CSV/XLSX via `src/lib/bulk-email-file-parse.ts`) → `POST
   /api/classes/[classId]/invites` → `createClassInvites` (`src/lib/data/invites.ts`):
   dedup, cap, structured per-email outcomes, rollback-on-send-failure; cross-institution
   emails blocked by `resolveAcceptInviteAssignment`
   (`src/lib/invite-accept-decision.ts` — active member of another institution = blocked;
   suspended-elsewhere = allowed and old suspension cleared).
3. Accept: `/classes/join/[token]` (public) → validate `GET /api/class-invites/token/
   [token]` → `POST /api/class-invites/accept/[token]`: brand-new email ⇒ Supabase admin
   createUser + Prisma `User` + `ClassEnrollment`; existing same-institution student ⇒
   must be **signed in as that account** (`needs_login` → `/login?redirect=...`), then
   enrolled. Teacher-account invites are the same pattern via `/invite/[token]` +
   `/api/invites/*` (admin bulk teacher invite on `/admin/teachers` →
   `createBulkTeacherInvites`).
4. Roster/visibility everywhere = **union of `TeacherStudent` and `ClassEnrollment`**
   (`getStudents`, dashboard stats).

### 5.7 Password reset

1. `/auth/forgot-password` → `POST /api/auth/forgot-password`: per-email rate limit
   (3/15min via `PasswordResetAttempt` + `isRateLimited` in
   `src/lib/class-permissions.ts`) → server-side
   `supabase.auth.resetPasswordForEmail` (server-side so the limit is enforceable).
2. Email link → `/auth/callback` (code exchange; failure ⇒
   `/auth/reset-password?error=expired`) → `/auth/reset-password` (valid recovery
   session) → `supabase.auth.updateUser({password})`.

### 5.8 Super Admin panel

`/super` (`src/app/super/page.tsx`) — middleware lets any authenticated user reach the
page; every `/api/super/*` route gates on `getSuperAdmin()` (DB flag). Provides:
- `GET /api/super/overview` — all institutions with teacher/student/active-exam counts,
  monthly AI + Judge0 usage with env-tunable cost estimates
  (`JUDGE0_COST_PER_SUBMISSION` default $0.0005, `AI_COST_PER_CALL` default $0.02).
- `GET /api/super/institutions/[institutionId]/users` — per-institution user list.
- `POST /api/super/suspend` — soft suspend/unsuspend an institution or user
  (`suspendedAt` flag; enforced globally by `getAuthUser()`; supers can't suspend supers).

---

## 6. API surface

All routes live under `src/app/api/**/route.ts`. Every route authenticates itself via
`getAuthUser()` (middleware does not protect `/api`). Mutating routes are wrapped in
`withErrorHandling()` (malformed body → clean 400 JSON). "Auth" below = minimum caller.

| Method(s) | Path | Purpose / key I/O | Auth |
|---|---|---|---|
| GET, POST | `/api/exams` | List (role-scoped, effective status derived) / create exam | teacher/admin (GET also student-scoped) |
| GET, PUT, DELETE | `/api/exams/[examId]` | Single exam CRUD; institution+ownership checked; admin approve/reject via PUT | owner teacher / same-institution admin |
| PATCH | `/api/exams/[examId]/publish-results` | Set `resultsPublishedAt` | owner teacher/admin |
| GET, POST | `/api/questions` | `?examId=` list — students get sanitized `getQuestionsForStudent()`; POST adds a question (ownership-checked) | authed; POST teacher/admin |
| GET, POST | `/api/attempts` | GET: list own/scoped. POST (students only): start-or-resume — eligibility gate, time window, weight-sum check, pooling transaction. Errors: 403 ineligible, 409 `insufficient_pool`, 400 `invalid_section_weights` | student (POST) |
| GET, PUT | `/api/attempts/[attemptId]` | GET incl. `perQuestion` breakdown; PUT blocked for students | owner student (GET) / teacher-admin |
| POST | `/api/attempts/[attemptId]/submit` | Bulk answer write + deterministic scoring + deadline classification (`submitted`/`auto_submitted`) + AI-grading enqueue | owner student |
| POST | `/api/attempts/[attemptId]/sections/[sectionId]/start` | Start/resume one section timer; sequential lock (403), resubmit (409) | owner student |
| POST | `/api/attempts/[attemptId]/sections/[sectionId]/submit` | Score one section; finalizes attempt on last section (composite + thresholds) | owner student |
| POST | `/api/attempts/[attemptId]/items/[questionId]/lock` | `isItemSequential` lock; 2nd call → 403 | owner student |
| GET, POST | `/api/violations` | POST: batched proctoring events (ownership, severity re-derivation, clientSeq idempotency, trust recompute). GET: student=own, teacher/admin=institution | authed |
| GET | `/api/analytics` | Role-scoped analytics aggregates | authed |
| GET | `/api/notifications` | Derived notifications (violations, pending exams, invites); polled 30s | authed |
| POST | `/api/invites` | Send account invite email (institution-scoped; cross-institution blocked) | teacher/admin |
| GET | `/api/invites/token/[token]` | Validate invite token | public |
| POST | `/api/invites/accept/[token]` | Accept account invite (creates/links Supabase+Prisma user, sets role+institution) | public |
| POST | `/api/auth/forgot-password` | Rate-limited reset email (3/15min/email) | public |
| POST | `/api/auth/register` | Institution-admin self-registration (new institution) | public |
| GET, POST | `/api/classes` | List/create classes (admin sees institution-wide) | teacher/admin |
| GET, PATCH | `/api/classes/[classId]` | Detail / rename / archive | owner teacher / admin |
| GET | `/api/classes/[classId]/enrollments` | Roster | owner teacher / admin |
| DELETE | `/api/classes/[classId]/enrollments/[studentId]` | Remove enrollment (not the account) | `canRemoveEnrollment` |
| GET, POST | `/api/classes/[classId]/invites` | List / bulk-send class invites | owner teacher / admin |
| GET | `/api/class-invites/token/[token]` | Validate class invite | public |
| POST | `/api/class-invites/accept/[token]` | Accept class invite (create account or enroll signed-in student) | public |
| PATCH | `/api/users/[userId]` | Admin deactivate/reactivate in own institution (`canDeactivateUser`: never another admin/super/self; archives teacher's classes) | admin |
| GET, PATCH | `/api/users/me` | Profile bootstrap / update (routes through `getAuthUser()` so suspension bites) | authed |
| POST | `/api/upload` | File upload to private `exam-uploads` bucket (service-role client) | authed |
| POST | `/api/extract-text` | Extract text from uploaded PDF/DOCX (pdf-parse, mammoth) for AI source material | teacher/admin |
| POST | `/api/ai/generate-questions` | Async item generation → 202 `{jobId}` (editor+ on bank, count ≤ 15, quota) | teacher/admin |
| GET | `/api/ai/jobs/[jobId]` | Poll generation job status | requester |
| GET, POST / PATCH, DELETE | `/api/item-banks/[bankId]/collaborators`, `.../[userId]` | List/grant/change/revoke bank access (owner/admin, same institution only) | via `resolveBankPermission` |
| POST | `/api/grading/answers/[answerId]` | Teacher confirm/override/regrade (409 once `confirmed`) | teacher/admin, institution-scoped |
| POST | `/api/grading/attempts/[attemptId]/bulk-approve` | Approve all `ai_suggested` answers in one transaction | teacher/admin |
| GET, POST | `/api/monitor/directives` | POST teacher action (snapshot/warning/force_submit); GET student fallback poll | teacher (POST) / owner student (GET) |
| PATCH | `/api/monitor/directives/[directiveId]` | Student fulfils a directive (e.g. snapshot path) | owner student |
| POST | `/api/monitor/force-finalize` | Finalize a dead attempt (scores 0 — no server-side answers exist) | teacher/admin |
| GET | `/api/evidence` | Signed URL for evidence file | teacher/admin, institution-scoped |
| POST | `/api/psychometrics/recompute` | On-demand stat run for one exam (calls the Python fn) | teacher/admin |
| GET | `/api/cron/psychometrics` | Nightly sweep (04:00 UTC) | `CRON_SECRET` |
| GET | `/api/cron/purge-evidence` | 30-day evidence purge (03:00 UTC) | `CRON_SECRET` |
| GET | `/api/super/overview` | Institutions + usage/cost overview | super admin |
| GET | `/api/super/institutions/[institutionId]/users` | Institution user list | super admin |
| POST | `/api/super/suspend` | Suspend/unsuspend institution or user | super admin |
| GET | `/api/time` | Server clock (client timer offset) | public |
| POST | `/api/psychometrics/compute` | **Python function** (`api/psychometrics/compute.py`) — internal, `X-Service-Key` when `PSYCHOMETRICS_SECRET` set | internal |

---

## 7. Environment variables

| Var | Purpose | Used in |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | supabase clients, middleware |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public (anon) key | browser/SSR clients, middleware |
| `SUPABASE_SECRET_KEY` | Service-role key (server only) | `src/lib/supabase/admin.ts` (uploads, invite createUser, evidence) |
| `DATABASE_URL` | Postgres via pgBouncer (port **6543**) — what the app always uses | `src/lib/prisma.ts`, Python fn |
| `DIRECT_URL` | Direct Postgres (port **5432**) — Prisma CLI (`db push`) only | `prisma.config.ts` |
| `NEXT_PUBLIC_APP_URL` | Canonical app URL (invite links, redirects) | invite/email flows |
| `ANTHROPIC_API_KEY` | Enables real AI generation + grading (unset ⇒ mock generation, manual grading) | `src/lib/ai/*` |
| `AI_MODEL` | Override the default `claude-sonnet-5` | `src/lib/ai/claude-generator.ts` |
| `RESEND_API_KEY` | Resend email sending (invites) | `src/lib/resend-client.ts` |
| `JUDGE0_API_URL` / `JUDGE0_API_KEY` | Hosted Judge0 (unset ⇒ coding graded manually) | `src/lib/ai/judge0.ts` |
| `CRON_SECRET` | Protects `/api/cron/*` (Vercel sends it automatically) | cron routes |
| `PSYCHOMETRICS_SECRET` | Optional shared secret for the Python fn (`X-Service-Key`) | `api/psychometrics/compute.py`, `src/lib/psychometrics-client.ts` |
| `AI_COST_PER_CALL` / `JUDGE0_COST_PER_SUBMISSION` | Cost estimates on the Super Admin panel (defaults $0.02 / $0.0005) | `/api/super/overview` |
| `TEST_*` (`TEST_SUPABASE_URL`, `TEST_SUPABASE_SECRET_KEY`, `TEST_SUPABASE_ANON_KEY`, `TEST_DATABASE_URL`, `TEST_DIRECT_URL`, `TEST_BASE_URL`, `TEST_PORT`, `TEST_REUSE_EXISTING_SERVER`) | Playwright e2e — a **separate** Supabase project (see §8.5) | `playwright.config.ts`, `e2e/`, `tests/fixtures/` |
| `QA_PREFIX` / `QA_ALLOW_PROD_OVERRIDE` | Guard rails for QA fixture scripts | `tests/fixtures/guard-non-prod.ts` |

---

## 8. Conventions (how to work in this codebase)

### 8.1 Layering & naming

- **Data flow**: `components → src/lib/data/* ('use server' + Prisma) → Postgres`. UI pages
  are mostly client components that either call `/api/*` with `fetch` or import data
  functions via the `src/lib/data/index.ts` barrel. **Prisma queries only ever live in
  `src/lib/data/*` or API routes** — never in components.
- **Identity comes from the JWT**: `institutionId`/`teacherId`/`studentId`/`authorId` always
  resolve from `getAuthUser()` — accepting them from a request body is a security bug here.
- **Pure decision logic goes in `src/lib/*.ts`** as plain exported functions
  (`exam-eligibility.ts`, `grading-status.ts`, `invite-accept-decision.ts`, …) tested with
  plain vitest. This repo deliberately has **no React-component test toolchain** (no RTL/
  jsdom) — testable logic is extracted, components stay thin.
- Thrown `Error` subclasses must NOT be exported from a `'use server'` file (invalid Server
  Action export — breaks the build). Put them in a sibling file
  (see `pooling-errors.ts` next to `pooling.ts`).

### 8.2 UI rules

- Tailwind v4: **never create `tailwind.config.ts`**. Tokens in `globals.css`. Always use
  logical properties (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`) for RTL.
- `DashboardShell` provides `px-4 py-6 sm:px-6 lg:px-8` on `<main>` — pages use only
  `space-y-6` at root, no outer padding.
- Badge variants: `draft`→outline, `scheduled`→info, `live`→danger+pulse,
  `completed`→secondary; difficulty easy/medium/hard → success/warning/danger. Avatar
  colors: teacher `#1E88E5`, admin `#7C3AED`, student `#16A34A`.
- React Compiler ESLint rules are strict: no `Math.random()`/`Date.now()` in render; no
  `localStorage` writes in component bodies; no synchronous `setState` in `useEffect` (use
  the established async-inner-function pattern or lazy `useState(() => ...)`); no
  `ref.current =` during render; no react-hook-form `watch()`.
- Known lint baseline: exactly **3 pre-existing errors** (`useExamTimer.ts`,
  `invite/[token]/page.tsx`, `exam/[examId]/page.tsx`) — do not add to it.

### 8.3 Adding a role-gated page

1. Create `src/app/(dashboard)/<role>/<name>/page.tsx` (client component, root
   `space-y-6`). Middleware role-path gating covers it automatically because of the
   `/admin`, `/teacher`, `/student` prefixes — no middleware change needed.
2. Add the nav entry in `src/components/shared/DashboardShell.tsx` and i18n keys in
   `messages/en.json` + `messages/ar.json`.
3. Back it with a scoped function in `src/lib/data/` (filter by
   `getAuthUser().institutionId` + ownership) or an `/api` route.

### 8.4 Adding/changing a Prisma model — the safe procedure

1. Edit `prisma/schema.prisma` (follow existing patterns: cuid ids, `@@index` on FK
   columns, `onDelete: Cascade` where child rows are meaningless without the parent).
2. Apply with **`npm run db:push`** (`prisma db push`) — this project uses push, not
   migration files; the CLI connects via `prisma.config.ts` (`DIRECT_URL`, falling back to
   `DATABASE_URL`/pgBouncer when direct 5432 is blocked — a known network condition on the
   dev machine; `scripts/mgmt-sql.sh` runs raw SQL over HTTPS as a last resort).
3. `npx prisma generate` regenerates the client into `src/generated/prisma` (also runs on
   `npm install` and in the build).
4. **Any NEW table needs RLS** (established guardrail): enable RLS + SELECT-only
   `authenticated` policies matching the shapes in §4.4, applied via SQL
   (`scripts/mgmt-sql.sh`) — remember Prisma bypasses RLS, so this only affects
   Realtime/PostgREST.
5. Add scoped data functions + unit tests; run `npx tsc --noEmit`, `npm run lint`,
   `npm run test:unit`, `npm run build` (all must stay at baseline).

### 8.5 Running the Playwright e2e suite (one-time setup)

The e2e suite creates real exams, attempts, and Supabase Auth users, so it must **never**
run against the production project — `tests/fixtures/guard-non-prod.ts` (imported by every
network-touching script) throws if the `TEST_*` env vars are missing or resolve to the
known prod project ref/app URL. Setup:

1. Create a **second, fully separate Supabase project** (free tier is fine — a second
   Postgres database is not enough; Supabase Auth exists per-project).
2. From its dashboard collect: Project URL, anon/publishable key, service-role key, and
   both connection strings (pooled 6543 + direct 5432).
3. Push the schema to it: `TEST_DATABASE_URL="<pooled>?pgbouncer=true" DIRECT_URL="<direct>"
   npx prisma db push` — run in a shell that has **not** sourced the prod `.env.local`
   (`db push` reads plain `DIRECT_URL`, not a `TEST_` prefix).
4. Export the `TEST_*` vars from §7 (e.g. via a `.env.test.local` you `source`; never add
   them to `.env.local`): `TEST_BASE_URL=http://localhost:3100`, `TEST_PORT=3100`,
   `TEST_DATABASE_URL`, `TEST_DIRECT_URL`, `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`,
   `TEST_SUPABASE_SECRET_KEY`.
5. Run: `npm run test:e2e` (seeds two throwaway tenants via
   `tests/fixtures/seed-tenants.ts` — every entity name is prefixed with `QA_PREFIX`,
   default `qa_<timestamp>_` — then runs Playwright). Cleanup is explicit, not automatic:
   `npm run test:e2e:teardown` deletes the tenants recorded in
   `tests/fixtures/.qa-fixture.json` in FK-safe order plus their Supabase Auth users.
   Delete `.qa-fixture.json` and re-seed for a fresh tenant pair.

### 8.6 Verification bar

Every change lands with: `tsc` clean · lint at the 3-error baseline · vitest green ·
`npm run build` clean. There is no dev/staging database — live QA uses **disposable,
self-cleaning scripts** against the production Supabase project (create throwaway
tenants/users, verify, delete everything). Production-build verification matters for
proctoring code: React StrictMode's dev double-mount has produced false test failures
here before (`ProctoringEventBuffer.revive()` exists because of it).

---

## 9. Known gaps & gotchas

- **SEC-08 — most tables have no RLS** (§4.4). App-layer scoping is the only enforcement
  on `Exam`, `Question`, `Answer`, `User`, `Item`, `ExamSection`, `SectionAttempt`, etc.
- **`/models` + static assets in middleware**: any *route-like* (extension-less) public
  path must be in `PUBLIC_PREFIXES` (`src/middleware.ts`); files with extensions are
  covered by `STATIC_ASSET_RE`. Getting this wrong silently kills the proctoring models
  (they fetch HTML and the widget degrades to "Basic monitoring" with no error).
- **No autosave / dead attempts score 0**: answers live client-side until the single bulk
  submit; `POST /api/monitor/force-finalize` can only finalize to 0. Deliberate design —
  don't "fix" it casually by adding a cron.
- **Exam status is derived at read time** (`computeEffectiveExamStatus`) — the DB `status`
  column is not auto-flipped by any job; new read paths must apply the derivation.
- **Biometric verification is simulated** — real camera/ID capture UI, but no
  OCR/face-match backend exists. `ExamAttempt.biometricVerified` reflects flow completion,
  not identity proof.
- **WebRTC is STUN-only** — no TURN server. Cross-NAT/firewalled networks will hit the
  viewer's `failed` state ("likely a firewall/network blocking a direct connection");
  that state is the tell that a TURN server (self-hosted coturn or pay-per-use) is needed.
- **Supabase URL config is a manual dashboard step**: Authentication → URL Configuration →
  Site URL = `https://exam-system-sigma.vercel.app` (+ Additional Redirect URLs) or invite
  and reset emails redirect to localhost.
- **Judge0 is optional pay-per-use**: without `JUDGE0_API_URL`/`JUDGE0_API_KEY`, coding
  answers are held for manual grading (never auto-failed). Costs are attributed per
  institution via `JudgeUsageLog`; quota exhaustion also degrades to manual grading.
- **AI degrades gracefully everywhere**: no `ANTHROPIC_API_KEY` ⇒ generation uses the mock
  generator (`model: 'mock'` on the job) and grading stays manual. Quota (per institution,
  monthly) hard-stops with 429 on generation.
- **LaTeX/rich math is not specially handled** — question stems and AI grading treat
  content as plain text; no renderer (KaTeX/MathJax) is installed. Math-heavy content will
  display raw.
- **Known pre-existing hydration mismatch** (React error #418) on dashboard pages:
  `DashboardShell`'s avatar-initials read `localStorage` client-side. Cosmetic-plus
  (React remounts the tree; mutations still work) but makes UI-click-only test automation
  flaky. Flagged for a future pass, not yet fixed.
- **E2e suite needs a second Supabase project** (§8.5, `TEST_*` env vars) —
  unit tests and the build are the always-runnable verification.
- **`Item.facilityIndex`/`discriminationIndex`** are rolling aggregates only updated by
  psychometrics compute runs; sparse pooled matrices yield honest NULL alpha values.
- **`/register` creates a brand-new institution** — there is no link/query-param way to
  join an existing one; joining happens only via invites.

---

## 10. How to make changes with an LLM (no agentic tools)

General rule: always paste **this file** plus the specific files below. Full repo context
is rarely needed — the layering is strict enough that changes stay local.

| Change type | Paste these files |
|---|---|
| **Any change (baseline)** | `docs/ARCHITECTURE.md` (this file) + the target file(s) |
| **UI change on a dashboard page** | The page under `src/app/(dashboard)/.../page.tsx`; `src/components/shared/DashboardShell.tsx` (nav/shell); relevant `src/components/ui/*` primitives; `messages/en.json` + `messages/ar.json` if copy changes; §8.2 rules |
| **New API route** | A sibling route as a template (e.g. `src/app/api/classes/route.ts`); `src/lib/api-auth.ts`; the `src/lib/data/*` file it will call; `prisma/schema.prisma` excerpt for touched models |
| **Schema change** | `prisma/schema.prisma`; every `src/lib/data/*` file querying the touched models (grep the model name); §8.4 procedure; remember RLS for new tables |
| **Exam-taking / timer change** | `src/app/exam/[examId]/page.tsx`; `src/hooks/useExamTimer.ts`; `src/lib/exam-deadline.ts`; `src/app/api/attempts/[attemptId]/submit/route.ts`; `src/lib/scoring.ts` |
| **Proctoring tweak** | `src/components/proctoring/ProctoringOverlay.tsx` + the specific detector; `src/lib/proctoring/{event-buffer,episodes,gaze,severity}.ts`; `src/app/api/violations/route.ts`; `src/lib/trust-score.ts`. ⚠️ Verify against a **production build** (`next build && next start`) — dev StrictMode gives false negatives here |
| **Scoring/grading change** | `src/lib/scoring.ts`; `src/lib/ai/grading.ts`; `src/app/api/grading/answers/[answerId]/route.ts`; `src/lib/grading-status.ts`; `Answer`/`AnswerGrading` schema excerpt |
| **AI generation change** | `src/app/api/ai/generate-questions/route.ts`; `src/lib/ai/{generation-job,claude-generator,question-generator,quota,constants}.ts` |
| **Pooling/sections change** | `src/lib/data/pooling.ts` + `pooling-errors.ts`; `src/app/api/attempts/route.ts`; `src/lib/scoring.ts` (`computeSectionScores`); section routes under `src/app/api/attempts/[attemptId]/sections/` |
| **Invite/class flow change** | `src/lib/data/invites.ts`; `src/lib/invite-accept-decision.ts`; `src/lib/data/invite-guards.ts`; the accept routes under `src/app/api/{invites,class-invites}/`; the public pages `src/app/invite/[token]/page.tsx` / `src/app/classes/join/[token]/page.tsx` |
| **Permissions change** | The relevant pure module: `src/lib/item-bank-permissions.ts`, `src/lib/class-permissions.ts`, or `src/lib/exam-eligibility.ts` + its unit test in `tests/unit/` |

After any change, the acceptance bar is §8.6. Unit tests for pure logic live in
`tests/unit/` — mirror an existing test file's style (plain vitest, mocked Prisma where
routes are tested).
