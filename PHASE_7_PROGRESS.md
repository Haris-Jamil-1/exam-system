# Phase 7 Progress (2026-07-17)

## Headline finding

Task 1 (Multi-Section Exam Architecture) duplicates the 2026-07-09 session's "spec item 9"
almost entirely — `ExamSection`, `SectionAttempt`, `Question.sectionId`,
`Exam.settings.isSectionSequential`/`isItemSequential`, per-section isolated timers, the
composite-scoring formula (including the threshold-override-to-Failed case), and the per-section
instructions interstitial were all already built and live-QA'd in that session. Verified rather
than assumed: read the schema, the section start/submit routes, `lib/scoring.ts`, and the
student exam page before writing anything, per this repo's established practice.

Two real, previously-unenforced gaps were found and fixed in Task 1 (both are genuine server-
side enforcement holes, not test-coverage gaps). Task 2 (AI Grading Override & Bulk-Approve) had
a real missing feature (bulk-approve didn't exist at all) plus a real enforcement hole
(finalized answers could be silently re-overridden).

## Task 1 — Multi-Section Exam Architecture

### Already implemented, unchanged this pass
- Schema: `ExamSection` (title, instructions, durationMinutes, orderIndex, sectionWeight,
  passingThreshold), `SectionAttempt`, `Question.sectionId`. `Exam.settings.isSectionSequential`
  / `isItemSequential` — exact key names already matched the spec.
- Section-sequential lock (server-enforced): `sections/[sectionId]/start` independently
  re-checks that every lower-`orderIndex` section is submitted before allowing a start; a
  section-submit route rejects a second submit (409) once already submitted. Confirmed live
  this pass (see below), not just re-read.
- Isolated per-section timers, server-enforced auto-submit at `min(sectionStart + duration,
  exam.endTime)`, same pattern as the overall exam deadline (inlined rather than sharing
  `exam-deadline.ts`'s helpers — a pre-existing minor duplication, not touched this pass since
  it's correct as-is and out of the smallest-possible-change budget).
- Composite scoring (`computeSectionScores` in `lib/scoring.ts`): `Σ(sectionScaledScore ×
  sectionWeight)`, and a missed `passingThreshold` on any one section flags the whole attempt
  Failed regardless of composite total. Already covered by `tests/unit/section-scoring.test.ts`
  (the exact "high composite, one failed threshold → Failed" case) — not duplicated, but
  independently re-verified live this pass against a real seeded exam (see below).
- Per-section instructions interstitial, "Start Section" flow, and `isItemSequential`'s
  Previous-hiding were all already correct for the sectioned case.

### Real gap #1 — section-weight-sums-to-100% was never enforced server-side, closed
The wizard's own weight-sum validator (`SectionsManager.tsx`) is a **non-blocking** amber
warning — it doesn't even stop the teacher from saving, let alone stop a student from starting
a misconfigured exam via a direct API call. `POST /api/attempts` now sums `sectionWeight` across
all of a sectioned exam's sections and rejects a **brand-new** attempt (409→400
`invalid_section_weights`, with the actual sum in the message) if it isn't within 0.01 of 100.
**Deliberately not auto-normalized** — a misconfigured blueprint blocks the exam rather than
silently reweighting it, per the "don't guess, take the conservative option" guardrail. An
already-*resuming* attempt is never blocked by this (matches the existing pattern for the
startTime/endTime window check right above it in the same route) — a mid-exam weight edit by the
teacher can't retroactively strand a student who already started.

### Real gap #2 — `isItemSequential` had zero server enforcement surface, closed
This was the more architecturally interesting gap. The exam-taking flow has **no per-question
autosave anywhere** — every answer only ever lands server-side once, via one bulk `answers`
payload at section/exam-submit time (this is a deliberate pre-existing design point, explicitly
noted in the Phase 5 progress log as the reason a dead attempt's force-finalize can only score
0: "answers live client-side until the final submit POST"). That meant there was no server-side
concept of "this specific question was already answered/advanced past" to reject a resubmit
against — `isItemSequential` was purely client-side UI state (hiding Previous, blocking sidebar
jumps) with no backstop.

**Fixed, additively**: a new `ItemLock` table (`prisma/schema.prisma`) records, per
(attemptId, questionId), the response the student had when they advanced past that question —
written by a new `POST /api/attempts/[attemptId]/items/[questionId]/lock` endpoint the client
calls exactly once per question, the moment it's advanced past (wired into the "Next" button,
sidebar forward-jump, and the Phase 5 per-item-timer-expiry auto-advance path). **A second lock
call on the same question is rejected outright (403)** — this is the direct, literal
implementation of "rejects direct API re-edit of a past-answered item." Both submit routes
(`sections/[sectionId]/submit` and the flat `submit`) now read any `ItemLock` rows for the
attempt and use the locked response in place of whatever the client's bulk payload claims for
that question — defense in depth against a client that stops calling `/lock` partway through and
tries to smuggle a different answer through the final submit instead. **Live-verified**: locked
Q1 as correct, then submitted the section with a *tampered* payload claiming Q1 was wrong — the
recorded score used the locked (correct) value, not the tampered one.

This is scoped narrowly: the endpoint requires `exam.settings.isItemSequential === true` (400
otherwise) — every exam that doesn't use item-sequential locking is completely unaffected, the
`ItemLock` table stays empty for them, and the "no autosave, answers live client-side until
submit" property the Phase 5 force-finalize decision relies on **still holds exactly as before
for every exam except the ones that opt into isItemSequential**. Flagging this explicitly since
the brief said not to touch the Phase 5 cron/auto-finalize decision even tangentially: this
change does not touch that decision or any code path related to it — no cron was added, no
force-finalize behavior changed — but it's worth noting the *premise* ("answers never exist
server-side before final submit") is now scoped to "for non-sequential exams," in case that
premise is ever load-bearing for a future decision in that area.

### Flag-don't-guess items
- **Section weights not summing to 100% → block, don't auto-normalize.** Taken as stated in the
  spec (no ambiguity here — the spec's own default matches the conservative choice).
- **`isItemSequential` lock vs. Phase 5's per-item timer expiry on the same item → most
  restrictive wins (stays locked).** Implemented and verified: `handleItemExpire` (the timer-
  expiry auto-advance handler) now also calls the lock endpoint, so whichever mechanism advances
  past an item first locks it; the other one either finds it already locked (its own lock call
  simply 403s harmlessly, swallowed client-side) or the item was never re-editable to begin with.
  No test scenario exists where the item becomes re-editable after either trigger fires.

### Tests (`tests/unit/`, all new this pass)
- `item-lock-route.test.ts` (7) — lock/re-lock-rejected, not-applicable-when-not-sequential,
  ownership, attempt-already-submitted, wrong-exam/wrong-attempt's-pooled-question rejection.
- `submit-item-lock.test.ts` (2) — the defense-in-depth cross-check against the real submit
  route: a locked answer overrides a tampered client payload; a non-sequential exam never even
  queries `ItemLock`.
- `section-locking.test.ts` (6) — section-sequential lock rejects starting section 2 before
  section 1 is submitted (and allows it once section 1 really is submitted); section-weight
  validation blocks/allows exam start correctly, is skipped for non-sectioned exams, and never
  blocks resuming an already-existing attempt.
- Composite scoring's threshold-override case: **not duplicated** — already exists in
  `tests/unit/section-scoring.test.ts`, confirmed present and passing, additionally re-verified
  live this pass (see Live Verification below).

## Task 2 — AI Grading Override & Bulk-Approve

### Already implemented, unchanged this pass
- Single override endpoint (`POST /api/grading/answers/[answerId]`, Phase 3): confirm/override/
  regrade, `Answer.marksAwarded` only ever set by a teacher-authored row, append-only
  `AnswerGrading` audit log, `recomputeAttemptScore()` (handles both flat and sectioned attempts)
  called immediately after every mutation. Server-enforced grading rights already existed
  (institution scoping + per-exam teacher ownership, admin bypass) — just not extracted into a
  shared permission function the way `item-bank-permissions.ts` is; the new bulk-approve route
  duplicates the same 3-line check rather than introducing a new shared module, since that
  would have been a bigger change than this task needed.
- "Manually Modified" equivalent: the existing `gradingStatus: 'overridden'` enum value already
  serves this purpose exactly — no new field needed.

### Real gap #1 — bulk-approve did not exist at all, built
New `POST /api/grading/attempts/[attemptId]/bulk-approve`. Scoped per-attempt (matching the
existing per-student review page's own scope, not per-exam) — transitions every `ai_suggested`
(AI ran, never touched by a teacher) answer in that attempt to `confirmed` in one transaction,
capped at each question's max marks exactly like the single-confirm path, then calls
`recomputeAttemptScore()` **once** for the whole batch rather than once per item.

**Judgment call, flagged explicitly rather than guessed**: the spec says "already-overridden
items also finalize correctly, not excluded or double-processed." `overridden` answers are
**counted in the response but their marks/status are left untouched** — they already represent a
teacher's own specific, explicit decision (the exact "no auto-confirm, ever" principle Phase 3
was built around), and rewriting their `gradingStatus` to `confirmed` with the *AI's* original
suggested marks (discarding the teacher's chosen value) would be the literal double-processing
the spec warns against. The response shape (`{approved, alreadyFinalized, notReady, total}`)
makes this explicit rather than silently dropping them from the count. If the intended reading
was instead "flip `overridden` → `confirmed` too, but preserve the existing marks," that's a
small change (add a status-only `answer.update` for that branch) — flagged here for Haris's call
rather than picked silently.
- `pending_ai` (AI hasn't produced a suggestion yet) answers are reported as `notReady`, not
  silently skipped or errored.

### Real gap #2 — finalized (confirmed) answers accepted a second override/confirm/regrade, closed
`POST /api/grading/answers/[answerId]` had no check for `gradingStatus === 'confirmed'` before
processing any action — a second call would silently overwrite `marksAwarded`, append another
`AnswerGrading` row, and re-run `recomputeAttemptScore`. Fixed: `confirmed` now short-circuits
all three actions with a 409 and a message naming the actual gap (`"Reopening a finalized grade
is not yet supported"`).

**Flag-don't-guess, taken as the spec's own stated default**: this does **not** build a reopen
flow — per the spec, that's out of scope, flagged as a UX gap. **Narrower interpretation taken
deliberately**: only `confirmed` is blocked; an already-`overridden` (but not yet
confirmed/bulk-approved) answer can still be overridden again. `overridden` and `confirmed` were
already treated as equally "resolved" by the frontend's button-hiding logic
(`GradingPanel.tsx`'s `resolved` check), but the spec's own test wording ("**Finalized** items
reject further override attempts") ties the block specifically to the terminal state, and a
teacher changing their mind about their own override before anything is finalized is a
reasonable, common workflow this doesn't need to block.

### Frontend
- `GradingPanel.tsx` unchanged (override remains a marks input + live recompute via the existing
  `onChanged` callback — not converted to a click-a-cell UI; the spec's "click an alternative
  cell/option" phrasing is looser than what the existing single-numeric-input UI already does
  well, and rebuilding it wasn't necessary to satisfy the functional requirement).
- New "Approve All (N)" button on the per-student submission review page
  (`teacher/exams/[examId]/results/[studentId]/page.tsx`), shown only when there's at least one
  unmodified (`ai_suggested`) answer, calling the new bulk-approve endpoint and reporting the
  `{approved, alreadyFinalized, notReady}` breakdown back to the teacher.

### Tests (`tests/unit/`, all new this pass)
- `grading-override-route.test.ts` (10) — override recalculates and flags correctly (including
  capping above question max), grading-rights enforcement (student/wrong-institution/wrong-
  exam-teacher all rejected, admin allowed), and the finalized-rejection behavior for all three
  actions (confirm/override/regrade all blocked on `confirmed`; `overridden` still adjustable).
- `grading-bulk-approve-route.test.ts` (7) — the core scenario (2 `ai_suggested` approved, 1
  `overridden` + 1 `confirmed` counted-but-untouched, 1 `pending_ai` reported not-ready),
  marks-capping, a no-op case that skips the transaction/recompute entirely, and the same
  grading-rights matrix as the single endpoint.

## Live verification against Supabase (`rlbtdpnmdnaxlccelxdr`)

Ran a disposable, self-cleaning Playwright + Prisma script against a real local dev server (this
session again had direct Postgres egress via `DATABASE_URL`/`DIRECT_URL` when exported into the
shell before any module import) and a real student browser session:

- **Section-sequential lock**: starting Section B before Section A was submitted → **403**, live.
- **Item-sequential lock**: locking Q(a1), then attempting to lock it again → **403
  `item_locked`**, live.
- **Defense-in-depth**: submitted Section A with a *tampered* payload claiming the locked
  question's answer was wrong — the recorded score (2/2) used the locked correct value, not the
  tampered one.
- **Section-sequential resubmit**: resubmitting an already-submitted section → **409**, live.
- **Composite scoring / threshold override**: a real 2-section exam (60%/40% weight, 50%/90%
  passing thresholds) scored Section A 100% and Section B 50% — composite `100×0.6 + 50×0.4 =
  80%`, but Section B missed its 90% threshold, and the attempt's `overallResult.failed` was
  **`true`** despite the 80% composite — the spec's own worked example, live end-to-end, not just
  unit-tested.
- **RLS on `ItemLock`** (new table this session — added `SELECT`-only `authenticated` policy,
  scoped to the attempt's own student or a teacher/admin in the exam's institution): a real
  cross-institution teacher query for the exact same `ItemLock` row returned **empty**; the
  attempt's own student and the exam's own teacher both saw it. All 3 checks run via `SET ROLE
  authenticated` + `SET request.jwt.claims` against the live DB, not simulated.
- **`ExamSection`/`SectionAttempt` RLS status, confirmed via live query per the spec's explicit
  ask**: both still have `relrowsecurity = false` — they predate this session (built
  2026-07-09) and are not new tables from this phase, so per the guardrail ("any **new** table
  needs RLS") they were **not** brought into scope here; this is the same pre-existing SEC-08
  accepted-risk gap as most of the schema, now confirmed live rather than assumed. Flagging
  rather than silently expanding scope to fix it — narrowing SEC-08 further for these two
  tables would be a reasonable follow-up but wasn't part of this phase's brief.
- All disposable institutions/users/exam/sections/questions/attempt data (2 institutions, 3
  Supabase Auth users) deleted afterward; re-queried and confirmed `count = 0`.

## Verification

- `npx tsc --noEmit` → clean
- `npm run lint` → 3 errors / 1 warning, unchanged pre-existing baseline
- `npm run build` → passes, all routes present including the 2 new ones
  (`/api/attempts/[attemptId]/items/[questionId]/lock`,
  `/api/grading/attempts/[attemptId]/bulk-approve`)
- `npx vitest run` → **188/188 passing** (156 baseline + 32 new: 7 item-lock-route + 2
  submit-item-lock + 6 section-locking + 10 grading-override-route + 7
  grading-bulk-approve-route)

## Explicitly out of scope / untouched per the brief

- Cron/auto-finalize for expired client attempts (Phase 5) — not touched, no cron added. See
  Task 1's "real gap #2" note above for the one place its *premise* narrows (scoped to
  isItemSequential exams only) even though the decision itself is unchanged.
- Any item-bank permission ambiguity from `PHASE_6_PROGRESS.md` — not touched.
- The full AI rubric engine (nested rubrics, LLM evaluation, veto logic) and AI proctoring
  remain out of scope for this phase, as stated in the brief — this phase only touched the
  override/approval workflow around grades the existing Phase 3 AI grading pipeline already
  produces.
- No reopen flow for finalized (`confirmed`) grades was built — flagged as a UX gap per the
  spec's own instruction, not a decision made unilaterally.
- `GradingPanel.tsx`'s override UI was not redesigned into a click-a-cell interaction — the
  existing numeric-input + live-recompute UI already satisfies the functional requirement.
