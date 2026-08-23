# ExamPro (now Evalix) — AI-Proctored E-Testing Platform

> **Note (2026-07-19 close-out):** all per-session `*_PROGRESS.md` / QA files, the
> `docs/phase3/` design docs, and `tests/README.md` referenced in the Session Log below were
> removed in the repo cleanup — retrieve them from git history if needed (as are
> `CORRECTIONS.md` and the `CLEANUP_PROGRESS.md` run log, removed by Haris afterward).
> Current documentation lives entirely in `docs/`: `README.md` (platform intro + user
> guide, also the GitHub repo homepage), `ARCHITECTURE.md`, and `FEATURES.md`.
>
> **Note (2026-08-22):** this file was recondensed (was 161k chars, well past what's useful to
> load every session) — same content, tighter prose. Per-entry `tsc`/`lint`/`vitest`/`build`
> verification boilerplate was dropped from the Session Log (it was nearly identical every time —
> "clean baseline, N/N passing"); the current numbers live in **Build Status** below. What's kept
> per entry: what shipped, the file/table names, judgment calls flagged to Haris and what was
> decided, root causes of real bugs, and known gaps. If a future session needs the exact
> verification trail for a specific date, `git log` on that day's commit has it.

## Session Log

### 2026-08-12 (cont'd) — Real TURN relay: Cloudflare Realtime credentials for teacher live-video ✅

Replaced the same day's STUN-only-by-default scaffolding with a real Cloudflare Realtime TURN
integration once Haris supplied credentials. Verified the API contract live via `curl` before
writing code: `POST https://rtc.live.cloudflare.com/v1/turn/keys/{TOKEN_ID}/credentials/generate-ice-servers`
returns a fresh short-lived TURN `username`/`credential` per call — there's no static value to
drop into an env var, and the API token itself must never reach the browser (it can mint
credentials against the whole Cloudflare account). Removed `buildIceServers()`/
`NEXT_PUBLIC_TURN_*` entirely. New server-only `src/lib/webrtc-turn.ts` calls Cloudflare via
`CLOUDFLARE_TURN_TOKEN_ID`/`CLOUDFLARE_TURN_API_TOKEN` (deliberately no `NEXT_PUBLIC_` prefix),
strips `:53` URLs (Cloudflare flags that port as commonly browser-blocked), returns `null` on any
failure. New authenticated `GET /api/webrtc/turn-credentials` exposes it; `fetchIceServers()`
falls back to STUN-only on failure — a TURN outage degrades reliability, never blocks the call.
Credentials are minted fresh per connection attempt (not cached) in both `WebRTCBroadcaster.tsx`
and `useWebRTCViewer.ts`; both re-check `activeViewerId`/`viewerIdRef` after the new `await` point
to guard a race that couldn't exist before (everything was synchronous) but can now that setup
awaits a network round trip. 9 new tests (mocked `fetch`). Real credentials added to Vercel
Production env, marked Sensitive. **Known gap**: no live two-browser WebRTC session run through
the actual relay (needs a real cross-NAT network to meaningfully exercise TURN at all).

### 2026-08-12 (cont'd) — Assign/duplicate exam to another section; edit-screen schedule fields; mid-exam end-time extension ✅

- **"Assign to Another Section" = clone, not link** — flagged and decided explicitly: every
  subsystem (results, monitor, grading, eligibility) assumes one `Exam` ↔ one `Class` ↔ one
  window; linking would need class-scoping added everywhere, cloning needs none of it. New
  `duplicateExam()` (`src/lib/data/exams.ts`) deep-copies the Exam + `ExamSection`s + fixed
  `Question`s (never pooled ones — `attemptId: null` filter) + `Option`s in one transaction,
  remaps section ids, resets status/approvalStatus to new-exam defaults, requires a fresh
  start/end time. Attempts/answers/violations/enrollments/directives are never copied.
- **Edit-screen Start/End/Duration** — new "Schedule" card (`DateTimeField` extracted from the
  wizard into `src/components/shared/` so both share one implementation). Restricted to
  draft/scheduled exams client- and, since it had **no guard at all before this** (any owning
  teacher could `PUT` new schedule fields onto a live/completed exam), server-side in
  `PUT /api/exams/[examId]`, scoped only to requests touching `startTime`/`endTime`/`duration`.
- **Mid-exam end-time change, real-time to students** — new `PATCH /api/exams/[examId]/end-time`
  (the one narrow, audited exception to the block above, live-only). Requires `newEndTime > now`;
  a value earlier than the current end time is allowed per spec but needs a second confirm click.
  Writes an `ExamTimeChange` audit row (RLS SELECT-only) and a `time_extended` `MonitorDirective`
  for every `in_progress` `ExamAttempt`, reusing the existing directive pipeline. Student page
  resyncs `exam.endTime` and pushes a recomputed `initialSeconds` into `useExamTimer` (verified the
  hook resets in either direction by reading it directly, not trusting its own comment). Already-
  submitted attempts never receive a directive (query only touches `in_progress`), and nothing in
  the codebase re-touches a finalized attempt on an `Exam` field change (confirmed via the
  submit/force-finalize routes, both gate on `status === 'in_progress'`). Monitor page shows the
  most recent change inline via `GET` on the same route.
- **Known gap**: no live browser QA (real duplicate-and-reassign flow, real two-browser
  teacher-extends/student-sees-it-live session).

### 2026-08-12 — Proctoring module: ID verification removed, exam-start photo reaches the teacher, staleness fixed, gaze evidence, TURN-configurable WebRTC ✅

Five-item punch list.

- **ID document verification removed** — gate is now face-only (`webcam → verified`, was
  `webcam → id → verified`). `src/lib/face-verification.ts` dropped `analyzeIdPhoto`/
  `faceMatchDistance`/`isSamePerson`/`FACE_MATCH_THRESHOLD`; `analyzeLiveFace` only confirms one
  sufficiently large live face. Deleted 2 of 3 self-hosted model weight sets (~6.4MB, now unused)
  from `public/models/face-api/`.
- **Exam-start photo now reaches the teacher** (previously captured into React state and
  discarded). `BiometricOnboarding` uploads the verified capture via `/api/upload` (folder
  `verification`), passed up through `onComplete`, carried in a ref (attempt row doesn't exist
  yet), included in `POST /api/attempts`'s body, persisted to new
  `ExamAttempt.verificationPhotoUrl` after re-verifying the path's userId matches the caller.
  `/api/evidence` gained an `attemptId` branch; `StudentActionsModal` gained a "Verification
  photo" button, available regardless of attempt status. Deliberately not purged on finalization
  like violation evidence (identity review may be needed post-grading) — swept by the existing
  30-day cron instead, keyed off `startedAt`.
- **Violation/trust-score staleness on the live monitor, root-caused**: both monitor pages stored
  a **frozen snapshot** (`viewing: MonitorStudent | null`, set once at click time) instead of an
  id, so the modal's tiles froze at open-time while the violations timeline below (fed from
  separate live `feed` state) kept updating. Fixed by holding only `viewingId` and deriving
  `viewing` at render time from the already-refreshing `students` array — one source of truth.
- **`gaze_away` evidence capture added**, mirroring the existing `no_face`/audio pattern exactly
  (same `captureSnapshot()`, same upload/retrieval path).
- **WebRTC TURN made configurable, one automatic reconnect added — did not silently pick a
  provider**. Root cause: STUN-only can't relay through a blocking firewall/symmetric NAT,
  exactly what real student networks hit that a dev machine never does. Asked Haris directly per
  this repo's established pattern; he chose "make it configurable for now." `ICE_SERVERS` built
  from `NEXT_PUBLIC_TURN_URL`/`_USERNAME`/`_CREDENTIAL` (all-or-none, STUN fallback), exported as
  `buildIceServers()` (later replaced by the Cloudflare integration above). `useWebRTCViewer` no
  longer declares a dropped connection dead immediately — a native `disconnected` state gets a 6s
  grace window, then one automatic reconnect (close + re-send `request` over the still-subscribed
  channel); only one retry per drop.
- **Known gap**: no live browser/camera QA this module is inherently network/camera-dependent in
  a way `tsc`/`lint`/`vitest` can't cover.

### 2026-08-10 (cont'd) — Dedicated `/super` login page; role cleanup for the platform owner's account ✅

`/super` is now a real login page, not an authenticated-only view. Added to `middleware.ts`'s
`PUBLIC_PREFIXES`; `src/app/super/page.tsx` (async Server Component) branches: no session →
`SuperLoginForm`; session but `!isSuperAdmin` → denial message; `isSuperAdmin` → the panel
(`SuperAdminPanel.tsx`). **Explicitly role-based** — same `getAuthUser()` → `User.isSuperAdmin`
DB flag every `/api/super/*` route already used, never email-based. Account cleanup: Haris's own
account had `role: 'teacher'` + `isSuperAdmin: true`; per his call (offered a real `super_admin`
enum value, he picked the lower-risk option) `role` → `'admin'`. **Found and fixed a separate
staleness bug**: Supabase Auth's own `user_metadata.role` (what `middleware.ts` reads, independent
of the Prisma column) still said `"teacher"` — updated via `adminSupabase.auth.admin.updateUserById`.
Confirmed live: logged-out `curl` to `/super` returns 200, not a redirect.

### 2026-08-10 — Real WYSIWYG editor (Quill) replaces the lightweight markup toolbar; RTL fixed app-wide; hierarchical rubric editor ✅

Follow-up reversing an earlier same-day RTE decision — Haris asked for a real WYSIWYG editor
instead of the lightweight markup toolbar just shipped, with the scoring/prompt/dedup fixes that
choice requires.

- **Quill editor** (`src/components/rich/QuillEditor.tsx`, lazy-loaded) replaces
  `MathTextarea`/`MathInput` for Question Stem and answer-option-shaped fields. Explanation and
  fill_blank/short_answer's correct-answer field deliberately stay plain-markup (the latter is
  compared byte-for-byte against a student's typed answer — HTML would only add risk).
- **No schema change** — `RichText.tsx` gained `looksLikeRichHtml` (does content start with a
  real Quill block tag?) to distinguish Quill-authored content from everything written before
  Quill existed; non-matching renders via the unmodified prior pipeline, matching content is
  DOMPurify-sanitized and rendered via `dangerouslySetInnerHTML` (first use in this codebase).
- **Math/Chemistry reuse `MathInputDialog`** via a custom Formula blot that deliberately does
  NOT use Quill's stock formula module — that module calls `katex.render()` with no `trust`
  option, a real unpatched XSS surface (`\href{javascript:...}` would execute in-editor). The
  custom blot stores raw LaTeX + display-mode as data attributes and re-renders through the
  already-hardened `MathSegment`/`katex-loader.ts` (`trust: false`).
- **`img src` restricted to this app's own upload bucket** (`sanitize-html-loader.ts`) — a
  `uponSanitizeAttribute` hook requires the URL match the public `item-assets` bucket, closing a
  tracking-pixel/beaconing risk the tag/attribute allowlist alone didn't cover. 6 new tests.
- **Scoring/prompts/dedup made HTML-aware**: new `stripHtml()` applied to `scoring.ts`'s
  ordering/matching comparisons, both Claude grading prompts, the pg_trgm dedup query (wrapped in
  `regexp_replace` — flagged: drops GIN-index usage, acceptable at current scale), and the
  min-length check. CSV import now `escapeHtml()`s imported stems.
- **Real bug found during live QA, unrelated to the RTE decision**: Radix `Tabs`/`Select` default
  their own internal `dir` to `"ltr"` regardless of `html[dir]` — broke RTL app-wide, not just the
  Item Bank page the original ticket named. Fixed with `DirectionProvider` in `layout.tsx` + an
  `npm overrides` pin (`@radix-ui/react-direction: 1.1.2` — several Radix packages hard-pin that
  version, so without the override npm installed a second disconnected copy and the fix was
  silently a no-op until diagnosed).
- **Also found and fixed live**: `QuillEditor`'s format-sync handler crashed with no active
  selection; the Matching dropdown clipped long text with no ellipsis.
- **Hierarchical rubric editor** (`src/lib/rubric.ts` + `RubricEditor.tsx`) for essay items — the
  existing UI was a fully static disconnected table, and separately `createItem()` never wrote
  `rubric` to Prisma at all regardless of caller — both fixed. Supports custom dimensions, one
  level of sub-dimension nesting, real-time weight validation, an AI-auto-grade toggle; compiles
  to the existing flat `RubricCriterion[]` shape so the grading pipeline needed no changes. **Not
  live-browser-verified** this session.
- Trust score formula/color-coding unified across every view (was two formulas + four inline
  color schemes). Per-attempt evidence now auto-purges on exam finalization too, not just the
  30-day cron.
- Live QA used the repo's disposable-fixture pattern against the only available (production)
  Supabase project, fully torn down after.
- **Known residual**: one low-severity unpatched-upstream Quill advisory (its own HTML-export
  feature), mitigated by DOMPurify sitting downstream of everything Quill produces.

### 2026-08-05 — Parallel batch: upload UI, upcoming-exams fix, proctoring device gate, performance/staleness ✅

Four workstreams as isolated git worktrees, integrated together (one merge fix needed).

- **Item-bank AI upload UI** — upload moved to a centred drop-zone button; a single `sourceReady`
  gate backs both the button and Generate so either an upload or pasted text suffices, neither
  requires the other. Extraction failures now name their cause instead of a bare
  `catch { setDocText('') }` that silently disabled Generate with no explanation.
- **Student dashboard "Upcoming Exams" was empty — third recurrence of the roster bug class.**
  `getStudentDashboardData` resolved the roster from `TeacherStudent` only (no `ClassEnrollment`
  branch, no `Exam.classId` check) — a class-invite student saw nothing, while the same exams
  listed correctly on `/student/exams` (whose `getStudentExams` already had the right `OR`). The
  gap also leaked class-scoped exams to every one of the teacher's students. Separately, the
  "Upcoming Exams" **stat was structurally always 0** — it counted `ExamEnrollment` rows with a
  future `startTime`, but that row is only created on attempt *start*, which the route rejects
  before `startTime`. Fixed at the root: `studentVisibleExamWhere()` is now the Prisma WHERE twin
  of `isStudentEligibleForExam()`, both read paths use it. 8 new tests, confirmed failing 5/5
  pre-fix.
- **Proctoring device gate** — new `src/lib/proctoring/media-readiness.ts` (pure) +
  `useMediaReadiness.ts` + `MediaCheckGate.tsx`. Requires camera **and** mic and proves the
  streams are genuinely live (non-zero video dimensions + advancing playback position; readable
  audio analyser), not merely permitted. Failures classified specifically (denied/dismissed/no
  device/in use/insecure context/unsupported). Re-verifies at click time, so revoking permission
  or unplugging a webcam after page load is caught. **Found and fixed a real pre-existing privacy
  bug**: a non-proctored exam still called `getUserMedia` — `setExam()` runs before an awaited
  questions fetch while `biometricDone` is still false, so `BiometricOnboarding` mounted
  transiently and grabbed the camera; **this invalidates the 2026-07-09 note claiming that path
  was verified clean**. Never gates a running attempt (switches off at `instructionsDone`).
- **Performance/staleness** (53 files) — new `src/lib/session.ts`, `data-refresh.ts`,
  `useServerData.ts`, `data/page-data.ts`. *Staleness root cause*: every dashboard page is
  `'use client'` loading once into `useState` — data never passes through the RSC payload or
  `fetch()`, so `revalidatePath`/`router.refresh()` have nothing to invalidate. Fixed with a
  client invalidation bus (mutations call `invalidateData()`, subscribers refetch, plus a 15s
  refocus window). *Slow-load root causes*: (1) React serializes Server Actions —
  `Promise.all` of four actions issues four *sequential* POSTs (proven by request timeline,
  zero overlapping pairs); (2) `supabase.auth.getUser()` (~300ms round trip) paid in middleware
  AND layout AND 8 duplicated session helpers, each plus a ~200ms Prisma lookup — replaced by
  local ES256 JWT verification via `getClaims()` against a cached JWKS (~1ms), memoised per
  request; (3) two real N+1s. Authorization unchanged. **Negative finding**: indexes are NOT the
  problem — `EXPLAIN` shows a 0.190ms index scan while the Prisma call takes 345ms; cost is
  round-trip count × latency. Local timings (median of 3, local not prod cold-start):
  `/teacher/analytics` 5934→841ms · `/admin` 3890→1341 · `/admin/exams` 3611→839 ·
  `/admin/users` 3066→225 · `/student` 627→42.
- **Integration fix** — zero merge conflicts across all four branches, but the suite then failed
  5 tests: dashboard tests mocked `auth.getUser` while the perf work moved identity to
  `auth.getClaims`. A clean textual merge is not proof of a working merge.
- **Known gap, explicitly accepted by Haris before deploy**: the proctoring gate was never tested
  on real hardware (unplugged webcam, OS-level muted track, lens shutter, real competing app,
  revoked permission). Denials were simulated by throwing the correct `DOMException` names.

### 2026-08-04 — Math & chemistry in question content (KaTeX + mhchem + MathLive), no schema change ✅

Audited first: no rich-text editor existed at all (no TipTap/Quill/Slate, zero
`dangerouslySetInnerHTML`); stems/options are plain `String` columns. **The brief's "migrate to
TipTap" fallback was declined and justified in writing** — TipTap would force `stem` to HTML/JSON,
breaking `scoring.ts`'s option-text equality, both Claude prompt paths, pg_trgm dedup, search
filters, CSV import and `line-clamp` previews, for bold/italic/lists — a different feature than
math/chemistry. Haris confirmed the lighter scope.

- **Storage unchanged** — no migration. LaTeX lives inline as `$…$`/`$$…$$`/`\(…\)`/`\[…\]`,
  chemistry as mhchem's `\ce{...}` inside those. Every pre-existing row parses to one text
  segment and renders exactly as before.
- **One renderer everywhere** — `src/components/rich/RichText.tsx`. Fast path: content with no
  delimiters renders as a plain text child, never loads KaTeX.
- **Currency is the real backward-compat hazard, handled**: `$…$` only opens when the next char
  isn't whitespace and only closes when the previous char isn't whitespace *and* the next isn't a
  digit — `"costs $5 and $10"` stays literal, `"Solve $2x + 1 = 7$"` renders. 23 unit tests.
- **Authoring** — `MathTextarea`/`MathInput` wrap the existing primitives with an insert-at-caret
  toolbar plus live preview. Math mode drives a MathLive `<math-field>`; chemistry mode wraps
  plain mhchem notation in `\ce{...}`. LaTeX source stays visible/editable per Haris's call.
- **XSS**: no new HTML-injection path — text segments are React children (escaped); LaTeX goes to
  KaTeX as a source string with `trust: false` (disables `\href`/`\url`/`\includegraphics`).
  `dangerouslySetInnerHTML` stays at zero occurrences repo-wide.
- **Lazy loading verified against the build**: KaTeX (296KB) and MathLive (821KB) each land in
  their own async chunk, confirmed absent from `build-manifest.json`'s eager lists.
- **Real bug found and fixed via live QA**: the exam edit page's inline stem editor `await`ed the
  server round trip before updating the controlled value, so every character typed while a save
  was in flight got echoed away by the stale prop. Now updates local state immediately, debounces
  the save (600ms), flushed on blur.
- **Observed but not fixed (pre-existing, unrelated)**: `/teacher/items/[bankId]` overflows at
  390px (measured with zero KaTeX nodes — not math-related); proctoring bundle 404s on
  `tfjs-backend-wasm-simd.wasm`.
- **30/30 live checks** via a disposable Playwright + Prisma script against a fresh production
  build. **Known limitations at first pass** (mostly closed by the same-day follow-up below):
  matching `<select>` couldn't render math, AI generation didn't emit LaTeX, no keyboard shortcut,
  no print handling, bank page mobile overflow. Still open: students can't author math in their
  own free-text answers (deliberate scope), no print/PDF export route.

### 2026-08-04 (cont'd) — math/chem follow-ups: AI emits LaTeX, matching dropdowns render math, shortcuts, print, mobile overflow ✅

- **AI generation now emits LaTeX** — `buildSystemPrompt` gained a `NOTATION_GUIDANCE` block
  (delimiters, mhchem for chemistry rather than bare `H2SO4`, literal currency escaped as `\$`).
  7 tests pin the guidance plus the pre-existing prompt contract.
- **Matching dropdowns render math** — native `<select>` replaced with the app's Radix `Select`
  (its `SelectItem` already wraps children in `ItemText`), so a math/chem choice renders
  identically in the list and the closed trigger.
- **Keyboard shortcuts** — `Ctrl/Cmd+M` opens the equation dialog, `+Shift+M` the chemistry one,
  on every math-enabled field. Deliberately not platform-detected (reading `navigator` during
  render breaks the React Compiler purity rule) — both modifiers named instead.
- **Print** — `@media print` rules make display-math containers `overflow: visible` and wrap
  instead of scroll, keep expressions from splitting across page breaks, force
  `print-color-adjust: exact` on KaTeX glyphs.
- **Mobile overflow fixed at the shared-component level**: `PageHeader` stacks below `sm` with
  `min-w-0` on the title; `TabsList` gained `max-w-full overflow-x-auto` — fixes all four tab
  strips in the app at once. Measured at 390px: `scrollWidth` 960 → 588 → 390 (== clientWidth).
- **15/15 live checks** on a second disposable fixture (matching question with math/chem on both
  sides) against a fresh production build.

### 2026-07-20 (cont'd) — "Start without verification" escape hatch, teacher notified ✅

Students can bypass the face/ID gate via an understated "Start without verification" link (also
covers broken cameras/model-load failures — softens the fail-closed judgment call from earlier
that day), with an explicit warning the teacher will be told. New `unverified_start`
ViolationType. The gate can't log it directly (no attempt row exists yet) — the exam page carries
the skip in a ref and posts one violation right after `POST /api/attempts` succeeds (best-effort,
never blocks the start). Server-side severity always `high` (push-notification tier), trust score
takes a one-time 12-point deduction (`base 8 × high 1.5`, structurally can't stack).

### 2026-07-20 — Real face↔ID matching, auto-derived exam duration, mobile UI pass, notification cleanup ✅

- **Biometric gate now actually verifies** (was a flagged simulated flow) — new
  `src/lib/face-verification.ts` using `@vladmandic/face-api` (SSD MobileNet + 68-landmark +
  128-d recognition), self-hosted in `public/models/face-api/` (~12MB, no external calls). Face
  capture must contain exactly one sufficiently large live face; ID capture exactly one
  card-photo-sized face (a live face in the ID frame is rejected by a box-height heuristic,
  blocking the show-your-face-twice bypass); embeddings must match at threshold before "Start
  Exam" unlocks. **Threshold calibrated against live QA, not guessed**: a first-draft 0.65 was
  demonstrably unsafe — a real different-person pair measured 0.621 against the production build's
  served weights (same-person 0.16) — so 0.6 stands. Model load failure fails **closed** (flagged
  judgment call — an open gate would defeat the feature). Still out of scope client-side: OCR of
  ID text, document authenticity, anti-spoof liveness.
- **Exam duration auto-calculated** — derived from the start/end window
  (`src/lib/exam-duration.ts`, pure, 7 tests), validated ≥5min on both client and server, **derived
  server-side in `createExam`** so a client-sent value is never trusted.
- **Mobile UI pass** — notification dropdown was a fixed 360px panel (now a full-width sheet under
  the topbar on <sm); several fixed-column grids (wizard, SectionsManager, Add Question row,
  AiGeneratePanel, CLO form) now `grid-cols-1 sm:grid-cols-N`; 9 dashboard tables without a scroll
  container got `overflow-x-auto` wrappers.
- **Bell panel** — `window_blur` violations no longer shown (low-signal companion of tab_switch,
  was drowning the panel); violation types render friendly labels instead of raw enum text.

### 2026-07-18 — Proctoring system fixed: every detector now actually fires; fullscreen enforced; biometric gate shows the real camera ✅

Bug report: all vision detection + background noise never produced a violation, fullscreen exit
was log-only, window_blur duplicated real tab-switches, biometric capture never showed the
person/ID. Diagnosed each root cause against a fresh production build before patching.

- **The vision killer was one line of middleware**: `/models` wasn't in `PUBLIC_PREFIXES`, so
  every authenticated in-exam fetch of the self-hosted model assets was role-redirected to
  `/student` (HTML) — MediaPipe's wasm loader threw, coco-ssd got HTML for `model.json`, both
  silent catches nulled the models. Face/multi-face/gaze/object detection had been structurally
  dead in every authenticated context (dev AND prod) since Phase 3 shipped — exactly why only
  tab-switch (no assets) worked, and why Phase 3's "deferred live QA" never caught it. Model-load
  failures are now `console.error`-loud instead of silent.
- **Audio never emitted**: analyser smoothing (0.8) stretched loudness decay past the 2s quiet
  window (episodes couldn't close, only a close emits), no max-episode chunking meant continuous
  noise emitted nothing until unmount. Fixed (smoothing 0.2, 61s chunks).
- **window_blur duplicate**: on tab return, `visibilitychange(visible)` fires before `focus`,
  clearing `hiddenAt` and letting the old guard emit a bogus blur atop every tab_switch. Fixed:
  tab-hide owns/clears the pending blur; genuine blur-while-visible emits once via a 1s timer.
- **Fullscreen enforced**: mount-time `requestFullscreen` (outside transient activation, often
  rejected) replaced with best-effort auto-enter + a blocking overlay whenever not fullscreen;
  violation only on real exits.
- **Biometric gate**: real `getUserMedia` live preview with frozen captured-frame display
  (verification itself still simulated at this point — no OCR/face-match backend yet).
- **Bonus bugs found & fixed during diagnosis**: `POST /api/attempts` 500'd on every
  resume-without-client-state (P2002 fallback ran inside an aborted transaction); `/api/upload`
  failed 500 on every evidence snapshot (user-scoped storage client vs. policy-less private
  bucket — switched to service-role client); events emitted while the tab is hidden could die with
  the tab (background-tab timer throttling — buffer now flushes immediately on hidden-emit); open
  `prohibited_object` episodes were dropped at unmount; a dev-only StrictMode false negative
  fixed at the root (`ProctoringEventBuffer.revive()`).
- Full 16-row per-detector matrix run against a fresh production build with fake-device
  camera/mic feeding pre-validated media, checking real `Violation` rows.

### 2026-07-17 (cont'd) — Exam auto-completes on the teacher side when closing time is reached ✅

Root cause: `computeEffectiveExamStatus` (added earlier this session for `scheduled→live`) had
no symmetric `live→completed` rule for `endTime`, so a passed exam kept showing "Live" on every
teacher/admin surface forever unless manually ended. Now also derives `completed` once `endTime`
passes (never touches `draft`, never un-completes). Wired through all 5 call sites. Also fixed
the matching gap in the "Active Exams" dashboard stat, which counted `status: 'live'`
unconditionally with no `endTime` check.

### 2026-07-17 (cont'd) — Cross-exam Live Monitor page was missing the eye button entirely ✅

"Teacher still can't see live video" turned out not to be a WebRTC bug — the teacher was on
`/teacher/monitor` (the cross-exam overview), which never had the eye button/snapshot/Go-Live
control at all; that only existed on the per-exam monitor page. Extracted the shared panel into
`src/components/shared/StudentActionsModal.tsx`, wired into both. Noted but left alone (out of
scope): a recurring React hydration mismatch on both monitor pages from the same `DashboardShell`
localStorage-avatar issue flagged 2026-07-14.

### 2026-07-17 (cont'd) — Invitation UI polish (accept pages, invite dialogs), no logic changes ✅

Presentation-only, explicitly scoped away from `lib/data`/API/business logic. New shared
`PasswordInput` (show/hide toggle) on all 6 password fields across the 3 public accept pages;
spinner loading states; error banners get icons. Teacher's per-class invite dialog gets an icon
header + spinner send button. Admin's bulk teacher-invite panel converted from an inline
no-backdrop block into a real modal `Dialog`.

### 2026-07-17 (cont'd) — Teacher live video (student → teacher), real peer-to-peer WebRTC ✅

User clarified direction after the feasibility-only investigation below and gave a prescriptive
spec: one-student-at-a-time, peer-to-peer WebRTC signaled over Supabase Realtime, no SFU, no
media server to run.

- New `src/lib/webrtc-signaling.ts`, `WebRTCBroadcaster.tsx` (student — reuses `FaceDetector`'s
  already-open camera stream via a `streamRef` prop, no second `getUserMedia()`), `useWebRTCViewer.ts`
  (teacher — wired into the "Review & Actions" modal as a "Go live"/"Stop live" control).
- **Signaling authorization enforced at the RLS layer, not just the UI** (spec's explicit ask):
  two new Supabase Realtime Broadcast Authorization policies on `realtime.messages`, scoped to
  `webrtc:{attemptId}` topics, same student-owns-attempt-OR-teacher/admin-in-institution shape as
  the 2026-07-11 tables. Live-verified: a teacher from a different institution subscribing to a
  real student's channel gets `CHANNEL_ERROR: Unauthorized` before any SDP exchanges.
- **TURN judgment call, flagged not guessed**: shipped STUN-only — same-machine testing can't
  produce a real cross-NAT signal either way; cost/hosting implications (self-hosted coturn vs.
  pay-per-use) written up for Haris rather than added preemptively. (Superseded 2026-08-12 by
  real Cloudflare TURN.)
- Live-verified against a fresh production build (not dev — this session's own earlier work found
  a real StrictMode false negative in this exact code path) via disposable Playwright + Prisma: a
  real student camera stream reaches the teacher's `<video>` element, "Stop live" leaves the
  student's own proctoring stream untouched, cross-institution RLS rejection confirmed.

### 2026-07-17 (cont'd) — Phase 4 fixes round 3: exam auto-start, tab-lock logging, proctoring tuning, live-video feasibility, dashboard student count ✅

- **Exam auto-start (teacher side)** — `Exam.status` never auto-transitions in the DB (no cron,
  by design); students already saw correct live-ness via read-time checks, but teacher/admin
  surfaces rendered the raw DB column. New `src/lib/exam-status.ts`'s `computeEffectiveExamStatus`
  applied everywhere.
- **Tab lock not enforced/logged** — real regression from the Phase 3 rewrite: `TabGuard.tsx`
  only sent a violation when the student *returned* to the tab; never-returning lost it
  permanently. Fixed to emit immediately on hide, 16s escalation if absence continues.
  Live-verifying this required real investigation: an initial dev-mode test appeared to fail,
  traced to React StrictMode's double-mount creating a stale disposed buffer closure —
  confirmed fixed against a real production server.
- **AI proctoring false positives/negatives** — the false-positive-prone signal
  (`multiple_faces`) had the shortest debounce and loudest response, while under-detecting
  signals (`gaze_away`, `audio_detected`) had longer debounces and were capped below the
  push-notification severity tier no matter how long they persisted. Loosened gaze thresholds,
  shortened `gazeAway`'s streak, lengthened/confidence-floored `multiFace`'s, lowered
  `AudioMonitor`'s energy threshold, added a `d > 60 → high` severity tier for both, fixed a
  missing `gaze_away` warning toast, closed an `AudioMonitor` unmount-flush gap identical to
  TabGuard's.
- **Teacher live video — investigated, not built**, per explicit instruction to stop for a
  decision. Confirmed only on-demand snapshots existed; 3 options written up for Haris.
- **Dashboard student count** — same class of bug as round 2's Students-tab fix, not caught
  everywhere: the dashboard's own separate stat queries still counted via `TeacherStudent` only.
  Same union-of-relations fix applied; "Active Exams" made time-aware in the same two functions.

### 2026-07-17 (cont'd) — Phase 4 fixes round 2: student profile, Students tab, item builder save, CLO audit, exam-to-class scoping ✅

- **Student name not saving** — same fake `onSubmit` bug already fixed on the teacher settings
  page that day, never applied here. Now a real `PATCH /api/users/me`.
- **Students tab** — two real bugs beyond missing columns: roster scoped via `TeacherStudent`
  only, so a per-class-invite student was **silently absent from the roster entirely**; and
  `getViolations()` was called with zero arguments, resolving to an **unscoped query returning
  every violation in the entire database across every institution**. Fixed both — roster now
  unions `TeacherStudent`/`ClassEnrollment`, violations properly scoped.
- **Manual item builder "Save" not saving** — the Marks `<input>` lacked `valueAsNumber: true`,
  so zod validation failed silently and Save did nothing the moment marks was touched. Also fixed
  in the same pass: Difficulty/Review-Status `<Select>`s completely disconnected from the form
  (always saved defaults regardless of selection), no error handling around `createItem()`
  anywhere, `authorId` resolution silently falling through to an empty string (FK crash) instead
  of an explicit error.
- **CLO creation — investigated only, not changed** (too ambiguous to act on safely per the
  task's own instruction). Full inventory written up: 3 inputs today, no PLO concept, no
  edit/delete once created.
- **Exams scoped to a class, not all students — highest-risk item this round.** `Exam` had zero
  connection to `Class`; student visibility filtered only by institution + an institution-wide
  `TeacherStudent` link. **Worse**: `POST /api/attempts` had **no eligibility check whatsoever**
  — hiding an exam from a list was never real access control. Added nullable `Exam.classId`, a
  class dropdown in the wizard, class-scoped filtering, and a matching eligibility gate on attempt
  creation (shared pure rule, `src/lib/exam-eligibility.ts`). **Judgment call flagged**: `classId`
  stays optional (required would immediately block exam creation for any teacher without a Class
  yet). Live-verified with two students in two classes, same institution/teacher: correct student
  sees/starts it (201), the other neither sees it nor can start it via direct API bypass (403).

### 2026-07-17 (cont'd) — Phase 4 fixes: invite flow cleanup, cross-institution block, teacher profile/dashboard, joined-teacher visibility ✅

- **Link-based invites removed** — the shareable `/register?institution=<id>` link was also a
  **real, previously-undiscovered bug**: `/register` never read the `institution` param, so using
  it always created a brand-new institution instead of joining the inviting one.
- **Admin bulk teacher invite** — new `createBulkTeacherInvites()` mirrors the existing
  class-invite dedup/cap/rollback shape; CSV parser extracted to
  `src/lib/bulk-email-file-parse.ts` and shared with the per-class dialog.
- **Student invites consolidated to Classes tab** — found a related leftover via live QA: the
  teacher dashboard's "Invite Students" quick-action still linked to the now-invite-less Students
  page — repointed to `/teacher/classes`.
- **Cross-institution invite block** — schema confirmed `User.institutionId` is a single scalar
  FK (`User.email` globally unique), so per the task's own default the block applies to both
  teachers and students. One pure decision function (`resolveAcceptInviteAssignment`) is the
  single source of truth — blocks an active member of a different institution, allows a suspended
  one through (clearing the old suspension). Found and fixed two related gaps: `POST /api/invites`'s
  "already a student, just link them" shortcut had **zero institution scoping**; the class-invite
  accept route's existing-student lookup was scoped only to the class's own institution, so a
  different-institution email could silently enroll via the fallback branch.
- **Teacher profile fixed** — identical fake `onSubmit` bug to the round-2 student-settings fix.
  Hardcoded `{Exams: 8, Students: 142, Trust: 91}` stat block replaced with real aggregates.
- **Joined teachers now show up in the admin panel** — root cause: `POST /api/invites/accept/[token]`'s
  upsert `update` branch only ever wrote `name`, never `role`/`institutionId`, so an accepted
  invite could leave the User row without ever actually joining the institution.
- Live-verified via disposable direct-DB scripts + 3 real Playwright sessions, all self-cleaning.

### 2026-07-17 (cont'd) — Phase 7.1: 3 frontend error-handling bugs found while writing manual QA doc ✅

Cross-referencing the UI against what the backend now actually returns surfaced three bugs no
prior API-level verification caught (that always hit `fetch()` directly, not the real UI).

- **`handleStartExam` never checked `res.ok`** — every rejection from `POST /api/attempts` fell
  through silently, writing a corrupt session and, for sectioned exams, stranding the student on a
  dead button. Fixed via a pure classifier (`src/lib/exam-start-errors.ts`) branched on before any
  state write.
- **`handleStartSection` swallowed its 403 silently** — fixed with the same file's second
  classifier; student now sees the lock message + a reload-to-resync button.
- **`GradingPanel` had no UI path to a permitted backend state** — it collapsed `confirmed` and
  `overridden` into one terminal gate, hiding the override control the backend still permits for
  `overridden`-not-yet-`confirmed` answers. Fixed with pure `isGradingFinalized`/
  `canOverrideGrading` helpers.
- **Scope decision, flagged**: this repo has no React-component test pattern (no RTL/jsdom); all
  three bugs were closed by extracting decision logic into pure functions (tested via plain
  vitest) rather than introducing a new toolchain for a 3-bug fix.

### 2026-07-17 (cont'd) — Phase 7: multi-section locking + grading bulk-approve, closed real server-enforcement gaps ✅

Phase 7's Task 1 duplicated the 2026-07-09 session's item 9 almost entirely (already built) —
found and fixed two real server-side enforcement holes instead:

1. **Section-weight-sums-to-100% was never enforced server-side**, only a non-blocking UI
   warning. `POST /api/attempts` now rejects starting a *new* attempt on a sectioned exam whose
   weights don't sum to 100% (never blocks resuming).
2. **`isItemSequential` had zero server enforcement surface** — no per-question autosave exists
   at all (one bulk submit only). New `ItemLock` table +
   `POST /api/attempts/[attemptId]/items/[questionId]/lock`: a second lock call for the same
   question is rejected (403); both submit routes honor any locked value over the client's bulk
   payload as defense in depth. Scoped only to `isItemSequential` exams.

Task 2: bulk-approve didn't exist at all — new
`POST /api/grading/attempts/[attemptId]/bulk-approve` transitions every `ai_suggested` answer to
`confirmed` in one transaction. **Flagged**: already-`overridden` answers are counted but left
untouched (not silently rewritten with the AI's original suggestion). Also closed a gap where
`POST /api/grading/answers/[answerId]` had **no check at all** for an already-`confirmed` answer
— a second override could silently overwrite marks; now returns 409. RLS added to `ItemLock`
(SELECT-only, live-verified with 3 cross-institution queries).

### 2026-07-17 — Phase 6: item bank RBAC/pooling audit, closed real pooling concurrency + insufficient-pool bugs ✅

Tasks 1–3 were near-verbatim restatements of 2026-07-09's items 5–7, already implemented —
audited (4 parallel research passes) rather than re-implemented. **Real gap found in Task 1**:
`ItemBank`/`ItemBankAccess` had RLS disabled — enabled with SELECT-only policies, hit and fixed a
genuine infinite-recursion bug from the two tables' policies mutually referencing each other
(fixed with `SECURITY DEFINER` helper functions).

Task 4 (pooling) had two real, previously-unaddressed bugs, matching the spec's own
highest-risk callouts:
1. **Insufficient pool at runtime was silently swallowed** — `materializePooledQuestions` drew
   `ORDER BY RANDOM() LIMIT count` with no check the rows existed; a shrunk pool (item deleted
   after the blueprint was saved) silently served a shorter exam with zero signal. Fixed: actual
   approved count is checked before drawing; a shortfall throws `InsufficientPoolError`
   (`src/lib/data/pooling-errors.ts` — kept separate from `pooling.ts` since that file is
   `'use server'` and a thrown Error class isn't a valid Server Action export). `POST /api/attempts`
   returns 409 with per-CLO shortfall detail.
2. **Concurrent exam-start could double-materialize a pooled exam** — attempt creation +
   materialization now run inside one `$transaction` using `create` (not `upsert`); the DB's
   unique constraint is the sole arbiter, the losing concurrent call catches P2002 and never
   materializes, `InsufficientPoolError` rolls back the whole transaction.

**Product decision flagged, not made silently**: blocks the exam-start attempt entirely on
insufficient pool (safest — never serve a mis-scoped exam unnoticed) rather than auto-adjusting
the draw count down, left for Haris's call. Live-verified: RLS cross-tenant (4 queries), JIT
assembler on a healthy pool (3/3 materialized) and an insufficient one (409, zero orphaned
rows — the rollback is real, not just unit-tested), batch-size cap enforcement.

### 2026-07-16 — Phase 5 spec audit: found already-complete, closed one test gap ✅

A "Phase 5" spec landed asking for pre-exam instructions, availability-vs-duration auto-submit,
per-item timers, and an optional proctoring toggle — nearly verbatim 2026-07-09's items 1–4.
Verified rather than assumed: confirmed live against Supabase that every field already exists in
prod and the code paths are real. Closed the one genuine gap: the deadline math lived only as
inline route code — extracted to `src/lib/exam-deadline.ts` (pure), 7 new tests including the
spec's own worked example. **Explicitly declined**: a cron to force-submit dead-client attempts —
`POST /api/monitor/force-finalize` already exists for this by design (no autosave, so
auto-finalizing can only score 0 — automating it would reverse a deliberate Phase 3 decision).

### 2026-07-14 — Password reset rework, Classes/ClassInvite/ClassEnrollment, admin deactivation ✅

Four-part spec, each independently verified against live prod DB. **New finding**: the app
connects via `DATABASE_URL` (pgBouncer, always reachable) even when direct Prisma CLI calls need
the `DIRECT_URL` override — unblocks real Playwright QA prior sessions couldn't do.

- **Password reset** — moved to `/auth/forgot-password`+`/auth/reset-password`. New
  `PasswordResetAttempt` log + rate limiting (3/15min per email) before calling
  `resetPasswordForEmail` server-side (moved off the client to make the limit enforceable).
  `/auth/callback` honors a same-site-only `next` param, redirects a failed exchange to a clear
  expired/invalid state.
- **Class / ClassInvite / ClassEnrollment** — one teacher → many `Class` rows; invite/accept
  deliberately reuses the *existing* `InviteToken`/`/invite/[token]` pattern rather than a new
  mechanism. Bulk invite branches per email: existing same-institution student gets enrolled only
  while already signed in as that account; new email gets the same admin-createUser signup form.
- **Removal/deactivation RBAC** — `src/lib/class-permissions.ts` (pure): `canManageClass`,
  `canDeactivateUser` (institution admin only, never another admin, never super admin, never
  self). Admin deactivation cascades by archiving (not deleting) the teacher's classes.
- **RLS** — same SELECT-only shape as the 2026-07-11 tables, applied to the 3 new tables.
- **Bug found via live QA, fixed (not scope creep — it's the exact mechanism deactivation depends
  on)**: `GET/PATCH /api/users/me` reimplemented its own auth with a bare `supabase.auth.getUser()`
  instead of `getAuthUser()`, so a just-deactivated user's session-bootstrap call kept succeeding.
- **Known pre-existing, unrelated bug surfaced (not fixed)**: `DashboardShell`'s avatar-initials
  computation reads `localStorage` client-side, a real SSR/client hydration mismatch on every
  dashboard page (confirmed pre-existing via `git stash`).

### 2026-07-12 — Phase 3 follow-up: hosted Judge0, Vercel Python psychometrics, Master Admin Panel ✅

- **Hosted Judge0** — self-hosted docker-compose removed; client targets the pay-per-use Shared
  Cloud API via `JUDGE0_API_URL`/`JUDGE0_API_KEY`. New `JudgeUsageLog` is the per-institution cost
  attribution; a monthly submission counter (default 1000, shared month-rollover mechanism with
  the AI quota) means quota-hit holds an answer for manual grading, never fails an exam.
- **Psychometrics inside Vercel** — the standalone FastAPI service is gone; `api/psychometrics/compute.py`
  is a Vercel Python Function (auto-detected via root `requirements.txt`), stats module moved
  unchanged; `PSYCHOMETRICS_URL` removed.
- **Master Admin Panel** — new tier above institution admins: `User.isSuperAdmin` (deliberately
  not a `Role` value, set manually via SQL). `/super` + `/api/super/*`: all institutions with
  counts, monthly Judge0 + Claude usage with env-tunable cost estimates, suspend/unsuspend for
  institutions and users. Suspension is a soft `suspendedAt` flag enforced in `getAuthUser`.

### 2026-07-11 — Phase 3 implementation ✅ (all 5 areas)

Implemented per 6 architecture docs written the same day under an autonomous-kickoff prompt with
12 locked decisions. **Live-server QA was impossible this session** — local network blocked
outbound Postgres ports; all DDL applied and row-verified over HTTPS via the Supabase Management
API (`scripts/mgmt-sql.sh`).

- **Proctoring**: real client-side detection replaces every mock — MediaPipe Face Landmarker
  (face count + coarse gaze) + COCO-SSD (phone/book/laptop on sampled frames) + sustained-episode
  audio VAD, all self-hosted (~23MB, no external calls). `ProctoringEventBuffer` batches events to
  a batched `POST /api/violations` with server-side severity re-derivation, clientSeq idempotency,
  a 30s heartbeat making detector suppression visible. Trust score v2 recomputed live per ingest.
  Evidence: snapshot only on multi-face/phone/sustained-no-face, private storage, visible capture
  indicator, 30-day purge cron, consent line on instructions. Also fixed a pre-existing hole:
  students could write violations against other students' attemptIds.
- **Live monitoring**: per-exam monitor runs on Supabase Realtime (polling retained as fallback).
  Roster gains heartbeat-staleness "Disconnected" state, needs-attention sort. The Phase-1 fake
  "live feed" (teacher's own camera!) replaced by on-demand snapshots via new `MonitorDirective`
  (snapshot/warning/force_submit — doubles as the teacher-action audit log). Force-submit:
  directive for live clients, `/api/monitor/force-finalize` for dead ones.
- **AI generation**: async — 202 + `GenerationJob` row + Vercel background work, polled with a
  5-min staleness sweep. Real Claude call, structured output, zod-validated, retry≤2,
  injection-hardened, **mock fallback when `ANTHROPIC_API_KEY` is absent**. Dup detection:
  30 recent stems in-prompt + pg_trgm >0.6. `Institution.aiMonthlyQuota` (default 1000) with
  atomic monthly counter and hard 429.
- **AI grading**: two-stage — essay/coding answers enter `pending_ai` at submit, AI suggestions
  run in background, **only teacher confirm/override ever writes marks** (no auto-confirm).
  Append-only `AnswerGrading` log doubles as the dispute trail. Essay: per-criterion scores with
  quoted evidence + injection flags. Coding: self-hosted Judge0 runs test cases, Claude reviews
  quality, combined 70/30. Marks never awarded when the sandbox is unavailable.
- **Psychometrics**: `ItemAdministrationStat` + `ExamReliabilityStat` + `Question.sourceItemId`.
  New FastAPI service, pure-Python formulas validated against hand-computed pytest fixtures:
  partial-credit facility index, pooled-aware corrected point-biserial, alpha/KR-20 (NULL for
  sparse pooled matrices, honestly), distractor quartiles, insufficient-N<10, no IRT.
- **SEC-08 narrowed**: RLS enabled on exactly 4 tables — `Violation`, `ExamAttempt`,
  `ProctoringHeartbeat`, `MonitorDirective` — SELECT-only for `authenticated`. No write policies
  (direct PostgREST writes to these 4, previously possible under default grants, now denied).
  Prisma unaffected (connects as table owner). **The rest of the schema remains app-layer-only —
  SEC-08 otherwise stands as accepted.**
- **Known deferred**: live end-to-end QA (network blocker), grading-queue badges, per-admin stats
  drill-down UI, `Item.reviewedById` stamping, Web Push, `teacher/monitor` still polls.

### 2026-07-09 (cont'd) — Multi-section exam architecture (spec item 9) ✅ (final item — all 9 spec items complete)

Largest, most invasive item — built 100% additively: a normal exam has zero `ExamSection` rows
and is unaffected end-to-end, gated behind `isSectioned = sections.length > 0`.

- Schema: `ExamSection` (title, instructions, optional duration/orderIndex/sectionWeight/passingThreshold)
  and `SectionAttempt` (one per student per section). `Question.sectionId` nullable — null means
  no section, same pattern as `Question.attemptId`.
- Student page generalizes the single instructions-screen into a per-section loop, each section
  seeding its own isolated timer. Section deadline is `min(sectionStart + duration, exam.endTime)`.
- Scoring (`computeSectionScores`): weighted composite by `sectionWeight`, each section's own
  `passingThreshold` evaluated independently — a section can fail its threshold and flag the whole
  attempt Failed even when the composite alone would read as a pass.
- **Judgment call flagged explicitly (the one Haris asked about specifically)**: a section-
  threshold failure is a silent trap for a teacher skimming by percentage alone. Added a
  `sectionsFailed` flag threaded into the results table ("Fail (section)", not a plain "Pass")
  and the student's own complete page.
- Live-verified end-to-end via Playwright + DB check: a deliberately-designed 2-section exam
  (60/40 weights, 50/90 thresholds → 80% composite but `failed: true`) matched the worked example
  exactly, live not just unit-tested.

### 2026-07-09 (cont'd) — Stratified dynamic pooling & test blueprint (spec item 8) ✅

Most architecturally significant item this session — every student can now get a genuinely
different randomly-drawn question set for the same exam, requiring an audit of every place that
assumed "one shared Question list per exam."

- `Question.attemptId` (nullable, cascade delete): null = the exam's fixed/shared question, set =
  privately materialized for one attempt. Audited and fixed every "list this exam's questions"
  query to respect the split (`getQuestions()` now `attemptId: null` only; new
  `getQuestionsForAttempt()`; `getStudentSubmissionDetail()` now attempt-scoped).
- Wizard's old inert pooling stub replaced with a real Blueprint Matrix (bank multi-select → table
  of every distinct CLO with available-item count + target-draw input, clamped, total derived
  live).
- JIT stratified sampling (`materializePooledQuestions`): on a brand-new attempt only, draws
  `count` approved items per CLO via `ORDER BY RANDOM()`, shuffles, copies into private `Question`
  rows. Independently re-verifies bank ownership (the caller is a student, no bank-permission
  concept to lean on).
- **Also fixed a real IDOR while auditing**: `createQuestion()` had zero ownership check — any
  authenticated user could inject a question into any exam by ID.
- Live QA: built a real blueprint across a disposable bank, ran two students through the same
  pooled exam, confirmed 8 total `Question` rows split cleanly 4-and-4 by `attemptId` with zero
  overlap, each attempt scored correctly, teacher's per-student page showed exactly each
  student's own questions.
- **Known scope-limited gap**: no facility/discrimination-index calculator ties back to the
  source `Item` for pooled exams (the fields exist in the schema, no calculator populates them
  anywhere, pooled or not).

### 2026-07-09 (cont'd) — CLO-aware, batch-controlled AI generation (spec item 7) ✅

`MAX_BATCH_SIZE = 15` shared client/server (server-side hard rejection). Server resolves
`learningObjectiveId` → CLO text and **verifies the CLO's course belongs to the caller's own
institution** — `LearningObjective` had no institution scoping of its own, a real previously-
unguarded cross-tenant read path. Every generated item gets `learningObjectiveId` stamped.
**Bug found and fixed during QA**: the batch-creation `$transaction` hit Prisma's 5s interactive
timeout under real network latency (reproduced live as a 500 on a batch of 8) — fixed by dropping
the transaction for independent `Promise.all` creates (no cross-row invariant needs atomicity
here; a partial batch is harmless).

### 2026-07-09 (cont'd) — Item Bank RBAC + AI-generation decoupling (spec items 5–6) ✅

**Item 5**: New `ItemBank`/`ItemBankAccess` (`bankLevel: institutional|personal`,
`permissionRole: owner|editor|viewer`); `Item.bankId` backfilled — every pre-existing item
assigned to a new per-institution "Legacy Items" bank. Single permission function
(`resolveBankPermission`) is the sole gate everywhere — cross-tenant is a hard deny before any
role logic. **Deliberate design call**: institution admins get implicit owner on every bank in
their institution (including personal ones), matching the existing admin-authority pattern for
exams/questions. **Fixed a real pre-existing IDOR** along the way: `updateItem`/`getItemById` had
zero auth or institution checks at all. `teacher/items` reworked into a 3-tab bank dashboard →
bank detail → "Manage Access" modal.

**Item 6**: Wizard's "AI Generation" step removed entirely (stepper now Basic Info → Select
Questions → Settings). `/api/ai/generate-questions` now takes `itemBankId` and saves generated
questions directly to `Item` as drafts (previously stateless). New "Generate with AI" panel on the
bank detail page.

### 2026-07-09 — Student UI & Time Controls (spec items 1–4) ✅

A 9-item spec landed; full gap analysis written to `requirements.md` first. Items 1–4 shipped
this pass (additive); items 5–9 scoped to follow-up sessions (all completed in later entries
above).

- **Pre-exam instructions screen** — `Exam.instructions` added; a Start-Exam gate inserted
  between the biometric gate and the exam UI; the duration timer only starts on click, never on
  page load.
- **Availability window vs. duration auto-submit** — client seeds the countdown from
  `min(startedAt + duration*60s, endTime)`; the submit route independently recomputes the same
  deadline and writes `auto_submitted` vs `submitted` accordingly — the first real use of the
  previously-dead `auto_submitted` enum value.
- **Per-item time limits** — `Question.timeLimitSeconds`/`Item.timeLimitSeconds` added; a mini
  countdown auto-advances to the next question on expiry and permanently locks navigation back.
- **Optional AI proctoring toggle** — `Exam.isProctoringEnabled` (default true); when off, the
  student page skips biometric onboarding entirely and never mounts the proctoring overlay (no
  `getUserMedia` at all).
- **Known residual gap, not addressed this pass**: no background job force-submits an attempt if
  the client tab dies before the timer fires — the server-side deadline check only labels a late
  submission correctly, it doesn't force one. Noted for Phase 3 planning.

### 2026-07-06 — QA_RESULTS.md Priority Fix Pass ✅

Worked the 2026-07-03 QA audit's P0/P1 findings in priority order, each independently verified
against live prod DB with a disposable script.

- **SEC-04** — admin role bypassed institution ownership checks entirely on exam/question
  mutate/delete, letting any institution's admin touch another institution's data.
- **SCR-05** — `Answer.marksAwarded`/`ExamAttempt.score` were `Int`, silently truncating
  fractional partial credit (8÷3×1 = 2.667 stored as 2). Changed to `Float`.
- **SEC-07/STU-01/TIME-02** — `POST /api/attempts` had no server-side start/end time check at
  all; added enforcement (only gates brand-new attempts, existing ones always resumable).
- **ERR-01/02** — all 15 mutating routes crashed non-JSON on malformed input; added
  `withErrorHandling()` uniformly.
- **DAT-01 (round 2, after explicit user sign-off)** — recalculated 2 flagged production `Answer`
  rows affected by the pre-06-25 scoring bug; a 3rd answer in the same attempt was checked and
  confirmed genuinely wrong (left untouched). Full before/after logged, re-audit afterward showed
  0 rows flagged.
- **STU-03** — per-question breakdown lived only in `sessionStorage`, lost on hard reload. Moved
  server-side: `GET /api/attempts/[id]` now returns `perQuestion`.
- **TCH-03** — added the missing per-student answer review pane
  (`teacher/exams/[id]/results/[studentId]`), all 10 question types.
- **Known Accepted Risk (user sign-off)**: **SEC-08 — no database-level RLS.** All authorization
  is app-layer only; a future route/function that forgets a check has no defense-in-depth.
  Accepted for now, narrowed table-by-table in later sessions (see 2026-07-11 onward).

### 2026-06-25 — Destructive QA Audit + 7 Critical Fixes ✅

CLAUDE.md refactored from 902 lines to ~150 (first compression pass — this file periodically gets
recondensed as the session log grows).

- **Security (critical)**: students were served full question data including `correctAnswer` via
  `GET /api/questions` (fixed with `getQuestionsForStudent()`); admin approve/reject buttons were
  fake UI-only state changes; `trustScore` was accepted from the client body on submit (now
  server-calculated); students could PUT their own attempt to manipulate trustScore/violationCount
  (now blocked); submit route didn't verify `examId` in the body against the attempt.
- **Security (high)**: `POST /api/attempts` had no role check (any role could create attempts);
  `GET /api/violations` was unscoped; `deleteQuestion`/`updateQuestion` had no ownership check;
  3 settings pages + admin had a hardcoded fake institution name.
- **Scoring (critical)**: MCQ/true_false answers were **always scored wrong** — student sends
  option ID but scoring compared against option *text*. MRQ and ordering had matching bugs. All
  three fixed to compare correctly.
- **Feature fixes**: real notifications (was hardcoded mock data), `.doc`/`.md` upload support,
  15s results-table polling, FaceDetector positioning, violations-timeline detail panel, removed
  hardcoded `inst-1`/`teacher-1` IDs app-wide.

---

## Current Status

Everything through 2026-08-12 above is shipped and live. Highlights of what's currently true:

- **`/super`** is a real dedicated login page, role-flag-gated, never email-based.
- **Quill WYSIWYG** for stem/answer-option fields (no schema change); RTL fixed app-wide (Radix
  `Tabs`/`Select` `DirectionProvider` fix); hierarchical rubric editor for essay items (not yet
  live-browser-verified).
- **Proctoring**: face-only biometric gate (ID verification removed), exam-start photo delivered
  to the teacher, trust-score/violation staleness fixed on both monitor pages, `gaze_away`
  evidence capture, real Cloudflare TURN relay for teacher live-video (student→teacher WebRTC).
  **Not done on real hardware**: no physically unplugged webcam / muted OS track / lens shutter /
  revoked permission pass; no live two-browser session through the actual TURN relay.
  **Not done on real math/chem UI**: rubric editor browser QA.
- **Exam scheduling**: duplicate-to-another-section (clone, not link), edit-screen schedule
  fields (blocked once live/completed, server-enforced), mid-exam end-time extension with
  real-time student sync + audit trail (`ExamTimeChange`). No live browser QA on these three this
  session.
- **Math & chemistry** (KaTeX/mhchem/MathLive) in stem/options/explanation, AI generation emits
  LaTeX, matching dropdowns render math, keyboard shortcuts, print CSS, mobile overflow fixed —
  all live-verified (30/30 then 15/15 checks). Students still can't author math in free-text
  answers (deliberate scope); no print/PDF export route.
- **Multi-section exams, dynamic pooling, Item Bank RBAC, AI grading bulk-approve/override,
  Classes/ClassInvite/ClassEnrollment, admin deactivation, password-reset rework** — all complete,
  see Session Log for the specific judgment calls and gaps on each.
- **Phase 3** (real proctoring signals, async AI generation, two-stage AI grading with mandatory
  teacher confirm, real psychometrics, Supabase-Realtime live monitoring) — implemented
  2026-07-11, see that entry.

**Pending manual action**: Supabase dashboard → Authentication → URL Configuration → confirm Site
URL is `https://exam-system-sigma.vercel.app` (was a known gap as of the 2026-07-11 entry).

**Known Accepted Risk**: no database-level RLS (SEC-08) on most tables — app-layer checks are the
sole enforcement. Accepted by the user 2026-07-06. Narrowed table-by-table since: RLS now enabled
(SELECT-only, `authenticated`) on `Violation`, `ExamAttempt`, `ProctoringHeartbeat`,
`MonitorDirective`, `ItemBank`, `ItemBankAccess`, `ItemLock`, `Class`, `ClassInvite`,
`ClassEnrollment`, `ExamTimeChange`. `ExamSection`/`SectionAttempt` confirmed still lacking RLS
(predate the narrowing, not brought into scope since not new).

---

## Build Status
- `npm run build` → **PASSES** (0 errors, 90 routes)
- `npm run lint` → 3 pre-existing baseline errors (`useExamTimer.ts`, `invite/[token]/page.tsx`,
  `exam/[examId]/page.tsx` — predate the current session lineage, reconfirmed via `git stash`
  each time they're touched), 0 warnings
- `npx tsc --noEmit` → clean
- `npx vitest run` → 408/408 passing (+ `pytest` 10/10 in `psychometrics/`)
- Last verified: 2026-08-12 (real Cloudflare TURN relay; assign/duplicate exam + schedule editing
  + mid-exam end-time extension; proctoring ID-removal/photo-delivery/staleness/gaze-evidence —
  see Session Log for the "no live browser/hardware QA" gaps flagged on each)
- Live: https://exam-system-sigma.vercel.app
- Every session in the log above follows the same verification convention: `tsc --noEmit` clean,
  `eslint` back to whatever the pre-existing baseline was that day (confirmed via `git stash` when
  ambiguous), `next build` clean, `vitest` green, plus either a disposable self-cleaning
  Playwright+Prisma script against the live DB or an explicitly-flagged gap when that wasn't
  possible (network-blocked pg egress, camera/hardware dependency, etc.). Assume that pattern held
  for any entry above that doesn't call out an exception.

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
| `/super` | Master admin login/panel (public shell, role-gated content) |

### Exam-Taking (no dashboard shell, desktop-only)
| Route | Description |
|---|---|
| `/exam/[examId]` | Live exam: timer, proctoring, question nav |
| `/exam/[examId]/complete` | Submission confirmation + trust score |

### Admin (`/admin/*`)
`/admin` · `/admin/teachers` · `/admin/exams` · `/admin/items` · `/admin/item-banks` ·
`/admin/analytics` · `/admin/settings` · `/admin/institutions` · `/admin/users` ·
`/admin/curriculum`

### Teacher (`/teacher/*`)
`/teacher` · `/teacher/exams` · `/teacher/exams/new` · `/teacher/exams/[id]/edit` ·
`/teacher/exams/[id]/monitor` · `/teacher/exams/[id]/results` ·
`/teacher/exams/[id]/results/[studentId]` · `/teacher/items` · `/teacher/items/[bankId]` ·
`/teacher/items/new` · `/teacher/classes` · `/teacher/classes/[id]` · `/teacher/monitor` ·
`/teacher/students` · `/teacher/analytics` · `/teacher/settings`

### Student (`/student/*`)
`/student` · `/student/exams` · `/student/results` · `/student/settings`

### API Routes (all require Supabase JWT via `getAuthUser()`)
| Route | Method | Description |
|---|---|---|
| `/api/exams` | GET, POST | List / create exams |
| `/api/exams/[id]` | GET, PUT, DELETE | Single exam CRUD; PUT blocks startTime/endTime/duration edits once effectively live/completed |
| `/api/exams/[id]/publish-results` | PATCH | Set `resultsPublishedAt` |
| `/api/exams/[id]/end-time` | GET, PATCH | Mid-exam endTime change (live only) + audit log; notifies active students via `MonitorDirective` |
| `/api/questions` | GET, POST | List / create; students get sanitized via `getQuestionsForStudent()` |
| `/api/attempts` | GET, POST | Start / resume attempt (students only for POST) |
| `/api/attempts/[id]` | GET, PUT | Single attempt; PUT blocked for students |
| `/api/attempts/[id]/submit` | POST | Score + persist all answers; trustScore calculated server-side |
| `/api/attempts/[id]/sections/[sectionId]/start` | POST | Start/resume one section's isolated timer; server-enforced section-sequential lock |
| `/api/attempts/[id]/sections/[sectionId]/submit` | POST | Score + persist one section's answers; finalizes the attempt if last section |
| `/api/attempts/[id]/items/[questionId]/lock` | POST | Server enforcement for `isItemSequential`; a second lock call is rejected |
| `/api/violations` | GET, POST | Log / fetch violations; scoped to institution |
| `/api/analytics` | GET | Analytics data |
| `/api/notifications` | GET | Real notifications derived from DB; polled every 30s |
| `/api/invites` | POST | Send Supabase invite email |
| `/api/invites/token/[token]` | GET | Validate invite token (public) |
| `/api/auth/forgot-password` | POST | Request password reset (rate-limited per email, public) |
| `/api/classes` | GET, POST | List / create classes |
| `/api/classes/[classId]` | GET, PATCH | Single class; rename / archive |
| `/api/classes/[classId]/enrollments` | GET | List a class's roster |
| `/api/classes/[classId]/enrollments/[studentId]` | DELETE | Remove a student from a class |
| `/api/classes/[classId]/invites` | GET, POST | List / bulk-send class invites |
| `/api/class-invites/token/[token]` | GET | Validate a class invite token (public) |
| `/api/class-invites/accept/[token]` | POST | Accept a class invite (public) |
| `/api/users/[userId]` | PATCH | Admin deactivate/reactivate a teacher or student |
| `/api/users/me` | GET, PATCH | Current user profile |
| `/api/upload` | POST | Supabase Storage upload (bucket: `exam-uploads`) |
| `/api/ai/generate-questions` | POST | Async AI generation → 202 {jobId}, scoped to `itemBankId` |
| `/api/ai/jobs/[jobId]` | GET | Generation job status polling |
| `/api/item-banks/[bankId]/collaborators` | GET, POST | List / grant EDITOR-VIEWER access on a bank |
| `/api/item-banks/[bankId]/collaborators/[userId]` | PATCH, DELETE | Change / revoke a collaborator's role |
| `/api/grading/answers/[answerId]` | POST | Teacher confirm/override/regrade; rejects further mutation once `confirmed` |
| `/api/grading/attempts/[attemptId]/bulk-approve` | POST | Finalize every unmodified AI-suggested answer in one attempt |
| `/api/monitor/directives` | GET, POST | Teacher monitor actions (snapshot/warning/force-submit) + student fallback poll |
| `/api/monitor/directives/[id]` | PATCH | Student fulfils a directive |
| `/api/monitor/force-finalize` | POST | Server-side finalization of a dead attempt |
| `/api/evidence` | GET | Signed URL for violation/directive/verification evidence (teacher-scoped) |
| `/api/webrtc/turn-credentials` | GET | Fresh Cloudflare TURN credentials for one WebRTC connection attempt |
| `/api/psychometrics/recompute` | POST | On-demand stat run for one exam |
| `/api/cron/purge-evidence` | GET | Daily 30-day evidence retention purge |
| `/api/cron/psychometrics` | GET | Nightly stats sweep |

---

## Environment Variables (Vercel)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
NEXT_PUBLIC_APP_URL=https://exam-system-sigma.vercel.app
DATABASE_URL          # pgBouncer — port 6543
DIRECT_URL            # direct connection — port 5432 (used by prisma db push)
ANTHROPIC_API_KEY     # enables real AI generation + grading (mock/manual fallback without it)
AI_MODEL              # optional — overrides the default claude-sonnet-5 for generation/grading
CRON_SECRET           # optional — protects /api/cron/* routes (Vercel sends it automatically when set)
JUDGE0_API_URL        # hosted pay-per-use Judge0 (e.g. judge0-ce.p.sulu.sh); unset = coding graded manually
JUDGE0_API_KEY        # key for the hosted Judge0 API
PSYCHOMETRICS_SECRET  # optional shared secret for the internal psychometrics function (X-Service-Key)
CLOUDFLARE_TURN_TOKEN_ID   # Cloudflare Realtime TURN key id — server-only, never NEXT_PUBLIC_; unset = STUN-only live-video
CLOUDFLARE_TURN_API_TOKEN  # Cloudflare Realtime TURN API token — server-only; set on Vercel (Sensitive), not just .env.local
```

---

## Conclusion

This project has gone through roughly forty session-log entries across two months (2026-06-21
Phase 1 mock UI through 2026-08-12) without ever losing forward momentum to rework — the pattern
worth keeping in mind for future sessions is visible in the log itself:

1. **Audit before implementing.** More than a third of the entries above ("Phase 5", "Phase 6",
   "Phase 4 round 2/3") turned out to duplicate work that already shipped in an earlier session
   under a different name. Each was caught by reading the actual schema/code/live DB first
   instead of trusting the spec's own framing — and each audit found at least one *real* gap the
   original implementation had missed (an unenforced weight-sum, a missing RLS policy, an
   under-scoped roster query), which is a better use of a session than reimplementing something
   that already works.
2. **Flag judgment calls, don't guess them.** TURN provider choice, clone-vs-link for exam
   duplication, `classId` optional-vs-required, fail-open-vs-closed on biometric model load,
   auto-adjust-vs-block on insufficient pool — every one of these got written up with the
   trade-off and either put to Haris directly or decided with the reasoning stated inline. None
   were silently picked.
3. **Root-cause, don't patch symptoms.** The `/models` middleware bug that killed every vision
   detector, the frozen-snapshot staleness bug on the monitor pages, the `TeacherStudent`-only
   roster query that recurred three separate times before the union-of-relations fix finally
   stuck — each got traced to its actual cause rather than special-cased where it was noticed.
4. **Live-DB QA is the norm, not the exception, for anything DB/network/RLS-shaped.** Pure
   functions get unit tests; anything touching Postgres, Supabase Realtime, RLS, or a real browser
   gets a disposable, self-cleaning script against the live project (no dev DB exists) — and every
   session confirms the cleanup afterward rather than assuming it.
5. **Known gaps get written down, not hidden.** Camera/hardware-dependent proctoring paths,
   cross-NAT WebRTC/TURN behavior, and a handful of "not live-browser-verified" UI features are
   named explicitly in the Session Log and **Current Status** above rather than folded into a
   blanket "done." Treat anything flagged that way as still needing a real pass before it's fully
   trusted, even though `tsc`/`lint`/`vitest`/`build` are clean on all of it.

The one standing structural risk carried across the whole project is **SEC-08** (see **Current
Status**): most tables still have no database-level RLS, so a future route or `lib/data` function
that forgets an ownership/institution check has no backstop. It's been narrowed table-by-table
every time a new table touches Realtime or otherwise needs it, and accepted as a known risk
everywhere else — that stance hasn't changed and shouldn't be silently reversed either way.

When this file needs recondensing again (it will — the Session Log grows every session), keep the
per-entry judgment calls, root causes, and known gaps; the per-entry `tsc`/`lint`/`vitest`/`build`
lines are safe to drop again, since the **Build Status** section's "every session follows this
pattern" note already covers what they'd otherwise repeat forty more times.
