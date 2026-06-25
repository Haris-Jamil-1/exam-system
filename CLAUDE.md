# ExamPro — AI-Proctored E-Testing Platform

## Session Log

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
- **Phase 3** — Next: AI grading, face detection, Supabase Realtime

**Pending manual action**: Supabase dashboard → Authentication → URL Configuration → set Site URL to `https://exam-system-sigma.vercel.app` and add it to Additional Redirect URLs (without this, invite emails redirect to localhost).

---

## Build Status
- `npm run build` → **PASSES** (0 errors, 50 routes)
- `npm run lint` → **PASSES** (0 errors, 0 warnings)
- Last verified: 2026-06-25 (destructive audit + 7 fixes)
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
- **Trust score**: replace violation-count formula with real `ExamAttempt.trustScore` per student
- **Psychometrics**: replace random FI%/DI% in `teacher/items` with real answer-based calculation

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
