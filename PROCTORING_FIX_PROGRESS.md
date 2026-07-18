# Proctoring System Fix — 2026-07-18

Bug report: face, multi-face, abnormal-gaze, background-noise, and prohibited-object detection
never produced a violation; fullscreen exit was logged but never enforced; window-blur produced
false/duplicate violations; the biometric screen never showed the person/ID being captured.
Only tab-switch worked. Instruction was to diagnose root causes before patching, verify in both
dev and a fresh production build, and report a concrete test per detection type.

Everything below was verified against a **fresh production build** (`next build && next start`)
with a real student session in real Chromium (fake-device camera/mic fed validated y4m/wav
media), checking actual `Violation` rows in the live DB — plus a dev-mode pass. All QA data
(disposable institution/teacher/student/exam, attempts, violations, 11 uploaded evidence files)
was deleted afterward; residual check confirmed 0 rows.

---

## Root causes found (diagnosis first, in order of impact)

### 1. Middleware redirected every `/models/*` request → ALL vision detection dead
`src/middleware.ts` had no public prefix for `/models` (the self-hosted MediaPipe wasm/task +
COCO-SSD files in `public/models/`). For an authenticated student the role-path check
redirected `/models/*` → `/student` — an HTML page. MediaPipe's wasm loader got HTML instead
of JS (`SyntaxError: Unexpected token '<'`, captured live), coco-ssd's `model.json` got HTML
instead of JSON, **both `catch` blocks silently nulled the models**, and the camera widget
quietly showed "Basic monitoring" (degraded) forever. Face, multi-face, gaze, and object
detection were structurally dead in every authenticated context — dev and prod alike — which
is exactly why only tab-switch (pure DOM, no assets) worked. Verified the models themselves
were fine by loading the same files + options in an isolated harness (1/2/0 faces detected
correctly; phone 0.98, book 0.96).

**Fix**: `/models` added to `PUBLIC_PREFIXES`; model-load failures now `console.error` instead
of silently degrading.

### 2. AudioMonitor could essentially never emit
Two compounding causes, pinned by instrumenting the production bundle's own analyser loop
(it was sampling fine at 5 Hz and reading levels well above threshold — the episode just never
closed, and **only a close emits**):
- `AnalyserNode`'s default `smoothingTimeConstant` (0.8) stretches loudness decay ~3s past
  actual silence, so a realistic inter-sentence pause almost never accumulated the 2s of
  sub-threshold readings (`QUIET_MS`) needed to close an episode.
- No max-episode chunking (unlike the vision detectors): truly continuous noise never goes
  quiet, so nothing was emitted until unmount — and nothing at all if the tab just closed.

**Fix**: `smoothingTimeConstant = 0.2`, plus `MAX_EPISODE_MS = 61s` force-chunking (61 not 60
so a chunk's own duration lands in the server's `d > 60 → high` severity tier).

### 3. window_blur duplicated every tab switch
On returning to the tab, browsers fire `visibilitychange(visible)` **before** `focus`. The
visible-handler cleared `hiddenAt`, so the focus-handler's `!hiddenAt` guard always passed and
emitted a bogus `window_blur` on top of every real `tab_switch`. Also, a blur the student never
returned from was never emitted at all (emit only happened on refocus).

**Fix**: a tab-hide now clears the pending blur (the tab_switch episode owns it); a genuine
blur-while-visible is emitted by a 1s verification timer (so it's never lost even without a
refocus), with the brief-blur case emitted once on focus with its duration. No duplicates in
either direction.

### 4. Fullscreen: false "denied" violation at start, no enforcement
The mount-time `requestFullscreen()` ran outside transient user activation, which browsers
routinely reject — that rejection was logged as a "Fullscreen denied" violation the student
never caused, and after that nothing was enforced: a student could leave fullscreen freely.

**Fix**: rewrite of `FullscreenGuard` — best-effort auto-enter on mount (works when the Start
click's activation is still fresh; live-verified it does), a **blocking full-viewport overlay**
whenever the exam is not fullscreen with a "Return to Fullscreen" button (a real user gesture,
so the browser allows the request), violation emitted only for a real exit from
previously-entered fullscreen, and the guard stays inert on browsers with no Fullscreen API
rather than bricking the exam.

### 5. Biometric gate showed icons, not the camera
`BiometricOnboarding` was fully simulated — a dashed circle with a camera icon; the person and
ID card were never shown. **Fix**: real `getUserMedia` live preview during both capture steps
(face-alignment circle overlay on the face step), each capture freezes an actual frame that is
shown during "verifying" and again as face/ID thumbnails on the Verified step, tracks stopped
on unmount, and a non-blocking "camera unavailable" state. Verification itself is still the
simulated flow (no OCR/face-match backend exists — unchanged scope, flagged).

### Bonus bugs found during diagnosis (all fixed)
- **`POST /api/attempts` 500 on resume from a fresh browser session**: the P2002
  unique-violation fallback ran *inside* the failed transaction — Postgres aborts the whole
  transaction (25P02), so the fallback query itself errored. Any student reopening an exam
  without client session state got a hard 500 and could never re-enter. (The Phase 6
  concurrency unit test passed because its mocked transaction didn't reproduce Postgres abort
  semantics.) Fallback moved outside the transaction; concurrency semantics preserved
  (only the create-winner materializes pooled questions).
- **Evidence snapshots never uploaded**: `/api/upload` used the user-scoped Supabase client
  against the private `exam-uploads` bucket, which has no storage RLS policies → every upload
  failed 500 "new row violates row-level security policy". Multi-face/phone/sustained-no-face
  evidence (and teacher-requested snapshots) silently never landed. Switched storage ops to the
  service-role client (route already authenticates; path is scoped per user; the read side
  `/api/evidence` already used the admin client).
- **Events emitted while the tab is hidden could be lost**: `tab_switch` (severity medium)
  waited for the 10s flush timer, which background tabs throttle to ~1/min — if the student
  never returned, the event often died with the tab. The buffer now flushes immediately when
  emitting while `document.visibilityState === 'hidden'`.
- **Open `prohibited_object` episode silently dropped at unmount** (same bug class TabGuard
  had): now finalized+emitted in cleanup, plus 60s chunking so a book sitting in frame surfaces
  while the exam is still running, and the emitted `confidence` is now the episode's tracked
  best score (was `undefined` at close).
- **Dev-mode StrictMode false negative fixed at the root** (previously only documented in
  round 3): StrictMode's mount→cleanup→remount cycle left the state-held
  `ProctoringEventBuffer` permanently `disposed`, silently dropping every event in dev. Added
  `buffer.revive()` (no-op in prod) called from the overlay's effect.

---

## Per-detector verification (production build, real browser, real DB rows)

Media used was pre-validated in an isolated model harness (same files, same options as the
app). "Row" means an actual `Violation` row via `POST /api/violations` → Postgres.

| # | Detection | Concrete test | Result |
|---|-----------|---------------|--------|
| 0 | Control (no false positives) | Face-present video + silent mic + focused fullscreen tab, 60s | **0 violations**; widget "✓ Face Detected" (was permanently "Basic monitoring" pre-fix) |
| 1 | no_face | Empty-scene video, 75s | 1 row `no_face`, severity **high** (62s episode, ≥30s sustained rule), snapshot evidence attached |
| 2 | multiple_faces | Two-face composite video | exactly 1 row, severity **high**, emitted at episode open, snapshot attached, trust 100→78 |
| 3 | gaze_away | Real turned-head video (headRatio 3.5 ≫ 2.0 threshold), 75s | 1 row `gaze_away`, 60s chunked episode → severity **high** (the d>60 escalation tier) |
| 4 | phone_detected | COCO phone photo video | 1 row, severity **high**, confidence 0.98, snapshot attached (+1 correct `no_face` — the photo has no face) |
| 5 | prohibited_object | Bookshelf video, 115s | 1 row, severity medium, confidence 0.895, 70s episode chunked at 60s cap |
| 6 | audio_detected (gapped) | Pink-noise 8s-on/4s-off loop, 45s | **5 rows**, one per burst, each ~8s duration — pre-fix this exact test produced 0 |
| 7 | audio_detected (continuous) | Continuous pink noise, 85s | exactly 1 row, 61s chunk → severity **high** — pre-fix 0 |
| 8 | tab_switch (short) | Real production TabGuard driven through browser event order (blur → hidden; visible → focus), 5s away | exactly 1 row `tab_switch` medium, **0 window_blur** (pre-fix: duplicate window_blur every time) |
| 9 | tab_switch (long) | Same, 20s away | initial medium row + 1 escalation row at 16s, severity **high** (server-derived from duration) |
| 10 | window_blur (sustained) | blur without visibility change, 4s | exactly 1 row (emitted ~1s in — no longer depends on the student ever refocusing) |
| 11 | window_blur (brief) | blur→focus in 400ms | exactly 1 row with endedAt (0.4s duration), no duplicate |
| 12 | fullscreen_exit + enforcement | Headed browser: auto-entered fullscreen on exam start (verified `fullscreenElement === true`), then `exitFullscreen()` | exactly 1 row severity **high**; blocking "Fullscreen Required" overlay covers the exam (screenshot); clicking "Return to Fullscreen" re-enters (`fullscreenElement === true` again) |
| 13 | Biometric preview | Screenshot sequence through the gate | live camera feed visible during face + ID steps (`video.readyState 4`, 640×480), captured face/ID thumbnails shown on Verified step |
| 14 | Resume (bonus fix) | Fresh browser, attempt already exists in DB | `POST /api/attempts` → **201** (pre-fix: 500 on real Postgres) |
| 15 | Dev mode | no_face scenario against `npm run dev` | 1 row with snapshot — pre-fix dev produced 0 rows even with models loading (disposed-buffer StrictMode bug) |

Notes on test mechanics, honestly stated:
- Rows 8–11 drive the production bundle's real TabGuard/buffer/API path but with the
  browser-delivered events simulated at the DOM contract level (overridden `visibilityState` +
  dispatched events in real order). Reason: Playwright's default launch args
  (`--disable-backgrounding-occluded-windows` etc.) suppress real occlusion/visibility
  signals, and macOS fullscreen Spaces make real tab/window juggling under automation
  unreliable — while the browser side of that contract is exactly the part the user's own
  usage already proved working (tab-switch was the one detector that worked). The app-side
  handling — where every one of these bugs lived — is what these rows verify end-to-end.
- Row 3's severity is high because the gaze episode ran the full 60s chunk; a shorter
  glance-away closes earlier and derives low/medium from its real duration.
- A real human+camera pass on detection *accuracy* (thresholds under real lighting, real
  gaze angles, real second person) remains worthwhile — what's verified here is that every
  detector's pipeline reliably produces correctly-typed, correctly-severitied, non-duplicated
  violations when its condition genuinely holds in front of the camera/mic.

## Architecture preserved
`ProctoringEventBuffer` batching (10s/20-event/high-immediate + new hidden-immediate),
server-side severity re-derivation (`deriveSeverity` untouched), trust-score weighting
(`computeTrustScore` untouched — live-observed updating 100→78→70 during tests), episode
hysteresis (`ConditionEpisode` untouched), clientSeq idempotency (observed `skipped` counts on
retries during testing).

## Gates
`tsc --noEmit` clean · `lint` unchanged 3-error/0-warning baseline · `vitest` 275/275 (two
mocked-Prisma tests updated to match the corrected attempts-route shape — full-row resume
return, out-of-transaction P2002 fallback) · `next build` clean · production `next start`
re-verified end-to-end after the final change.

## Files touched
`src/middleware.ts` · `src/app/api/attempts/route.ts` · `src/app/api/upload/route.ts` ·
`src/lib/proctoring/event-buffer.ts` · `src/components/proctoring/{AudioMonitor,TabGuard,
FullscreenGuard,FaceDetector,BiometricOnboarding,ProctoringOverlay}.tsx` ·
`tests/unit/attempts-{eligibility,pooling-concurrency}.test.ts`
