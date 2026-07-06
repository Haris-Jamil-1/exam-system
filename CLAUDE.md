# ExamPro — AI-Proctored E-Testing Platform

## Session Log

### 2026-07-06 — QA_RESULTS.md Priority Fix Pass ✅

Worked `QA_RESULTS.md`'s P0/P1 findings from the 2026-07-03 QA audit in priority order. Each fix: implemented → typecheck/lint/build clean → verified against live prod DB (`rlbtdpnmdnaxlccelxdr`) with a disposable, self-cleaning script → committed and pushed individually.

**Fixed and verified this pass:**
- **SEC-04** (`251f0f1`) — `PUT`/`DELETE /api/exams/[examId]` and `updateQuestion`/`deleteQuestion` (`lib/data/questions.ts`) skipped ownership checks entirely for `role === 'admin'`, letting any institution's admin mutate/delete another institution's exams and questions. Added institution scoping matching the SEC-01/02/03 pattern.
- **SCR-05** (`397be86`) — `Answer.marksAwarded` / `ExamAttempt.score` were `Int`, silently truncating fractional partial credit on matching/ordering questions (e.g. 8÷3×1 = 2.667 → stored as 2, no error). Changed both to `Float`, applied live via `prisma db push` (no migrations dir in this project — datasource URL comes from `prisma.config.ts`, not the schema file).
- **SEC-07 / STU-01 / TIME-02** (`82c6bd5`) — `POST /api/attempts` had no server-side `startTime`/`endTime` check at all. Added enforcement that gates only brand-new attempts (existing attempts always resumable); before-start is blocked unless the teacher manually went live early (`status === 'live'`), after-end is always blocked.
- **ERR-01 / ERR-02** (`63c2d19`) — all 15 mutating routes crashed with a bare non-JSON response on malformed JSON or wrong Content-Type. Added `withErrorHandling()` in `src/lib/api-auth.ts` and applied it to every mutating handler; malformed input now returns structured 4xx JSON.
- **SEC-03 PUT half + DAT-02** (`3ae2d16`, docs only) — both were already safe (PUT institution check landed with the GET fix in `cde294b`; `deleteExam`'s FK-safe transaction already handles cascade correctly) but had never been independently exercised. Verified live, no code change needed; closed out in `QA_MANUAL.md`.

**Explicitly deferred (not silently dropped — flagged for a human decision):**
- **DAT-01** — live read-only audit confirmed 2 real production `Answer` rows still scored under the pre-06-25 MCQ text-vs-ID bug (rows `cmqtkpdw5000d04jmmhdco49a` / `cmqtkpe2e000e04jm9ra7gfkk`, both submitted `2026-06-25T14:04:06.442Z`). **Not auto-corrected** per instruction — awaiting a recalculate-vs-flag decision.
- **STU-03** (per-question marks lost after one reload), **TCH-03** (no per-student answer review pane — missing feature), and the minor `resultsPublishedAt` omitted-instead-of-`null` finding — all pre-existing, confirmed bugs from the 2026-07-03 audit, but **out of this session's assigned fix scope** (not in the priority list given). Still open.
- Camera-widget/Submit-button overlap — needs a human in a real browser at a normal viewport; not scriptable.

**Build status**: `npm run build` → PASSES (0 errors, 50 routes) · `npm run lint` → same 7 pre-existing problems as before this session (confirmed via `git stash` diff, none introduced) · `npx tsc --noEmit` → clean.

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
- **Phase 2 hardening** ✅ — All P0/P1 security, scoring, and reliability gaps found by the 2026-07-03 QA audit are now fixed and independently verified against live prod DB (2026-07-06, see Session Log). Cross-tenant IDOR gaps closed (SEC-01–04), exam time-window enforced server-side (SEC-07/STU-01/TIME-02), silent score truncation fixed (SCR-05), all mutating routes return clean JSON on malformed input (ERR-01/02). Three items remain open by deliberate deferral, not oversight — see Session Log's "Explicitly deferred" list (DAT-01's 2 flagged production rows, STU-03, TCH-03, the `resultsPublishedAt` minor finding, and the camera-widget overlap).
- **Phase 3** — Next: AI grading, face detection, Supabase Realtime (see Phase 3 Next Steps below)

**Pending manual action**: Supabase dashboard → Authentication → URL Configuration → set Site URL to `https://exam-system-sigma.vercel.app` and add it to Additional Redirect URLs (without this, invite emails redirect to localhost).

**Pending human decision**: DAT-01's 2 flagged production `Answer` rows (see Session Log, 2026-07-06) — recalculate or leave flagged?

---

## Build Status
- `npm run build` → **PASSES** (0 errors, 50 routes)
- `npm run lint` → 7 pre-existing problems (4 errors/3 warnings in `useExamTimer.ts`, `invite/[token]/page.tsx`, etc. — predate this session, confirmed via `git stash` diff, not introduced by any fix here)
- `npx tsc --noEmit` → clean
- Last verified: 2026-07-06 (QA_RESULTS.md priority fix pass)
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
- **AI grading**: `POST /api/grade` via Claude API (`claude-sonnet-4-6`) for essay + coding questions
- **Face detection**: replace `FaceDetector.tsx` mock with `face-api.js` (load models from `/public/models/`)
- **Supabase Realtime**: replace 10s polling in `teacher/monitor` with channel subscriptions
- **Trust score**: violation-count formula (`Math.max(0, 100 - violationCount * 15)`) is already computed and persisted server-side in `ExamAttempt.trustScore` on submit (fixed 2026-06-25); this item is about revisiting whether that formula itself is the right one, not about wiring persistence (already done)
- **Psychometrics**: replace random FI%/DI% in `teacher/items` with real answer-based calculation
- **Carried over from Phase 2 hardening (deliberately deferred, not Phase 3-blocking but worth picking up early)**: STU-03 (per-question marks lost after one reload), TCH-03 (per-student answer review pane, missing feature), `resultsPublishedAt` omitted instead of `null`, DAT-01's 2 flagged production rows (pending human decision)

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
