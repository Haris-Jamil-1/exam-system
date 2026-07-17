# Phase 4 Fixes — Round 3 Progress (2026-07-17)

Third bugfix round from live/manual testing: exam auto-start, tab-lock enforcement, AI proctoring
gaze/audio tuning, teacher live-video feasibility, and a dashboard student count. Four items
fixed and live-verified; item 4 (live video) is a feasibility report only, per its own explicit
"stop for my decision" instruction — nothing was built for it.

268/268 vitest passing (253 baseline + ~15 net new, see below), `tsc` clean, `lint` at the
unchanged pre-existing 3-error baseline, `next build` clean. Live-verified against Supabase
(`rlbtdpnmdnaxlccelxdr`) via disposable, self-cleaning Playwright + Prisma scripts — including a
real exam attempt, real camera/mic-permission grants, and a real proctoring violation round-trip
through `POST /api/violations`, run against an actual **production build** (`next build && next
start`), not just dev mode (see Task 2's verification note for why that distinction mattered).

## 1 — Exam does not auto-start on the teacher side ✅

**Confirmed via research, not assumed**: `Exam.status` is a plain, manually-set DB column — no
cron, no trigger, nothing time-based flips `scheduled` → `live` when `startTime` arrives. The
**student**-facing side already handled this correctly and consistently (`getStudentExams`,
`getStudentDashboardData`, and the exam-taking page's own waiting-room all independently compute
"is this live now" by comparing `now` against `startTime`, matching this codebase's existing
`deriveInviteStatus` pattern for lazily-derived read-time status). The **teacher/admin** side had
no equivalent anywhere — every teacher/admin page rendered the raw DB `status` column directly,
so a scheduled exam whose time had passed just sat there labeled "Scheduled" with no Monitor
link, and `/teacher/monitor`'s live-exam list stayed empty until someone manually clicked "Go
Live Now."

**Fix**: new `src/lib/exam-status.ts`'s `computeEffectiveExamStatus(status, startTime, now)` —
pure, mirrors `deriveInviteStatus` — a `scheduled` exam whose `startTime` has passed reads as
`live`; every other status (including `draft`, which never auto-starts — that's an explicit
teacher action, not a scheduling state) passes through unchanged. Applied at every teacher/admin
read path that previously did a raw status passthrough: `mapExam()` in `src/lib/data/exams.ts`
(covers `getExams`/`getExamById`/`createExam`/`updateExam`, used by `teacher/exams`,
`teacher/monitor`'s exam list, and the exam edit page), plus the four separate inline mappings in
`src/lib/data/analytics.ts` (`getRecentExams`, `getApprovedExams` for `admin/exams`,
`getTeacherDashboardData`'s exam list, `getAdminDashboardData`'s exam list). Also added a matching
`activeExamWhere(now)` helper for the two raw `.count()` aggregate queries that compute the
"Active Exams" stat card (which can't run fetched rows through the mapper) — previously that
count only matched literal DB `status: 'live'`, so it also silently under-counted.

**Deliberately not built**: a cron that flips the DB column itself. This matches the codebase's
own established preference (see CLAUDE.md's Phase 5 entry: declining an auto-finalize cron for
dead attempts, "left for Haris to decide, not made unilaterally") — a purely read-time derivation
is smaller, has no lag/race-condition surface, and doesn't require deciding a cron cadence.

**Live-verified**: created a real `scheduled` exam with `startTime` 5 minutes in the past — the
teacher's exam list showed it as "Live", the teacher dashboard showed a "Monitor" action for it,
and the "Active Exams"/student-count stats reflected the same live DB data.

## 2 — Tab lock not enforced/logged ✅

**Root cause, confirmed by reading the code and git history**: `TabGuard.tsx`'s
`handleVisibilityChange` only called `buffer.emit(...)` (the one call that actually reaches
`POST /api/violations`) in the "tab became visible **again**" branch — the "tab became hidden"
branch only updated local Zustand UI state (`addViolation`, the on-screen warning toast), which is
never sent to the server. If a student switched away and simply never came back before the exam
ended (timeout, force-submit, or just closing the tab/browser), the violation was **never queued,
never flushed, never persisted** — not delayed, permanently lost. Confirmed via `git log -p` that
this is a regression from the Phase 3 proctoring rewrite (commit `050d8c9`); the pre-Phase-3
version logged synchronously on hide. `FullscreenGuard` (the sibling detector for fullscreen-exit)
never had this bug — it already emits immediately on the triggering event, which is the pattern
this fix adopts.

**Fix**: `TabGuard.tsx` now emits **immediately** when the tab becomes hidden — the violation is
never lost even if the student doesn't return. If the absence continues past the server's
high-severity duration cutoff (`deriveSeverity`'s `tab_switch: d > 15 → high`), a second
escalation event fires at 16 seconds so a long absence surfaces on the teacher's live monitor
while it's still happening, not only in hindsight on return. The escalation timer is cleared both
on return-to-tab and on component unmount (no leaked timers).

**Live verification — the most involved of this round, worth detailing since it surfaced a real
methodology pitfall**: a first attempt using two Playwright pages in the same browser context
(intending to simulate a real tab switch) never actually changed `document.visibilityState` at
all — confirmed via a standalone diagnostic that headless Chromium doesn't propagate real
OS-level tab-focus semantics across pages this way (neither opening a second page nor calling
`page.bringToFront()` on it changed the first page's visibility state). Switched to directly
dispatching a synthetic `visibilitychange` event with an overridden `document.visibilityState`
getter — this exercises the actual `TabGuard` listener code, just not genuine OS focus-loss.

That approach then appeared to fail against the **dev server** (`npm run dev`): extensive
step-by-step tracing (temporary debug logging added directly into `TabGuard.tsx` and
`event-buffer.ts`, later fully reverted — confirmed via `git diff` showing zero residual debug
code) proved the entire call chain executed correctly, but the specific `ProctoringEventBuffer`
instance `TabGuard`'s effect had closed over was a **second, already-disposed** instance — React
StrictMode's dev-only double-invoke-effects behavior had created two buffer instances, and the
active listener's closure held the stale, disposed one, whose `emit()` no-ops via its own
`disposed` guard. This is a well-known dev-only React behavior (StrictMode intentionally
mount→unmount→remounts effects in development to surface exactly this class of cleanup bug) that
**does not occur in production builds**. Re-ran the identical QA script against a real `next
build && next start` production server instead: exactly one buffer instance, the real
`POST /api/violations` request fired (`{"attemptId":"...", "events":[..., {"type":"tab_switch",
"severity":"medium", ...}]}` → `201 {"created":1,"skipped":0,"violationCount":1,"trustScore":95}`),
and the `Violation` row was confirmed via a direct DB query — all without the student ever
returning to the tab. Noted here in full because it's a real, reusable lesson for this repo: some
proctoring behavior can only be trusted when verified against a production build, not `next dev`.

## 3 — AI proctoring: false positives on normal movement, false negatives on real gaze/audio ✅

Research surfaced a clear, consistent pattern: **the false-positive-prone signal
(`multiple_faces`) had the shortest debounce and the loudest, most-immediate, duration-independent
response, while the two under-detecting signals (`gaze_away`, `audio_detected`) had longer/
zero-tolerance debounces and were structurally capped below the push-notification tier no matter
how long they persisted.** Six concrete, independently-justified changes:

1. **`src/lib/proctoring/gaze.ts`** — loosened the two geometry thresholds that were under-
   detecting real gaze-away: `HEAD_TURN_RATIO` 2.6→2.0 (was requiring an extreme ~30°+ head turn),
   iris-corner band `[0.2, 0.8]`→`[0.25, 0.75]` (was requiring the iris pinned almost fully into
   the corner). The "both irises must agree" requirement is kept (a single iris reading alone is
   still too noisy to trust without a webcam calibration step) — loosening that further was
   flagged in the research as a real option but was deliberately **not** taken this pass, since it
   changes the detector's fundamental shape (single-signal trust) rather than just its
   sensitivity; noted here as a candidate follow-up if the looser thresholds alone prove
   insufficient.
2. **`src/components/proctoring/FaceDetector.tsx`** — `gazeAway`'s required-consecutive-passes
   dropped from 4 (~8s) to 3 (~6s), reducing exposure to a single noisy frame resetting an
   otherwise-real streak to zero (a rolling-tolerance window was considered per the research but
   deferred as higher-risk shared-infrastructure surgery — see Known Gaps below).
   `multiFace`'s passes **raised** from 2 (~4s, the shortest debounce of any detector) to 3 (~6s,
   matching `no_face`) — this was the single largest source of movement-triggered false positives,
   given it's also hard-coded to `high` severity with an immediate snapshot + push notification.
   Added a MediaPipe confidence floor (`minFaceDetectionConfidence`/`minFacePresenceConfidence:
   0.6`, previously unset/~0.5 default) so a low-confidence transient "second face" (motion blur,
   an arm passing near the face) is filtered before it ever reaches the episode counter. Also
   fixed a genuine, unrelated-to-tuning gap: `gaze_away` never called `addViolation()` at episode
   open, unlike every other detector — it reached the server but never showed the student their
   own on-screen warning toast. Fixed to match the established pattern.
3. **`src/components/proctoring/AudioMonitor.tsx`** — default `threshold` lowered 0.05→0.035 (a
   fixed, uncalibrated energy floor that easily missed quieter/more-distant talking; `SUSTAIN_MS`
   left unchanged at 5s so a brief cough still never flags). Also closed the same class of bug
   found in Task 2: an audio episode that was still open when the exam ended (unmount) was
   silently discarded — the interval was cleared and the mic stream stopped with no flush. Added
   an unmount-time flush, mirroring `FaceDetector`'s existing `finalize()`-on-unmount pattern.
4. **`src/lib/proctoring/severity.ts`** — `gaze_away` and `audio_detected` were structurally
   capped at `medium` forever (`d > 20`/`d > 15` → `medium`, no higher tier existed at all) —
   confirmed this meant a genuinely persistent violation of either type could **never** reach the
   `high` severity that gates the teacher's push notification (`useMonitorRealtime`'s
   `onHighSeverity` trigger is purely `severity === 'high'`, not type-filtered, so this change is
   sufficient on its own to make sustained cases page the teacher). Added a `d > 60 → high` tier
   to both.

**Explicitly not changed**: `no_face`/`multiple_faces`/`phone_detected`'s own thresholds, and the
`ConditionEpisode` class's core consecutive-pass logic (shared by 5 detector instances) — scoped
tightly to the two signals the task named as under-detecting plus the one named as over-
triggering, rather than re-tuning everything touching this system.

**Verification**: this is inherently the hardest item to verify end-to-end — there's no way to
feed a scripted "real sustained gaze-away" or "real background talking" signal into MediaPipe/VAD
running against a synthetic/fake camera and microphone; that would require an actual human sitting
in front of a real camera. Covered by: (a) direct unit tests against the pure threshold/severity
functions confirming the exact before/after numbers (`tests/unit/proctoring-gaze.test.ts`,
extended `tests/unit/proctoring-severity.test.ts`), and (b) a live smoke check confirming the
proctoring components (including the newly-tuned ones) mount and run for a full exam session with
zero uncaught page errors. **Full behavioral verification of detection accuracy needs a human
QA pass with a real camera/microphone in a real browser** — flagged explicitly rather than
claimed as done, since a script cannot honestly verify "does this correctly detect a person
looking away."

## 4 — Teacher live video during proctoring — investigated only, not built, per explicit instruction

**Confirmed definitively: no live video feed exists in any form today.** The teacher-facing
monitor page has no `<video>` element, no WebRTC/SFU code, and no media-streaming dependency
anywhere in `package.json` (checked explicitly for `simple-peer`, `livekit`, `agora-rtc-sdk`,
`daily.co`, `twilio-video`, `mediasoup`, `socket.io` — all absent). `getUserMedia` exists solely to
feed **local, on-device** MediaPipe/COCO-SSD inference and VAD on the *student's own* machine —
frames never leave the device except as an occasional still-JPEG snapshot (see below). This isn't
an oversight; it's a documented, deliberate architecture decision: `docs/phase3/04-live-
monitoring.md` explicitly states "Always-on video for N concurrent students means WebRTC + an SFU
— meaningful infra cost and complexity, and it contradicts [the] events-not-media privacy
posture," and names the one path considered if live video is ever wanted: **WebRTC via LiveKit
Cloud, one student at a time on teacher click, never a grid of videos** — marked out of scope for
Phase 3, never started.

**What exists instead today** (already shipped, not part of this task): an on-demand **single-
frame snapshot** mechanism — teacher clicks "Request snapshot" → a `MonitorDirective` row is
created → the student's browser (already running locally) captures one frame from its already-
open camera feed to a canvas → uploads it as a JPEG to private Supabase Storage → the teacher
polls until fulfilled and views it via a 10-minute signed URL. Round trip is a few seconds, not
continuous, with a visible on-screen "📸 Snapshot captured" indicator on the student's side by
design (transparency/deterrence, not covert capture). Also present: a live-updating violation
feed, trust score, heartbeat-based disconnect detection, warning/force-submit directives, and a
Live/Polling transport indicator — none of which are video.

### Options, for your decision — nothing built pending this

1. **Do nothing / keep on-demand snapshots as the ceiling.** Zero new cost or infra. Current
   mechanism already gives a teacher visual confirmation within a few seconds of asking; the
   trade-off is it's a single frame, not continuous, and only available on request.
2. **One-student-at-a-time live view via a hosted WebRTC/SFU service** (LiveKit Cloud is what the
   existing architecture doc names, but Twilio Video/Agora/Daily.co are equivalent options) —
   teacher clicks a student's tile to open a live stream just for that one student, closes it when
   done. Never an always-on grid of every student's camera. This is a genuinely new subsystem: a
   signaling/media server dependency, new client-side WebRTC publish code on the student's exam
   page, a new "start/stop my stream for the teacher" permission gate, and real per-minute hosting
   cost that scales with usage (unlike the current snapshot mechanism, which only costs storage +
   one request).
3. **More frequent automatic snapshots** (e.g., every 30–60s instead of only on-demand) as a
   middle ground — no new infra, meaningfully closer to "can see what's happening" without the
   cost/complexity/privacy trade-offs of continuous video. Still not live video, but a real,
   cheap, buildable step if the actual need is "closer to real-time visibility" rather than
   specifically "watch a live stream."

**Flagged explicitly, not guessed at**: which (if any) of these is wanted, and if option 2, whether
"one student at a time, teacher-initiated" is an acceptable scope or whether something broader was
expected. No code was written for this item.

## 5 — Total student count not displayed on the dashboard ✅

**Root cause — the same class of bug found and partially fixed in round 2's Students-tab
work, just not caught in every location it existed**: the teacher dashboard's "Total Students"
stat card (and its `/api/analytics`-backed twin, `getDashboardStats`) computed the count via
`prisma.teacherStudent.count({ where: { teacherId } })` — the older direct-invite-only join table.
A student who joined through the newer per-class invite flow only ever gets a `ClassEnrollment`
row, never a `TeacherStudent` row, so **any teacher whose roster is entirely class-based saw
"Total Students: 0"** — which reads as "not displayed" for exactly the reason this task named it
that way, even though the stat card itself was technically rendering (round 1/2 both already
verified the card exists in the UI; the number itself was just silently wrong/zero). Round 2 fixed
this specific bug in `getStudents()` (the Students-tab roster) but the dashboard's own separate
count queries (`getDashboardStats`, `getTeacherDashboardData`) were never touched and still had
the old bug.

**Fix**: new shared `teacherStudentCountWhere(teacherId)` helper (same union-of-relations shape as
round 2's `getStudents()` fix) applied to both dashboard stat functions. Also fixed the "Active
Exams" count in the same two functions while in the area, since it had the identical class of bug
relative to Task 1 (a scheduled-but-past-startTime exam wasn't counted as active) — added the
matching `activeExamWhere(now)` helper.

**Live-verified**: a teacher with a student enrolled *only* via `ClassEnrollment` (no
`TeacherStudent` row at all) now shows a real, non-zero "Total Students" count on their dashboard,
confirmed both via the rendered page and a direct DB re-query of the exact same query shape.

## Tests added (items 1, 3, 5 per the explicit ask)

- `tests/unit/exam-status.test.ts` (6) — `computeEffectiveExamStatus`, including the
  draft-never-auto-starts and inclusive-boundary cases.
- `tests/unit/proctoring-gaze.test.ts` (6) — `readGaze` against synthetic MediaPipe-shaped
  landmark arrays, confirming the loosened thresholds actually catch cases the old ones missed
  (and that the "both irises must agree" safeguard is untouched).
- `tests/unit/proctoring-severity.test.ts` (+1 new case, extending the existing file) — the new
  `gaze_away`/`audio_detected` high-severity duration tier.
- `tests/unit/teacher-dashboard-student-count.test.ts` (2) — mocked-Prisma confirmation that both
  the student-count and active-exam queries now use the corrected relation/time-aware shape.

## Live verification summary

All against Supabase (`rlbtdpnmdnaxlccelxdr`), disposable and self-cleaning (every script printed
"Cleanup done." on completion, confirming teardown succeeded while the DB connection was live —
see the note below about a transient connectivity gap encountered only *after* all QA runs had
already completed and cleaned up):

1. **Exam auto-start** (Task 1) — a real `scheduled` exam with a past `startTime` correctly shows
   "Live" on `/teacher/exams` and a "Monitor" action on the teacher dashboard.
2. **Tab-switch logging** (Task 2) — full real exam session (real Supabase accounts, biometric
   onboarding, camera/mic permissions, a real `ExamAttempt`), verified against a **production
   build** specifically (dev-mode StrictMode double-mounting made this initially look broken —
   see Task 2 above for the full investigation): a synthetic tab-hide produces a real
   `POST /api/violations` → `201`, and the `Violation` row exists in Postgres, without the student
   ever returning to the tab.
3. **Dashboard student count** (Task 5) — a class-only-enrolled student is now correctly counted
   and displayed, confirmed both via the rendered dashboard and a direct DB query.
4. **Proctoring mount smoke check** (Task 3) — the exam page with all four proctoring detectors
   (including the newly-tuned ones) runs a full session with zero uncaught errors; full detection-
   accuracy verification needs a human with a real camera, as noted above.

**Post-QA connectivity note**: after all live QA runs completed successfully, a routine final
"confirm zero leftover rows" re-check hit a transient `Can't reach database server` error — this
matches a previously-documented, known-intermittent pg-egress condition in this environment (see
project memory), not a new issue, and every QA script's own cleanup step had already completed
and printed confirmation before this occurred.

## Verification

- `npx tsc --noEmit` → clean.
- `npm run lint` → 3 pre-existing baseline errors (`useExamTimer.ts`, `invite/[token]/page.tsx`,
  `exam/[examId]/page.tsx`, all predate this session), 0 warnings.
- `npm run build` → compiles cleanly (re-confirmed after fully reverting all temporary debug
  instrumentation added during Task 2's investigation — `git diff` shows zero residual debug
  code).
- `npx vitest run` → 268/268 passing.
- Live-verified against Supabase per the summary above.
