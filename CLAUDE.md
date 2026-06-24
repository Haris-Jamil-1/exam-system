# ExamPro — AI-Proctored E-Testing Platform

## Session Log

### 2026-06-25 — Phase 2 Session A: Prisma + Supabase Foundation ✅

**What was done:**
- Installed: `@supabase/supabase-js`, `@supabase/ssr`, `@prisma/client`, `prisma`, `@prisma/adapter-pg`, `pg`, `dotenv`, `tsx`
- Created `prisma/schema.prisma` — 13 models, 12 enums (Institution, User, InviteToken, Exam, ExamEnrollment, Question, Option, Item, ItemOption, ExamAttempt, Answer, Violation, Course, Topic, LearningObjective)
- Created `prisma.config.ts` — loads `.env.local`, uses `DIRECT_URL` for schema ops
- Updated `tsconfig.json` — excluded `prisma/` from Next.js typecheck
- Updated `package.json` — `build` script runs `prisma generate && next build`; added `postinstall`, `db:push`, `db:seed` scripts
- Ran `prisma db push` — all 13 tables created in Supabase PostgreSQL
- Ran `prisma generate` — Prisma v7 client generated to `src/generated/prisma/`
- Created `src/lib/prisma.ts` — singleton PrismaClient using `@prisma/adapter-pg` (PrismaPg adapter)
- Created `src/lib/supabase/client.ts` — browser client (`createBrowserClient`)
- Created `src/lib/supabase/server.ts` — server client (`createServerClient` with cookie jar)
- Created `src/lib/supabase/admin.ts` — service-role client (for invite emails, server-only)
- Created `prisma/seed.ts` — seeds Institution + 3 demo Supabase auth users + Prisma User records
- Ran seed → demo accounts created:
  - `admin@demo.exampro.com` / `Demo@1234`
  - `teacher@demo.exampro.com` / `Demo@1234`
  - `student@demo.exampro.com` / `Demo@1234`
- Added all 6 env vars to Vercel production environment via CLI

**Key Prisma v7 differences vs v5/v6:**
- `schema.prisma` datasource block has NO `url` or `directUrl` — all in `prisma.config.ts`
- Generator `provider = "prisma-client"` (not `prisma-client-js`)
- Output goes to `src/generated/prisma/` (not `node_modules/@prisma/client`)
- Import from `@/generated/prisma/client` (not `@prisma/client`)
- PrismaClient constructor takes `{ adapter: new PrismaPg({ connectionString }) }` (adapter pattern)
- `db push` requires `--url` flag pointing to direct connection (port 5432, not pgBouncer port 6543)

**Build status after session:**
- `npm run build` → **PASSES (0 errors, 40 routes)**
- `npm run lint` → **PASSES (0 errors, 0 warnings)**
- Vercel: 6 env vars added (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, NEXT_PUBLIC_APP_URL, DATABASE_URL, DIRECT_URL)
- GitHub: pending commit/push (see below)

**What's next (Phase 2 Session B):**
- Rewrite `src/middleware.ts` — verify Supabase JWT, extract role from user_metadata
- Rewrite `src/hooks/useCurrentUser.ts` — use Supabase browser session
- Rewrite `src/components/auth/LoginForm.tsx` — `supabase.auth.signInWithPassword()`
- Rewrite `src/components/auth/RegisterForm.tsx` — `supabase.auth.signUp()` + Prisma Institution+User
- Write `src/app/auth/callback/route.ts` — OAuth/magic-link callback handler
- Write `src/app/invite/setup/page.tsx` — name entry after invite acceptance
- Rewrite `src/app/invite/[token]/page.tsx` — validate InviteToken from DB
- Write `src/app/api/invites/route.ts` — POST invite + Supabase `inviteUserByEmail`

---

### 2026-06-24 — Session 3: Phase 1 Feature Expansion (Chunks 1–6) + Audit Fixes ✅

**What was done:**

#### Chunk 1 — Admin Curriculum Architecture
- New route: `/admin/curriculum` — 3-column cascade UI (Course → Topic → CLO)
- Create courses, topics, and CLOs with Bloom's Taxonomy level + Learning Domain metadata
- CLO code auto-generated (`COURSE-CHAPTER-CLOn` pattern)
- Data functions added to `lib/data`: `getCourses`, `getTopics`, `getCLOs`, `createCourse`, `createTopic`, `createCLO`
- New mock data in `lib/mock-data/curriculum.ts`
- New types in `src/types/index.ts`: `Course`, `Topic`, `LearningObjective`, `BloomsLevel`, `LearningDomain`

#### Chunk 2 — CurriculumPicker Shared Component
- New shared component: `src/components/shared/CurriculumPicker.tsx`
- Cascading Course → Topic → CLO dropdowns with derived `selectedCLO` metadata panel
- Shows inherited Bloom's and Domain badges in read-only panel on CLO selection
- Phase 2 comment: replace `getCourses/getTopics/getCLOs` with Prisma queries

#### Chunk 3 — Bulk Item Import + Psychometrics + Question Bank Enhancements
- New component: `src/components/shared/BulkImportModal.tsx` — CSV upload, parse+validate, preview table, bulk import
- CSV parser handles empty files, header-only, Windows `\r\n` line endings; known Phase 1 limitation: comma-in-stem fields
- `teacher/items/page.tsx` updated: FI% and DI psychometric columns (amber flag when out of range), Archive action, archived tab (5th), CSV import button, at-risk banner
- `teacher/items/new/page.tsx` updated: `coding` and `file_upload` question types, `CurriculumPicker` integration in Mapping tab, CLO `learning_objective_id` FK on submit

#### Chunk 4 — Exam Settings: Navigation, Pooling, Grade Publishing
- `teacher/exams/new/page.tsx` Step 4 completely rewritten with:
  - Navigation Mode card (Free / Sequential + Forward-Only checkbox)
  - Behavior section (Auto-Advance, Allow Pause toggles)
  - Results Visibility dropdown (`instant` | `held`)
  - Dynamic Pooling section (pool size + question limit)
  - Summary badge strip showing all active settings
- All settings serialised into `createExam` call with Phase 2 comments

#### Chunk 5 — Coding & File-Upload Question Types in Exam
- New component: `src/components/exam/CodeQuestion.tsx` — dark-theme monospace textarea, visible test cases table, mock "Run Code" (1200ms sim), Phase 3 comment for `/api/exec` endpoint
- New component: `src/components/exam/FileUploadQuestion.tsx` — drag-and-drop zone, extension filter + size limit, replace flow, Phase 2 comment for Supabase Storage upload

#### Chunk 6 — Proctoring, Biometric Gate, Pause, Held Results
- New component: `src/components/proctoring/BiometricOnboarding.tsx` — 3-step simulated webcam → ID → verified flow, no camera APIs (safe on all browsers), gated to `strict` proctoring only
- `src/components/proctoring/TabGuard.tsx` updated: F12/PrintScreen blocking, Ctrl+C/V/P/S/A/U/Shift+I/J/C blocking, right-click disabled; all 4 event listeners correctly removed on unmount
- `src/app/exam/[examId]/page.tsx` full rewrite: biometric gate, pause overlay (with real timer pause), auto-advance effect, sequential/forwardOnly navigator, file answer state, `held=1` submit param
- `src/app/exam/[examId]/complete/page.tsx`: amber "Results Pending Review" card when `held=1`, score card hidden when held
- `src/app/(dashboard)/teacher/exams/[examId]/results/page.tsx`: "Publish Results" button (Phase 2 stub), held banner, `resultsPublished` local state
- `src/app/(dashboard)/student/results/page.tsx`: pending results rows (amber badge) above published results in table + mobile cards
- `src/app/(dashboard)/admin/analytics/page.tsx`: Curriculum Analytics section — domain breakdown bars, Bloom's horizontal bar chart, CSV export button (Phase 2: `/api/analytics/curriculum-export`)

#### Audit Fixes (same session)
- **Timer pause bug fixed**: `useExamTimer` now accepts `isPaused?: boolean` — interval is cleared while paused; timer truly stops, preventing silent auto-submit during pause
- **5 `react-hooks/set-state-in-effect` errors fixed**: `CurriculumPicker.tsx` (derived `selectedCLO` state removed; cascade effects use `async update()` pattern) and `admin/curriculum/page.tsx` (same async pattern)
- **`void count` lint suppression removed**: `handleImported` parameter renamed to `_count`
- **Unused `Input` import removed** from `teacher/students/page.tsx` (pre-existing warning)

**Build status after session:**
- `npm run build` → **PASSES (0 errors, 40 routes)**
- `npm run lint` → **PASSES (0 errors, 0 warnings)**
- GitHub: `Haris-Jamil-1/exam-system` — master branch
- Vercel: `https://exam-system-sigma.vercel.app` — redeployed

**What's next (Phase 2):**
- Start Phase 2: real backend with Supabase + Prisma (see Phase 2 Plan section below)
- Replace all `src/lib/data/*.ts` function bodies with Prisma queries
- Wire up "Publish Results" teacher action to `PATCH /api/exams/[id]/publish-results`
- Set up Supabase project, copy `DATABASE_URL` + `DIRECT_URL` to Vercel env vars
- Replace mock auth (`localStorage.exam_user`) with Supabase Auth JWT

---

### 2026-06-21 — Session 2: Bug Fixes, Mobile Support, Live Deployment ✅

**What was done:**

#### 1. Fixed Invite Students Modal (half-open bug)
- Root cause: `DialogContent` had `overflow-hidden` but no `max-h`, so the modal overflowed the viewport and appeared cut off
- Fix in `src/components/ui/dialog.tsx`: added `max-h-[90vh]` to base `DialogContent` so all dialogs are capped globally
- Fix in `src/app/(dashboard)/teacher/students/page.tsx`: restructured `InviteStudentsModal` with `flex flex-col` + `max-h-[90vh]`; header and tab bar use `shrink-0`, tab content uses `flex-1 overflow-y-auto` so it scrolls independently

#### 2. Mobile Support — Desktop Guard Scoped to Exam Pages Only
- Removed `<DesktopGuard>` from `src/app/layout.tsx` (was blocking all pages on mobile)
- Added `<DesktopGuard>` only to:
  - `src/app/exam/[examId]/page.tsx` — the live exam-taking page
  - `src/app/exam/[examId]/complete/page.tsx` — the post-exam results page
- Result: all dashboards, login, settings, analytics, etc. are fully accessible on mobile; only the proctored exam flow is desktop-only (webcam + fullscreen enforcement require desktop)

#### 3. GitHub + Vercel — Fully Connected and Deployed
- GitHub: pushed to `https://github.com/Haris-Jamil-1/exam-system` (master branch)
- Vercel: live production URL → **https://exam-system-sigma.vercel.app**
- Both commits deployed successfully; 33 routes, 0 build errors

**Build status after session:**
- `npm run build` → PASSES (0 errors, 33 routes)
- GitHub: `Haris-Jamil-1/exam-system` — master branch up to date
- Vercel: `https://exam-system-sigma.vercel.app` — production live

**What's next (Phase 2):**
- Start Phase 2: real backend with Supabase + Prisma (see Phase 2 Plan section below)
- Replace all `src/lib/data/*.ts` function bodies with Prisma queries
- Set up Supabase project, copy `DATABASE_URL` + `DIRECT_URL` to Vercel env vars
- Replace mock auth (`localStorage.exam_user`) with Supabase Auth JWT

---

### 2026-06-21 — Phase 1 Complete ✅
**What was done:**
- Full QA pass across all 3 dashboards (admin / teacher / student) — every page reviewed and polished
- Fixed double padding on all admin pages (shell already provides padding)
- Added loading skeletons to 4 pages (admin exams, admin analytics, student exams, student results)
- Added page headers (`h1` + subtitle) to every page that was missing them
- Added breadcrumb nav to exam/item create and edit pages
- Fixed live exam badge color: green → red + animate-pulse dot (system-wide convention)
- Rewrote teacher settings to use `useCurrentUser()` instead of hardcoded name
- Full React Compiler lint compliance: fixed all `purity`, `immutability`, `set-state-in-effect`, `refs`, `incompatible-library` violations
- Fixed all TypeScript unused import/variable warnings across entire codebase
- Added `argsIgnorePattern: '^_'` to `eslint.config.mjs` so underscore-prefixed params are ignored
- `npm run build` → **PASSES (0 errors)**
- `npm run lint` → **PASSES (0 errors, 0 warnings)**
- Created `CLAUDE.md` (this file) with full route map, file structure, data flow, fix log, Phase 2+3 plans, and deployment checklist
- Created `vercel.json` for Vercel deployment

**What is NOT done yet (pending user action):**
- GitHub repo not created — user needs to run `gh auth login` + `gh repo create`
- Vercel not connected — user needs to run `vercel login` + `vercel link` + `vercel --prod`
- No real backend — everything is Phase 1 mock data (in-memory, resets on refresh)

**Next session should start with:**
- Confirm GitHub + Vercel are connected (user does setup steps from CLAUDE.md Deployment section)
- Then start Phase 2: Supabase + Prisma swap

---

## Build Status
- `npm run build` → **PASSES** (0 errors, 40 routes)
- `npm run lint` → **PASSES** (0 errors, 0 warnings)
- Last verified: 2026-06-25

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
| Build | Turbopack |
| Auth | Supabase Auth (`@supabase/ssr`) — Phase 2 in progress |
| Database | Prisma v7 + `@prisma/adapter-pg` → Supabase PostgreSQL |

---

## Critical Rules (DO NOT BREAK)

### Tailwind v4
- No `tailwind.config.ts` — it breaks v4. CSS variables live in `globals.css` inside `:root {}` / `@theme {}`.
- Use logical CSS everywhere: `ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-` (RTL support).

### DashboardShell Padding Rule
- Shell `<main>` provides `px-4 py-6 sm:px-6 lg:px-8`.
- Pages must NOT add `p-6`, `mx-auto max-w-[...]`, or outer padding.
- Pages use only `space-y-6` at root level.

### Data Layer (4-Layer Pattern)
```
components → src/lib/data/* → src/lib/mock-data/*
```
- Components **never** import from `mock-data` directly.
- All `lib/data` functions are `async` / return `Promise`.
- In Phase 2: replace `lib/data` function bodies with Prisma queries.

### React Compiler ESLint Rules (strict)
- `react-hooks/purity`: No `Math.random()`, `Date.now()`, etc. during render. Put in `useEffect`.
- `react-hooks/immutability`: No `document.cookie =` or `localStorage` writes inside component bodies. Extract to functions defined **outside** the component.
- `react-hooks/set-state-in-effect`: No `setState()` synchronously in `useEffect` body. Use lazy `useState(() => {...})` initializer or put `setState` in an async callback.
- `react-hooks/refs`: No `ref.current = value` during render. Wrap in `useEffect`.
- `react-hooks/incompatible-library`: `react-hook-form`'s `watch()` skips React Compiler memoization. Use controlled state + `register` field spread with custom `onChange` instead.

### Auth Pattern
```typescript
// Read (SSR-safe, no effect needed):
const [user] = useState<CurrentUser | null | undefined>(() => {
  if (typeof window === 'undefined') return undefined;
  try { return JSON.parse(localStorage.getItem('exam_user') ?? 'null'); }
  catch { return null; }
});

// Write (outside component):
function persistSession(user: User) {
  localStorage.setItem('exam_user', JSON.stringify(user));
  document.cookie = 'exam_role=teacher; path=/; max-age=86400';
}
```

### Badge Variants
`default | secondary | destructive | outline | success | warning | danger | info`

### Status Badge Colors
- `draft` → `outline` (gray)
- `scheduled` → `info` (blue)
- `live` → `danger` (red + animate-pulse dot)
- `completed` → `secondary` (emerald)

### Difficulty Badge Colors
- `easy` → `success` (green)
- `medium` → `warning` (yellow)
- `hard` → `danger` (red)

### Avatar Colors by Role
- Teacher: `#1E88E5`
- Admin: `#7C3AED`
- Student: `#16A34A`

---

## Complete Route Map

### Public Routes
| Route | File | Description |
|---|---|---|
| `/` | `src/app/page.tsx` | Landing page |
| `/login` | `src/app/(auth)/login/page.tsx` | Login with demo role buttons |
| `/register` | `src/app/(auth)/register/page.tsx` | Institution admin registration |
| `/invite/[token]` | `src/app/invite/[token]/page.tsx` | Teacher invite acceptance |

### Exam-Taking Routes (student, no dashboard shell)
| Route | File | Description |
|---|---|---|
| `/exam/[examId]` | `src/app/exam/[examId]/page.tsx` | Live exam UI with timer + proctoring |
| `/exam/[examId]/complete` | `src/app/exam/[examId]/complete/page.tsx` | Submission confirmation + trust score |

### Admin Dashboard (`/admin/*`)
| Route | File | Description |
|---|---|---|
| `/admin` | `admin/page.tsx` | Overview dashboard |
| `/admin/teachers` | `admin/teachers/page.tsx` | Manage teachers, send invites |
| `/admin/exams` | `admin/exams/page.tsx` | Pending exam review + approval |
| `/admin/items` | `admin/items/page.tsx` | Item bank review |
| `/admin/analytics` | `admin/analytics/page.tsx` | Institution-wide analytics |
| `/admin/settings` | `admin/settings/page.tsx` | Admin profile + institution settings |
| `/admin/institutions` | `admin/institutions/page.tsx` | Institution management |
| `/admin/users` | `admin/users/page.tsx` | User management |

### Teacher Dashboard (`/teacher/*`)
| Route | File | Description |
|---|---|---|
| `/teacher` | `teacher/page.tsx` | Overview with stat cards |
| `/teacher/exams` | `teacher/exams/page.tsx` | Exam list with status badges |
| `/teacher/exams/new` | `teacher/exams/new/page.tsx` | Create exam form (multi-step) |
| `/teacher/exams/[examId]/edit` | `teacher/exams/[examId]/edit/page.tsx` | Edit exam |
| `/teacher/exams/[examId]/monitor` | `teacher/exams/[examId]/monitor/page.tsx` | Live exam monitor grid |
| `/teacher/exams/[examId]/results` | `teacher/exams/[examId]/results/page.tsx` | Per-exam results + charts |
| `/teacher/items` | `teacher/items/page.tsx` | Item bank with filters |
| `/teacher/items/new` | `teacher/items/new/page.tsx` | Create item (all question types) |
| `/teacher/monitor` | `teacher/monitor/page.tsx` | Live monitor across all exams |
| `/teacher/students` | `teacher/students/page.tsx` | Students + trust scores |
| `/teacher/analytics` | `teacher/analytics/page.tsx` | Exam performance analytics |
| `/teacher/settings` | `teacher/settings/page.tsx` | Profile + security + notifications |

### Student Dashboard (`/student/*`)
| Route | File | Description |
|---|---|---|
| `/student` | `student/page.tsx` | Overview dashboard |
| `/student/exams` | `student/exams/page.tsx` | Available exams table |
| `/student/results` | `student/results/page.tsx` | Past results + scores |
| `/student/settings` | `student/settings/page.tsx` | Profile settings |

### API Routes
| Route | Method | Description |
|---|---|---|
| `/api/exams` | GET, POST | List / create exams |
| `/api/exams/[examId]` | GET, PUT, DELETE | Single exam CRUD |
| `/api/questions` | GET, POST | List / create questions |
| `/api/attempts` | GET, POST | List / start attempts |
| `/api/attempts/[attemptId]` | GET | Single attempt |
| `/api/attempts/[attemptId]/submit` | POST | Submit attempt |
| `/api/violations` | GET, POST | Log / fetch violations |
| `/api/analytics` | GET | Analytics data |
| `/api/ai/generate-questions` | POST | AI question generation |

---

## Complete File Structure

### `src/app/`
```
layout.tsx               Root layout — next-intl, fonts
globals.css              Tailwind v4 theme variables, base styles
page.tsx                 Landing page with hero + feature sections
(auth)/layout.tsx        Auth layout (centered, no sidebar)
(auth)/login/page.tsx    LoginForm wrapper
(auth)/register/page.tsx RegisterForm wrapper
(dashboard)/layout.tsx   Shared dashboard layout (empty — role layouts handle shell)
exam/[examId]/page.tsx   Full-screen exam UI with question nav + proctoring
exam/[examId]/complete/page.tsx  Post-exam results screen
invite/[token]/page.tsx  Teacher invitation acceptance form
```

### `src/app/(dashboard)/admin/`
```
layout.tsx       AdminLayout — fetches pending counts for nav badges
page.tsx         Admin overview with KPI cards + quick actions
teachers/page.tsx        Teacher list + invite modal
exams/page.tsx           Pending exam review with approve/reject
items/page.tsx           Item bank review queue
analytics/page.tsx       Institution-wide charts (recharts)
settings/page.tsx        Admin profile + institution config
institutions/page.tsx    Institution management
users/page.tsx           User management
```

### `src/app/(dashboard)/teacher/`
```
layout.tsx               TeacherLayout
page.tsx                 Teacher overview
exams/page.tsx           Exam list (table with badges + actions)
exams/new/page.tsx       Multi-step exam creation form
exams/[examId]/edit/page.tsx     Edit exam settings
exams/[examId]/monitor/page.tsx  Live student grid (status cards)
exams/[examId]/results/page.tsx  Results + score dist + pass/fail charts
items/page.tsx           Item bank with search/filter/type tabs
items/new/page.tsx       Create item (MCQ/MRQ/Essay/Fill/Matching/Ordering)
monitor/page.tsx         Cross-exam live monitor
students/page.tsx        Student list with trust scores + violations
analytics/page.tsx       Exam performance analytics
settings/page.tsx        Profile, password, notifications (uses useCurrentUser)
```

### `src/app/(dashboard)/student/`
```
layout.tsx               StudentLayout
page.tsx                 Student overview
exams/page.tsx           Upcoming + available exams
results/page.tsx         Past exam results with score breakdown
settings/page.tsx        Student profile settings
```

### `src/app/api/`
```
exams/route.ts           GET /api/exams, POST /api/exams
exams/[examId]/route.ts  GET/PUT/DELETE /api/exams/[id]
questions/route.ts       GET/POST /api/questions
attempts/route.ts        GET/POST /api/attempts
attempts/[attemptId]/route.ts         GET single attempt
attempts/[attemptId]/submit/route.ts  POST submit
violations/route.ts      GET/POST violations
analytics/route.ts       GET analytics data
ai/generate-questions/route.ts        POST AI generation
```

### `src/components/`
```
auth/LoginForm.tsx        Demo login + role quick-select buttons
auth/RegisterForm.tsx     Institution admin registration form
shared/DashboardShell.tsx Sidebar + topbar + notification panel + user chip
shared/LanguageToggle.tsx AR/EN toggle (next-intl cookie-based)
shared/Navbar.tsx         Landing page navbar
shared/RoleGuard.tsx      Client-side role redirect guard
proctoring/ProctoringOverlay.tsx  Orchestrates all proctoring components
proctoring/FaceDetector.tsx       Webcam face detection (mock in Phase 1)
proctoring/AudioMonitor.tsx       Microphone monitoring (mock)
proctoring/TabGuard.tsx           Tab visibility + focus detection
proctoring/FullscreenGuard.tsx    Fullscreen enforcement
proctoring/ViolationAlert.tsx     Real-time violation toast
ui/badge.tsx             Badge with variants: default/secondary/destructive/outline/success/warning/danger/info
ui/button.tsx            Button component
ui/card.tsx              Card + CardHeader + CardContent + CardTitle
ui/dialog.tsx            Modal dialog
ui/input.tsx             Input (type alias, not empty interface)
ui/textarea.tsx          Textarea (type alias)
ui/label.tsx             Form label
ui/select.tsx            Select dropdown
ui/tabs.tsx              Tab navigation
ui/avatar.tsx            Avatar with fallback
ui/progress.tsx          Progress bar
ui/skeleton.tsx          Loading skeleton
ui/separator.tsx         Divider
ui/dropdown-menu.tsx     Dropdown menu
ui/toast.tsx             Toast notification
```

### `src/lib/`
```
utils.ts                 cn() utility (clsx + tailwind-merge)
ai/question-generator.ts Mock AI question generator (Phase 3: Claude API)
data/index.ts            Barrel export for all data functions
data/exams.ts            getExams, getExamById, createExam, updateExam, deleteExam, getPendingExams
data/items.ts            getItems, getItemById, createItem, updateItem
data/questions.ts        getQuestions, createQuestion, updateQuestion, deleteQuestion
data/students.ts         getStudents, getStudentById, getStudentsForExam, getMonitorStudents
data/users.ts            getUserById, getTeachers
data/violations.ts       getViolations, createViolation
data/analytics.ts        getAnalytics, getScoreDistribution, getQuestionDifficulty
mock-data/exams.ts       mockExams array
mock-data/items.ts       mockItems array
mock-data/questions.ts   mockQuestions array
mock-data/users.ts       mockUsers array
mock-data/violations.ts  mockViolations array
mock-data/analytics.ts   mockAnalytics data
mock-data/admin.ts       mockAdmins array
mock-data/institutions.ts mockInstitutions array
```

### `src/hooks/`
```
useCurrentUser.ts   Lazy useState initializer reads localStorage synchronously (SSR-safe, no useEffect)
useExamTimer.ts     Countdown timer with onTimeUp callback (ref wrapped in useEffect)
useProctoring.ts    Proctoring event aggregator
useViolations.ts    Violation tracking hook
```

### `src/store/`
```
examStore.ts        Zustand: currentExam, answers, flaggedQuestions, navigation actions
proctoringStore.ts  Zustand: violationCount, trustScore, isActive, events
```

### `src/types/`
```
index.ts   All TypeScript types: Exam, Question, Option, Item, CurrentUser,
           Violation, MonitorStudent, ExamSettings, QuestionType, ExamStatus, etc.
```

### `src/i18n/`
```
request.ts   next-intl request config — reads 'lang' cookie, defaults to 'en'
```

---

## Data Flow

```
User action
  ↓
Page component (useState, useEffect)
  ↓
lib/data/*.ts  (async functions, Phase 2: Prisma)
  ↓
lib/mock-data/*.ts  (static arrays, Phase 1 only)
  ↓
Returns typed data to component
  ↓
Renders UI
```

**Zustand stores** sit alongside this for cross-component state:
- `useExamStore`: exam session state (current question, answers, flags)
- `useProctoringStore`: violation count, trust score, live proctoring events

**Auth flow**:
1. User logs in → `loginAs(role, router)` writes `localStorage.exam_user` + `document.cookie = 'exam_role=...'`
2. Middleware reads `exam_role` cookie to redirect unauthenticated users
3. `useCurrentUser()` reads `localStorage.exam_user` via lazy `useState` initializer
4. Role-specific layouts read `currentUser` for name/initials in the sidebar

---

## Issues Found and Fixed (QA Pass)

### Layout & Padding
- Removed `mx-auto max-w-[1000px] p-6` from 3 admin pages (double padding with DashboardShell)
- Changed all page roots from `space-y-4` to `space-y-6` for consistent spacing

### UI Consistency
- Teacher exam list: `live` badge was `success` (green) → changed to `danger` (red) with animate-pulse dot
- Teacher settings: was hardcoded "Dr. Sarah Mitchell" → now uses `useCurrentUser()`
- Added page headers (`h1` + subtitle) to all pages that were missing them
- Added breadcrumb navigation to exam/item creation and edit pages
- Removed duplicate "Create Item" button from teacher items page filter row

### Loading States
- Added `loading` state + skeleton UIs to: admin exams, admin analytics, student exams, student results
- Pattern: `{loading ? skeletonJSX : actualContent}`

### React Compiler Lint Fixes
- `Math.random()` during render → moved into `useEffect` (teacher exam results page)
- `document.cookie =` inside component → extracted to `persistAdminSession` outside component (RegisterForm)
- `setUser()` in `useEffect` body → replaced with lazy `useState` initializer (useCurrentUser)
- `onTimeUpRef.current = onTimeUp` during render → wrapped in `useEffect` (useExamTimer)
- `setMounted(true)` directly in `useEffect` body → removed `mounted` state entirely (exam page)
- `watch()` from react-hook-form → replaced with controlled `useState` + custom `onChange` (items/new)

### TypeScript / ESLint
- Empty interfaces `interface X extends Y {}` → `type X = Y` (input.tsx, textarea.tsx)
- `let examsDb` → `const examsDb` (4 data files — arrays are mutated, not reassigned)
- Removed unused imports: `Radio`, `CardHeader`, `CardTitle`, `Upload`, `Badge`, `Question`
- Removed unused `get` from Zustand store creators in examStore and proctoringStore
- Removed unused `elapsed` state + interval in teacher monitor page
- Removed unused `notifications` prop from DashboardShell and all 3 layout callers
- Underscore-prefix args not being ignored → added `argsIgnorePattern: '^_'` to eslint.config.mjs
- `useEffect` missing deps `resetExam`/`setCurrentExam` → added to deps array

---

## Phase 2 Plan — Real Backend (Supabase + Prisma)

### Step 1: Database Setup
```bash
npm install @prisma/client prisma
npx prisma init
```
Create `prisma/schema.prisma` with models: `Institution`, `User`, `Exam`, `Question`, `Item`, `ExamAttempt`, `Answer`, `Violation`.

### Step 2: Supabase Setup
1. Create project at supabase.com
2. Copy `DATABASE_URL` and `DIRECT_URL` to `.env.local`
3. Run `npx prisma migrate dev --name init`
4. Run `npx prisma generate`

### Step 3: Swap Data Functions
Replace each function body in `src/lib/data/*.ts` with Prisma queries. Each file has a comment `// Phase 2: prisma.model.operation(...)` showing the exact replacement.

Example for `getExams`:
```typescript
// Before (mock):
export async function getExams() { return mockExams; }

// After (Prisma):
export async function getExams(institutionId?: string) {
  return prisma.exam.findMany({ where: institutionId ? { institutionId } : {} });
}
```

### Step 4: Authentication
1. Replace mock `loginAs` with `supabase.auth.signInWithPassword()`
2. Replace `exam_role` cookie with Supabase session JWT
3. Update `middleware.ts` to verify JWT instead of cookie value
4. Update `useCurrentUser` to call `supabase.auth.getUser()`

### Step 5: File Uploads
- Add `supabase.storage` for exam attachments and profile photos
- Install `@supabase/storage-js`

### Step 6: Real-time
- Replace mock violation alerts with `supabase.channel().on('INSERT', ...)` subscriptions
- Use in teacher monitor page for live student status updates

---

## Phase 3 Plan — AI Features (Claude API + Face Detection)

### Step 1: Claude API Integration
Replace `src/lib/ai/question-generator.ts` mock with real Claude API calls:
```bash
npm install @anthropic-ai/sdk
```
```typescript
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();

export async function generateQuestions(params: GenerateParams) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: buildPrompt(params) }],
  });
  return parseQuestions(response.content[0].text);
}
```
Add `ANTHROPIC_API_KEY` to `.env.local`.

### Step 2: Face Detection
Install `face-api.js` or `@vladmandic/face-api`:
```bash
npm install face-api.js
```
Update `src/components/proctoring/FaceDetector.tsx`:
- Load models from `/public/models/`
- Run `faceapi.detectAllFaces()` every 2 seconds
- If no face detected for 10s → dispatch violation event
- If multiple faces → dispatch violation event

### Step 3: AI Essay Grading
Add Claude-powered essay grading to exam results:
```typescript
// POST /api/grade-essay
// Send essay + rubric → Claude returns score per dimension
```

### Step 4: Violation Analysis
Use Claude to analyze violation patterns and generate a natural-language trust report for the teacher.

---

## Deployment Checklist (Vercel)

### Environment Variables Required
```
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
# Phase 2+:
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# Phase 3+:
ANTHROPIC_API_KEY=sk-ant-...
```

### Pre-deploy Steps
1. `npm run build` — must pass with 0 errors
2. `npm run lint` — must pass with 0 warnings
3. Verify all routes in route map above render without crashing
4. Test all 3 demo login roles (admin / teacher / student)
5. Test exam flow: login as student → take exam → submit → view complete page

### Vercel Configuration
- Framework: Next.js (auto-detected)
- Build command: `npm run build`
- Output directory: `.next`
- Node version: 20.x or higher
- Root directory: `exam-system` (if deploying from monorepo)

### `vercel.json`
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install"
}
```

### Post-deploy
1. Set all environment variables in Vercel dashboard → Settings → Environment Variables
2. Trigger redeploy after setting env vars
3. Test `/login` with all 3 demo accounts
4. Check Vercel Functions logs for any API route errors

---

## Demo Accounts (Phase 1 Mock Auth)

All use any password ≥ 6 characters on the login form, or click the role quick-select buttons.

| Role | Email | Redirects to |
|---|---|---|
| Admin | admin@university.edu | `/admin` |
| Teacher | teacher@university.edu | `/teacher` |
| Student | student@university.edu | `/student` |

---

## Known Limitations (Phase 1)

1. **No real auth** — anyone can access any role by typing the email
2. **Data is in-memory** — refreshing the page resets any created exams/items
3. **Proctoring is mocked** — FaceDetector and AudioMonitor use simulated events
4. **AI question generation is mocked** — returns static variations of the input stem
5. **Invitation links** — `/invite/[token]` ignores the token; always registers as teacher at inst-1
6. **No email sending** — invite emails are simulated (no SMTP configured)
