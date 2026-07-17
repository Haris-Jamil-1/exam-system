# Phase 4 Fixes — Round 2 Progress (2026-07-17)

Second bugfix round from manual testing on student profiles, item/question bank, CLO creation,
and exam-to-class scoping. Four of five items shipped and live-verified; item 4 (CLO) is
investigation-only per its own instructions — reported below, not implemented, since the
original request ("CLO creation options not these") was too ambiguous to act on safely.

253/253 vitest passing (229 baseline + 24 new), `tsc` clean, `lint` at the same pre-existing
3-error baseline, `next build` clean. Live-verified against Supabase (`rlbtdpnmdnaxlccelxdr`) via
disposable, self-cleaning Prisma + Playwright scripts — real schema push, real browser logins,
real cross-class enforcement checks, all cleaned up afterward (confirmed zero leftover rows from
this round's own scripts).

## 1 — Student name not updating in profile ✅

**Root cause**: `student/settings/page.tsx`'s `onSubmit` was the exact same bug already found and
fixed on `teacher/settings/page.tsx` in the prior round, just never applied here — it took no
arguments and called no API, only flashing a fake "Saved" checkmark for 2 seconds
(`src/app/(dashboard)/student/settings/page.tsx:42-45`, pre-fix). The real `PATCH /api/users/me`
route already existed, already worked, and was simply never called. Because the form's local
`react-hook-form` state was never synced back to the `localStorage`-cached session
(`useCurrentUser` reads this on mount), a hard refresh re-seeded the form from the same stale
cache — reproducing exactly the reported "reverts after refresh" symptom.

**Fix**: mirrored the already-fixed teacher settings page's pattern — `onSubmit` now PATCHes
`/api/users/me` with the trimmed name, surfaces a real error inline on failure, syncs
`localStorage['exam_user']` on success, and disables the Email field (the route only ever
supported `name`/`avatarUrl`, so a live-but-non-functional email input would just be a second
copy of the same bug).

**Live-verified**: real Supabase account, real browser session — edited the name through the
actual UI, confirmed the "Saved" state, confirmed the row changed in Postgres, reloaded the page
and confirmed the new name survived.

**Confirmed still present, not touched (matches round 1's flag on the teacher-side twin)**: the
Security card's "Change Password" button has the identical fake-success bug (`onPwSubmit`, no API
call). Out of this task's stated scope ("student name not updating"); flagged again since it's
now been independently found on both profile pages twice.

## 2 — Students tab: class + trust score ✅

Two real bugs found beyond "missing columns," both fixed:

1. **`getStudents()` scoped a teacher's roster via the older `TeacherStudent` join table only** —
   a student who joined through the newer per-class invite flow (`POST
   /api/class-invites/accept/[token]`) only ever gets a `ClassEnrollment` row, never a
   `TeacherStudent` row, so they were **silently absent from the Students tab entirely**, not
   just missing a class label. Fixed by scoping the roster to the union of both relations
   (`studentTeachers: { some: { teacherId } }` OR `classEnrollments: { some: { class: { teacherId
   } } }`) — nobody who was visible before is dropped, and class-enrolled students now appear.
2. **`teacher/students/page.tsx` called `getViolations()` with zero arguments**, which resolves
   to an unscoped `where: {}` and returns **every violation row in the entire database, across
   every institution** — confirmed by reading `src/lib/data/violations.ts:31-42`. This fed a
   client-side fake trust-score formula (`Math.max(40, 100 - vCount * 15)`). Fixed by having
   `getStudents()` itself return a real, properly-scoped `violationCount` (grouped by studentId,
   already-filtered to this teacher's own roster) — eliminating the unscoped call entirely rather
   than just narrowing it.

**Real trust score**: `StudentRosterEntry.trustScore` is now a real average of
`ExamAttempt.trustScore` across the student's own completed/submitted attempts
(`prisma.examAttempt.groupBy`), `null` for a student with zero qualifying attempts. The UI renders
an explicit **"Not yet computed"** for that case — never a placeholder 0 or a misleading 100 (the
same misleading-100-on-zero-attempts pattern this session's research found already baked into
`getStudentStats`/`getStudentDashboardData`/`getStudentResults`/`getMonitorStudents` elsewhere in
the codebase — noted here as a pre-existing pattern, not touched, since fixing those wasn't asked
for this round).

**Same real data source as the class roster, as asked**: class names come from the same
`ClassEnrollment` relation `getEnrollments` (the class roster) already queries — no second,
divergent source of truth. Multi-class support confirmed via the schema (`ClassEnrollment` is
unique on the `(classId, studentId)` pair, not on `studentId` alone) — a student's row now shows
every one of the teacher's own classes they're enrolled in, not just one.

**Live-verified**: a student enrolled *only* via `ClassEnrollment` (no `TeacherStudent` row) now
appears on the Students tab with their class name and a real trust score; a second student with
zero exam attempts correctly shows "Not yet computed" instead of a fake number.

## 3 — Manual item builder "Save" not saving ✅

**Root cause**: `register('marks')` on the Marks `<input type="number">` had no `valueAsNumber:
true` — the DOM always hands react-hook-form a string, so `data.marks` became `"10"` etc. the
moment a teacher edited it away from the default. The form's zod schema (`marks: z.number()`)
rejected this, `handleSubmit` never called `onSubmit`, and **no error was ever rendered** —
`errors.marks` was never displayed anywhere, so the Save button just silently did nothing. This
reproduces on virtually any real use of the form, since teachers routinely change the marks value.

Two more real bugs in the same form, found while tracing the fix:

- **Difficulty and Review-Status `<Select>` inputs were completely disconnected from the form** —
  `<Select defaultValue="medium" onValueChange={() => {}}>` (a no-op handler) and a Status select
  with no `onValueChange` at all. Whatever a teacher picked, the saved item always got
  `difficulty: 'medium'` / `status: 'draft'` regardless. Fixed by converting both to plain
  controlled state (matching this same file's existing pattern for `codeLanguage`/`allowedExts`)
  and wiring them into the actual save payload.
- **No error handling around the `createItem()` call at all** — any rejection (permission denied,
  not-found bank, a Prisma FK violation) became an unhandled promise rejection with zero
  user-facing feedback. Fixed with a try/catch that surfaces `err.message` next to the Save
  button. Also fixed the same gap in `BulkImportModal.tsx`'s CSV import loop (same `createItem`
  call site, same silent-failure risk), which now reports how many rows succeeded before a
  failure and stops instead of failing the whole batch invisibly.
- **`createItem`'s `authorId` resolution fell through to the caller's empty-string value** when no
  Prisma `User` row matched the Supabase session — this used to crash on the `Item.authorId`
  required-FK constraint with a raw Prisma error, uncatchable by the (then-missing) client-side
  error handling. Now throws an explicit `"No matching account record for this session..."` error
  instead, which the new try/catch surfaces cleanly.

**Validation schema extracted** to `src/lib/item-form-schema.ts` (pure, testable) — matches this
codebase's established pattern (no React/DOM test environment exists here) of pulling decision
logic out of page components so the exact bug has a real regression test without needing to add a
new testing toolchain for one form.

**Live-verified** via a real browser session: filled the form, changed marks away from the
default (7), picked Hard difficulty and "Submit for Review" status, saved — redirected to the bank
page (success), and confirmed in Postgres that `marks === 7`, `difficulty === 'hard'`, `status ===
'review'` all landed correctly (previously would have silently failed to save at all once marks
was touched).

## 4 — CLO creation options — investigated only, not changed, per explicit instruction

The request ("CLO creation options not these") doesn't say what's wrong, so per the task's own
instruction this is a report, not a fix. Here's exactly what exists today:

**Schema** (`LearningObjective` model): `id`, `topicId` (required FK), `code` (optional string,
e.g. `CS101-3-CLO2`), `text` (the objective statement), `bloomsLevel` (required enum: `Remember |
Understand | Apply | Analyze | Evaluate | Create`), `learningDomain` (required enum: `Knowledge |
Skill | Values` — a separate axis from Bloom's, not a duplicate of it), `createdAt`. Hierarchy is
`Institution → Course → Topic → CLO`, nothing deeper. **No PLO (Program Learning Outcome) concept
exists anywhere** — no model, no mapping field, no UI, confirmed absent from the schema, every
source file, and every project doc.

**Creation UI** (`admin/curriculum/page.tsx`, admin-only) offers exactly **three inputs** once a
Course and Topic are already selected: a free-text objective **textarea**, a **Bloom's Level**
dropdown (the 6 fixed values), and a **Learning Domain** dropdown (`Knowledge`/`Skill`/`Values`).
That's the entire form. Explicitly **not** present: no `code` field (auto-generated as
`{course.code}-{topic.order}-CLO{n}`, never user-editable), no PLO/program-outcome mapping (none
exists), no weight/percentage, no separate description field, and — worth flagging even though
it's a gap rather than an "option" — **no edit or delete UI for an existing CLO at all**.
`updateCLO` exists in `src/lib/data/curriculum.ts` but is never called from anywhere; once
created, a CLO can only be viewed as a read-only card.

**Where CLOs get used** once created: the teacher-facing `CurriculumPicker` component (a
*selector*, not a creator) for tagging a manually-built item or an AI-generation request with a
CLO; CLO-aware batch AI generation (one CLO per generation batch); stratified dynamic pooling's
blueprint UI (draws a target count of approved items per CLO); and a "Curriculum Analytics"
section on `admin/analytics` that is currently **100% hardcoded mock data**, not a live query —
the code's own comments say `// Phase 2: CLO performance = AVG(...)`, i.e. a stated-but-unbuilt
gap, separate from anything asked this round.

**Flagged for Haris to clarify** (not guessed at): is the complaint that CLO creation is missing
a PLO mapping? A custom/editable code? A weight? The missing edit/delete capability? Something
about the two dropdown option sets themselves (e.g. wanting different Bloom's/domain values)?
Any of these would be a reasonable, scoped fix — but picking one blindly risked reworking the
wrong thing, per this task's own explicit instruction to stop and ask rather than guess.

## 5 — Exams should be scoped to a class, not all students ✅ (highest-risk item this round)

**Confirmed via schema/code read, not assumed**: `Exam` had **zero connection to `Class`**
anywhere — no `classId` field, no join, nothing. Student exam visibility (`getStudentExams`)
filtered only by `institutionId` + "is this exam's teacher one of my `TeacherStudent`-linked
teachers" — a purely institution/teacher-wide relationship, completely unrelated to `Class`. Every
student linked to a teacher (via the older direct-invite flow) could see and take **every** one of
that teacher's approved exams, regardless of which class (if any) it was conceptually for. The
exam creation wizard had **no class-selection step at all** — not cosmetic, entirely absent.

**A second, more serious related gap found during this same investigation**: `POST
/api/attempts` (the actual attempt-creation endpoint) had **no eligibility check whatsoever** —
not even institution matching. A student who merely knew or guessed an `examId` could start an
attempt on any exam, including one from a different institution. Hiding an exam from a list is
not real access control; this is the actual enforcement point, and it was wide open. Closed as
part of this fix, since it's the direct "...or access" half of the task's own wording.

**Schema change** (pushed live via `prisma db push`, `npx prisma generate` re-run):
`Exam.classId String?` — **nullable, deliberately**. See the required-field decision below.

**Fix, both directions the task asked to check**:
- **Creation flow**: the wizard (`teacher/exams/new`) now has a "Class" dropdown (Step 1, next to
  the title) populated from the teacher's own non-archived classes, defaulting to "No specific
  class (all my students)". `createExam` validates a submitted `classId` actually belongs to the
  calling teacher's own institution before trusting it — a spoofed/foreign classId is silently
  dropped back to unscoped rather than trusted.
- **Student visibility query**: `getStudentExams` now filters with `OR: [{ classId: null,
  teacherId: { in: myTeacherIds } }, { classId: { in: myEnrolledClassIds } }]` — a class-scoped
  exam is visible only to that class's own `ClassEnrollment` roster; an unscoped exam keeps the
  pre-existing "any of my teachers" behavior.
- **Attempt-creation gate**: `POST /api/attempts` now runs the identical eligibility rule (via a
  new shared pure function, `src/lib/exam-eligibility.ts`'s `isStudentEligibleForExam`, single
  source of truth for both the list query's logic and this per-exam gate) before allowing a
  **brand-new** attempt — resuming an already-existing attempt is never blocked by this, matching
  the same "only gate brand-new attempts" pattern the pre-existing time-window/section-weight
  checks already use.

**Required-field decision — flagged, not silently changed**: `classId` is **optional**, both in
the schema and the wizard UI. Making it mandatory would immediately block exam creation for any
teacher who hasn't set up a Class yet (Classes are a newer, not-universally-adopted feature) and
would need a migration story for every pre-existing exam. The safer default chosen: unscoped
exams keep exactly their old behavior (visible to the teacher's linked students), and a teacher
who *wants* tighter scoping now finally has the option to select a class, which didn't exist at
all before this fix. **Open question for Haris**: should class selection become required going
forward (e.g. after a grace period, or immediately for new exams)? Left as a product decision
rather than assumed.

**Live-verified** (the most rigorous check this round) via two real students, one teacher, two
classes, and one class-scoped exam, all real Supabase accounts: Student A (enrolled in Class A)
sees the exam in their list and a direct `POST /api/attempts` call succeeds (201); Student B
(enrolled in Class B, same institution, same teacher) does **not** see the exam in their list, and
the identical direct API call — bypassing the UI entirely — is blocked with a real 403, not just
hidden from view.

## Tests added (items 1, 3, 5 — 24 new tests total)

- `tests/unit/item-form-schema.test.ts` (5) — the extracted validation schema, including the
  string-vs-number regression case.
- `tests/unit/exam-eligibility.test.ts` (6) — the pure eligibility rule, explicitly covering "a
  student in Class A cannot access an exam scoped to Class B, same institution and teacher."
- `tests/unit/attempts-eligibility.test.ts` (6) — `POST /api/attempts` at the route level: cross-
  class block, cross-institution block, unscoped-exam backward compatibility (both allow and
  block cases), and resume-bypasses-the-gate.
- `tests/unit/get-student-exams.test.ts` (2) — confirms the list query's `OR` clause shape.
- `tests/unit/create-item-manual.test.ts` (2) — `createItem` end-to-end with a real number for
  marks, round-tripped through `getItemById`; and the new explicit-throw-on-missing-user case.
- `tests/unit/users-me-route.test.ts` (3) — `PATCH /api/users/me` at the route level (item 1's
  server-side mechanism; the client-side wiring itself is covered by live Playwright QA, same
  approach as round 1's identical fix on the teacher settings page).
- **Two pre-existing test files needed updates**, not because their own logic changed but because
  the new eligibility gate in `POST /api/attempts` now runs before their scenarios and needs
  compatible mocks (`tests/unit/section-locking.test.ts`, `tests/unit/attempts-pooling-
  concurrency.test.ts`) — both now stub an unscoped exam + a matching `TeacherStudent` link so
  their original (unrelated) assertions are reached the same as before.

## Live verification

All against Supabase (`rlbtdpnmdnaxlccelxdr`), disposable and self-cleaning (confirmed zero
leftover rows from this round's scripts afterward — the same 4 pre-existing, unrelated "QA Golden
Path Institution" rows noted in round 1 are still there, untouched, not created by this round):

1. **Schema push**: `prisma db push` applied `Exam.classId` live; `prisma generate` regenerated
   the client. No migration files in this project (existing convention, confirmed again).
2. **Cross-class + cross-institution exam scoping** (Task 5) — two real students, one teacher, two
   classes, real browser sessions: list visibility and direct-API attempt-start both verified in
   both directions (allowed / blocked), described above.
3. **Students tab** (Task 2) — a class-only-enrolled student (no `TeacherStudent` row) now appears
   with their class name and a real trust score; a zero-attempt student shows "Not yet computed."
4. **Manual item builder** (Task 3) — real browser session, real form fill, real save, confirmed
   in Postgres that marks/difficulty/status all persisted as selected.
5. **Student profile edit** (Task 1) — real browser session, name change persisted to Postgres and
   survived a full page reload.

**Script-timing note, not a real bug**: an early combined run of the Task 5 script showed Student
A's exam list as empty immediately after a 1.5s wait; a longer `networkidle` wait on a focused
re-run showed it present both immediately and after a full reload. The direct-API attempt-gate
check (which doesn't depend on client-side rendering timing at all) passed correctly in both runs
— logged here per the instruction not to guess silently either way before concluding.

## Manual click-through notes

- `/student/settings` — Save Changes → "Saved" state renders correctly; no visual issues besides
  the already-flagged (both rounds now) fake password-change button.
- `/teacher/students` — new Class column and real trust score / "Not yet computed" state render
  cleanly at the `lg:` breakpoint; no visual issues.
- `/teacher/items/new` — Marks/Difficulty/Status all now behave correctly; no visual issues.
- `/teacher/exams/new` — new Class dropdown sits naturally under the Exam Title field; the helper
  text switches correctly between "visible to every student" and "only this class" as the
  selection changes; no visual issues.

## Verification

- `npx tsc --noEmit` → clean.
- `npm run lint` → 3 pre-existing baseline errors (`useExamTimer.ts`, `invite/[token]/page.tsx`,
  `exam/[examId]/page.tsx`, all predate this session), 0 warnings.
- `npm run build` → compiles cleanly, all existing routes registered (no new API routes this
  round — the eligibility gate lives inside the existing `POST /api/attempts` handler).
- `npx vitest run` → 253/253 passing (229 baseline + 24 new).
- Live-verified against Supabase per the five checks above.
