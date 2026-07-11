# Phase 3 — Proctoring Signals Architecture

Status: architecture proposal (no implementation yet)
Scope: replaces the Phase-2 mock detectors (`FaceDetector.tsx`, the tab/fullscreen/audio monitors behind `ProctoringOverlay`) with real client-side detection, a unified event pipeline, and a server-authoritative trust score.

## Design principles

1. **Detection runs on the student's device; the server receives events, never raw media.** Webcam and mic streams stay inside the browser. What crosses the network is a small structured event (type, severity, confidence, timestamp) — cheap, privacy-preserving, and immune to the bandwidth/cost problems of streaming video for every concurrent attempt.
2. **The client is untrusted.** Every client-side signal is treated as *evidence*, not verdict. Anything with scoring consequences (trust score, violation counts, auto-flagging) is computed server-side from persisted events. A student who tampers with the client can suppress events, but can never *improve* their own score — and suppression itself is detectable (see heartbeat, below).
3. **Build on what exists.** Phase 2 already has the `Violation` model (`type`, `severity`, `description`, `screenshotUrl`, `metadata Json`, `timestamp`, FKs to attempt/student/exam), the `ViolationType` enum (`tab_switch`, `window_blur`, `fullscreen_exit`, `no_face`, `multiple_faces`, `audio_detected`, `phone_detected`), `POST /api/violations`, and `ExamAttempt.trustScore`/`violationCount`. Phase 3 upgrades the *producers* and the *scoring*, not the storage model — the existing schema needs only additive extensions.

---

## Signal 1 — Face presence & multiple faces

**Approach:** client-side **face-api.js** running against the webcam `MediaStream` already acquired by the biometric gate. Models (TinyFaceDetector + landmarks, ~2–6 MB total) served from `/public/models/` — already the plan of record in CLAUDE.md's Phase 3 notes.

- **Sampling cadence:** one detection pass every ~2 seconds on a downscaled offscreen canvas (e.g. 320px wide), not per-frame. Face detection at exam-webcam quality does not need 30 fps; 0.5 Hz keeps CPU low enough for old laptops and Flutter WebView clients.
- **Detection output per pass:** face count + per-face confidence. Mapped to events:
  - `no_face` — zero faces for N consecutive passes (default N=3, ≈6 s) to debounce students leaning out of frame momentarily. Severity `medium`.
  - `multiple_faces` — ≥2 faces above a confidence floor (e.g. 0.6) for ≥2 consecutive passes. Severity `high` (this is the classic "someone is helping" signal).
- **Hysteresis, not spam:** an ongoing condition emits one *start* event and one *end* event (with duration in `metadata`), not an event per pass. The dashboard and trust score both work better with episodes than with a firehose.
- **Evidence:** on episode start, optionally capture a single downscaled JPEG frame into `Violation.screenshotUrl` (existing field, Supabase Storage `exam-uploads`). Whether this capture is on/off is part of the retention policy decision below.
- **Identity continuity (stretch, not v1):** face-api.js can compute embeddings; comparing periodic embeddings against the biometric-gate enrollment embedding would catch a person-swap mid-exam. Flagged as stretch because false-positive cost is high and it raises the retention-policy stakes (embeddings are biometric data).

## Signal 2 — Tab switch / window blur

Cheapest and most reliable signal; Phase 2 already emits these. Phase 3 changes are about *quality*, not mechanism:

- **Sources:** `visibilitychange` (tab switch, minimize) and window `blur`/`focus` (alt-tab to another app — fires even when the tab stays visible on multi-monitor setups). Keep both; they catch different behaviors. `fullscreen_exit` stays as-is.
- **Batching:** rather than one POST per blur, events go into the client-side event buffer (see unified pipeline) and flush on the shared cadence. Return-to-tab flushes immediately so the teacher dashboard sees the episode with its duration.
- **Severity escalation:** first offense `low`; repeated offenses or absence > 15 s escalate to `medium`/`high` via *server-side* rules (client just reports raw durations — severity policy lives server-side so it can be tuned without shipping client updates). Note this is a change from Phase 2, where the client picks the severity it sends; the server becomes the authority.

## Signal 3 — Background noise / voices

**Approach:** **Web Audio API** analysis on the mic stream, entirely client-side — an `AudioWorklet` computing per-frame RMS energy plus a lightweight VAD (voice activity detection).

- **VAD choice:** start with energy + zero-crossing-rate heuristics (no model download, ~zero CPU); if precision is poor in real rooms, upgrade to **Silero VAD via onnxruntime-web** (~2 MB, well-proven, still fully client-side). Ship the heuristic first; the event schema doesn't change either way.
- **What gets flagged:**
  - *Sustained speech* — voice activity above threshold for > ~5 s continuous (a student muttering to themselves briefly should not flag). Severity `low`→`medium` by duration.
  - *Multiple voices* — true multi-speaker diarization client-side is not realistic; the practical proxy is *speech overlapping with periods where the student's lips aren't moving* — but that couples audio to face mesh and is fragile. **v1 flags sustained speech only** and labels it `audio_detected`; multi-voice is explicitly out of scope for v1 and noted as a stretch item.
- **No raw audio leaves the client** in the default design. If the retention-policy decision (below) lands on "high-severity events need evidence," the buffer design would be: a rolling 10 s in-memory audio ring buffer; on a `high`-severity audio event, encode that clip (Opus, ~20 KB) and upload alongside the violation. This is **off** unless Haris opts in — it is the single most privacy-sensitive choice in this document.

## Signal 4 — Abnormal gaze

Two candidate approaches were evaluated:

| | MediaPipe Face Mesh + heuristic | Dedicated gaze model (e.g. WebGazer, custom CNN) |
|---|---|---|
| Runs client-side | Yes (WASM/WebGL, ~11 MB) | WebGazer yes; custom models often need server-side frames |
| Accuracy need | Coarse ("looking far off-screen, sustained") | Fine-grained point-of-gaze — more than we need |
| Calibration | None needed for coarse detection | WebGazer needs per-user calibration clicks |
| Maintenance | Google-maintained, stable | WebGazer is semi-abandoned; custom = ongoing ML ops |

**Recommendation: MediaPipe Face Mesh + heuristic, client-side.** Compute head pose (yaw/pitch from the 3D landmark PnP solve) plus iris offset (Face Mesh includes iris landmarks). Flag only *coarse, sustained* deviation: e.g. |yaw| > 30° or iris fully cornered for > 8 s, with the same episode/hysteresis model as face presence. Fine-grained gaze tracking is deliberately out of scope — it's inaccurate without calibration and generates false positives that erode teacher trust in the whole system.

**Server-side frame sampling is NOT needed for gaze** under this design. The only scenario that would force server-side analysis is a future requirement for human-reviewable gaze evidence or model-quality audits — if that arrives, the snapshot mechanism (Signal 1 / live-monitoring's on-demand snapshot) already provides the transport; no new pipeline required.

**Note:** this runs on the *same* 0.5 Hz sampled frames as Signal 1 — one shared frame-sampling loop feeds face count, gaze pose, and (below) object detection on an interleaved schedule, so total CPU stays bounded.

New `ViolationType` value required: `gaze_away` (additive enum migration).

## Signal 5 — Object detection (phone / notes / second person's belongings)

**Approach:** **TF.js COCO-SSD** (lite_mobilenet_v2 backbone, ~1 MB weights via CDN→self-hosted under `/public/models/`) on **sampled frames only** — every ~10 s, interleaved into the shared frame loop, *not* every frame. COCO-SSD relevant classes: `cell phone`, `book`, `laptop`, `person` (count cross-check with face-api).

- `phone_detected` (existing enum value) on `cell phone` ≥ 0.55 confidence in ≥ 2 of 3 consecutive samples. Severity `high`.
- `book`/`laptop` map to a new `prohibited_object` type (additive enum migration), severity `medium`, with class + confidence in `metadata`.
- **Honest accuracy note:** COCO-SSD on webcam-quality frames will miss phones held low/off-frame and has no concept of "notes" (paper sheets aren't a COCO class — `book` is the nearest proxy and will under-detect loose paper). A fine-tuned model (phone-in-hand, paper on desk) is the known upgrade path; architecture treats the detector as a swappable module behind the same event contract so fine-tuning later changes zero pipeline code. Do **not** promise "notes detection" in teacher-facing UI copy for v1 — say "prohibited objects (phone, book, laptop)".

## Heartbeat (anti-suppression)

Because the client is untrusted, silence must be distinguishable from tampering. The proctoring runtime emits a low-priority `heartbeat` event every 30 s (not a Violation — see event schema). A Worker-side check (same scheduled job family as trust scoring) flags attempts whose heartbeats stop while the attempt is still `in_progress` as `proctoring_interrupted` — surfaced on the teacher dashboard, factored into trust score as a soft penalty. This closes the "open dev tools, kill the detectors, keep the exam page" hole to the extent possible without kernel-level lockdown (which is explicitly not this product's posture).

---

## Unified proctoring event schema

One event type flows through the whole system, produced by every detector above:

```
ProctoringEvent {
  id             — client-generated UUID (idempotency key for retries)
  attemptId      — the exam session (maps to ExamAttempt.id)
  type           — extended ViolationType: tab_switch | window_blur | fullscreen_exit |
                   no_face | multiple_faces | audio_detected | phone_detected |
                   gaze_away | prohibited_object | heartbeat
  severity       — info | low | medium | high   (client-suggested; server may re-derive)
  confidence     — 0..1 (detector confidence; 1.0 for deterministic signals like tab_switch)
  startedAt      — episode start (client clock)
  endedAt        — episode end, null while ongoing
  clientSeq      — monotonic per-attempt counter (gap detection = dropped/suppressed events)
  metadata       — detector-specific JSON (face count, yaw angle, object class, duration…)
  evidenceUrl    — optional Storage pointer (snapshot/clip), governed by retention policy
}
```

**Mapping to existing schema:** everything except `heartbeat` persists into the existing `Violation` table — additive columns: `confidence Float?`, `endedAt DateTime?`, `clientSeq Int?`, plus the two new enum values. `heartbeat`/`info` events go to a separate lightweight `ProctoringHeartbeat` table (attemptId, lastSeq, lastSeenAt — one upserted row per attempt, not an append log) so the Violation table stays meaningful for teachers.

**Transport & batching:** client buffers events in memory (mirrored to `sessionStorage` for refresh survival), flushes every 10 s or at 20 events or immediately on any `high`-severity event, whichever first. Flush target: the existing authenticated `POST /api/violations` route extended to accept batches — **not** direct Supabase inserts from the browser, because (a) SEC-08: this project has no RLS, so client-writable tables are off the table as an accepted-risk boundary, and (b) the API route is where server-side severity re-derivation and heartbeat upserting happen. The *teacher dashboard* subscribes to these rows via Supabase Realtime (postgres_changes on `Violation`) — see `04-live-monitoring.md`; Realtime is the fan-out mechanism, the API route is the ingest mechanism.

**Ordering & loss:** `clientSeq` lets the server detect gaps (suppressed or lost batches) per attempt; gaps above a threshold trigger the same `proctoring_interrupted` flag as heartbeat loss.

## Trust score — server-side only

Phase 2 already computes `trustScore = max(0, 100 - violationCount * 15)` server-side at submit. Phase 3 replaces the formula, keeps the authority model, and moves computation to a place that can also run *during* the attempt:

- **Where:** a **Cloudflare Worker** (scheduled + on-demand via the submit route) or a Supabase Edge Function — both satisfy "server-side, never client-controlled." Recommendation: **start as a pure function in `lib/` invoked from the existing Next.js submit route** (zero new infra, same trust boundary), and lift it to a Worker only when live-monitoring needs mid-exam recomputation on a schedule. The scoring *function* is identical in all three homes; this is a deployment decision, not a design one. Flagged in open decisions.
- **Formula shape (v1 proposal):** weighted, severity- and duration-aware instead of flat count:
  `100 − Σ events( baseWeight[type] × severityMultiplier × min(durationFactor, cap) )`, floor 0, with per-type caps so one noisy detector (e.g. gaze) can't zero a score alone, and `confidence` scaling each event's contribution. Exact weights are a tuning exercise once real event distributions exist — the architecture commitment is only: *inputs are persisted events, computation is server-side, weights live in server config.*
- Client never sends, sees, or influences the trust score computation beyond producing evidence events (unchanged from the C3/C4 fixes of 2026-06-25).

## Performance budget (client)

Shared frame loop on downscaled canvas: face-api pass every 2 s, gaze pose from the same landmarks, COCO-SSD every 10 s, AudioWorklet continuous but trivial-cost. Target: < 15% of one core on a 2018-era laptop, zero jank on the exam UI (all inference on `requestIdleCallback`-scheduled ticks; consider a Web Worker + OffscreenCanvas if profiling shows main-thread pressure). If a device can't keep the budget, the runtime degrades by *lengthening intervals*, never by silently disabling a detector — degradation itself is reported in heartbeat metadata.

## Flutter client note

The stack list includes Flutter (mobile client, planned). This document's contract is deliberately *client-agnostic*: any client that produces `ProctoringEvent` batches against `POST /api/violations` is a valid producer. On Flutter, the equivalent detectors are `google_mlkit_face_detection`/`face_mesh_detection` (MediaPipe under the hood — same signal semantics) and `tflite_flutter` for object detection; tab-switch maps to app-lifecycle (background/foreground) events. No server-side changes needed to onboard the Flutter client later.

---

## ⚠️ Open decision for Haris — raw media retention policy (do not implement until decided)

Everything above works with **zero raw video/audio ever leaving the device**. The open question is evidence: when a teacher sees `multiple_faces, high, 14:32`, can they see *proof*?

Options, in increasing invasiveness:

| Level | What's stored | Trade-off |
|---|---|---|
| A. Events only | Nothing but event rows | Max privacy, min storage cost; disputes are word-vs-word |
| B. Snapshot on high-severity (recommended default) | One downscaled JPEG per high-severity episode → `Violation.screenshotUrl` | Small, targeted, uses existing field; still captures a minor's/student's image — needs consent language |
| C. Short A/V clips on high-severity | ~10 s rolling-buffer clip per high event | Real evidence for audio events; meaningful storage + much heavier consent/GDPR/FERPA surface |
| D. Full session recording | Everything | Explicitly rejected: cost, privacy, and it contradicts the events-not-media architecture |

Needs Haris's call on: (1) which level, (2) retention duration (e.g. purge 30/90 days after results publish), (3) whether students must see a consent notice enumerating exactly what's captured (recommended regardless of level), (4) per-institution configurability vs one global policy. **Not deciding this silently** — B is the recommended default, but it is a policy choice, not an engineering one.

## New/changed surface summary (all additive)

- `ViolationType` + `gaze_away`, `prohibited_object` · `Violation` + `confidence`, `endedAt`, `clientSeq` · new `ProctoringHeartbeat` table
- `POST /api/violations` accepts batched events; server-side severity re-derivation
- New client proctoring runtime (shared frame loop + AudioWorklet + event buffer) replacing mock detectors
- Trust score formula v2 as a server-side pure function; deployment home flagged as open decision
- Model assets self-hosted under `/public/models/` (face-api, MediaPipe WASM, COCO-SSD)
