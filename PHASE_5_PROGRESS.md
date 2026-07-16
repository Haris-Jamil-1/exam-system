# Phase 5 Progress (2026-07-16)

## Headline finding

All four tasks in the Phase 5 spec — pre-exam instructions screen, availability-window-vs-duration
auto-submit, per-item time limits, optional AI proctoring toggle — **were already fully implemented**
in the 2026-07-09 session ("Student UI & Time Controls," spec items 1–4; see `CLAUDE.md`'s Session
Log). This pass re-verified every piece of that claim against the current code and the live Supabase
DB rather than trusting the changelog, found it accurate, and then closed the one genuine gap: the
spec's explicit request for unit tests on the deadline logic, which previously existed only as
inline route code exercised by manual/Playwright QA.

- [x] Task 1 — Pre-exam instructions screen. Already implemented (`Exam.instructions`, wizard/edit
      textarea, student instructions screen, timer gated behind "Start Exam" click). No code change.
- [x] Task 2 — Availability window vs. duration. Already implemented (`Exam.startTime`/`endTime`/
      `duration`, deadline = `min(startedAt + duration, endTime)`, server-recomputed on submit).
      **Refactored + newly unit-tested this pass** (see below). No behavior change.
- [x] Task 3 — Per-item time limits. Already implemented (`Question.timeLimitSeconds` /
      `Item.timeLimitSeconds`, `ItemCountdownBadge` auto-advance, `Previous` button and sidebar
      direct-navigation both permanently locked past an expired item). No code change.
- [x] Task 4 — Optional AI proctoring toggle. Already implemented (`Exam.isProctoringEnabled`,
      wizard/edit toggle, `<ProctoringOverlay>` not mounted and biometric gate skipped when off).
      No code change.

## What changed this pass

**`src/lib/exam-deadline.ts`** (new) — extracted the inline deadline math from
`api/attempts/[attemptId]/submit/route.ts` into two pure, exported functions:
`computeSubmissionDeadline(startedAt, durationMinutes, endTime)` and `isPastDeadline(deadline, now)`.
Pure refactor — the route now calls these instead of the inline `Math.min`/grace-window logic;
no change to the computed deadline, the grace window (5s), or the resulting `submitted` /
`auto_submitted` status.

**`tests/unit/exam-deadline.test.ts`** (new, 7 tests) — both trigger paths independently, per the
spec's own worked example: 60-min duration, exam closes at 12:00, student starts 11:30 → deadline is
12:00 (30 minutes in, not 60); the reverse case where duration is the binding constraint; an exact-tie
case; and the grace-window boundary on `isPastDeadline`.

## Deliberate non-change: no automatic dead-client force-submit

The spec's Task 2 example implies the system should "auto-submit… not just a frontend countdown."
The server already satisfies the literal requirement — the deadline is independently recomputed
server-side on every submit call, so a manipulated or stalled client timer cannot grant extra time or
mis-record the status (verified live, see below). What it does *not* do is proactively finalize an
attempt whose client never calls submit at all (crashed tab, lost network, closed laptop).

This was considered and rejected as new work this pass, not overlooked: `POST
/api/monitor/force-finalize` already exists for exactly this situation, and its own code comment
states the design intent explicitly — a dead attempt has no server-side record of its answers (there
is no autosave-to-DB path; answers live client-side until the final submit POST), so finalizing it
can only score it 0. The existing implementation makes that **"deliberately a second, explicit
teacher action, never automatic"** rather than a cron job that would silently zero a student's score
over a transient network blip. Automating it would reverse a deliberate Phase 3 product decision, not
close a bug — flagging for Haris's call rather than making it unilaterally. The known gap this leaves
(documented since 2026-07-09) is unchanged: no background sweep exists to *notice* a dead attempt for
a teacher to then force-finalize by hand.

## Verified against live Supabase (`rlbtdpnmdnaxlccelxdr`)

- Confirmed live (via `scripts/mgmt-sql.sh` over the Management API) that every field these tasks
  depend on already exists in production exactly as needed: `Exam.instructions`,
  `Exam.isProctoringEnabled`, `Exam.startTime`/`endTime`/`duration`, `Question.timeLimitSeconds`,
  `Item.timeLimitSeconds`. No migration was needed this pass.
- Confirmed `Exam`/`Question`/`Item` have `rowsecurity = false` and zero policies — consistent with
  the already-accepted SEC-08 risk (RLS is enabled only on the 4 Phase-3 realtime tables). No RLS
  change was needed since no new tables or fields were introduced.
- Ran a disposable, self-cleaning script (Prisma + a real Playwright browser login, so Supabase SSR
  session cookies are set exactly as a real user's would be — not hand-crafted) against the live dev
  server + live DB, driving the real `POST /api/attempts/[attemptId]/submit` route end-to-end for
  three cases: duration expires before `endTime` (→ `auto_submitted`), `endTime` arrives before
  duration would expire — the spec's own example (→ `auto_submitted`, deadline honored at the earlier
  time), and neither expired (→ `submitted`). All three passed against the real route, not just the
  extracted unit under test. One throwaway institution/teacher/student/exam/attempt per case; all
  rows independently confirmed deleted afterward (`count = 0` for each).

## Verification

- `npx tsc --noEmit` → clean
- `npm run lint` → 3 errors / 1 warning, unchanged pre-existing baseline (`useExamTimer.ts`,
  `invite/[token]/page.tsx`, `exam/[examId]/page.tsx` — predate this session)
- `npm run build` → passes, 74 routes (unchanged)
- `npx vitest run` → **127/127 passing** (120 baseline + 7 new in `tests/unit/exam-deadline.test.ts`)

## Outstanding / manual-QA items

- **No new manual UI QA needed this pass** — Tasks 1/3/4 are unchanged code, already covered by the
  2026-07-09 session's live Playwright QA (instructions-gated timer, per-item auto-advance + lock,
  proctoring-toggle camera/biometric skip all confirmed then; re-confirmed this pass by reading the
  current code, not re-run, since nothing there changed).
- **Known gap, still open, not addressed this pass** (documented since 2026-07-09, reaffirmed above):
  no background job notices an attempt whose client died mid-exam; a teacher must currently discover
  it themselves and call the existing force-finalize action. Would need a cron sweep with an explicit
  decision on whether/how to notify the student and teacher before zeroing a score — a product
  decision, not a bug fix, and out of scope to make unilaterally here.
- **Pre-existing, unrelated, still open**: `DashboardShell`'s avatar-initials `localStorage` read
  causes an SSR/client hydration mismatch on every dashboard page (noted 2026-07-14, not touched by
  this pass, does not affect the exam-taking flow this phase covers).
