# Phase 3 Implementation Progress

Authority: full autonomy per Haris's kickoff prompt (2026-07-11). Decisions 1–12 locked in that prompt — do not re-litigate; log adaptations here.
Baseline before any Phase 3 code: `vitest` 63/63 · `tsc --noEmit` clean · lint 3 errors/1 warning (pre-existing) · `next build` 51 routes.
Note: `CLAUDE.md` has uncommitted edits by Haris (his own Phase 3 notes) — leave them out of Phase 3 commits unless updating the session log section.

## Track 1 — Proctoring signals (doc 01)

- [x] 1.1 Schema: `ViolationType` +`gaze_away`+`prohibited_object`; `Violation` +`confidence`/`endedAt`/`clientSeq`; new `ProctoringHeartbeat` table → applied + verified on live DB
- [x] 1.2 Trust score v2: server-side pure function (`src/lib/trust-score.ts`) with severity/duration/confidence weighting + per-type caps; unit tests; wired into submit route + violation ingest
- [x] 1.3 Batch ingest: `POST /api/violations` accepts event batches; server-side severity re-derivation (`src/lib/proctoring/severity.ts`); heartbeat upsert; clientSeq idempotency; NEW ownership check (student can only write to own attempt — was missing pre-Phase-3)
- [x] 1.4 Client event pipeline: `ProctoringEventBuffer` (10s/20-event/immediate-high flush, sessionStorage mirror, clientSeq, 30s heartbeat); guards rewired; dead `useProctoring` hook removed
- [x] 1.5 Real face detection — **ADAPTATION**: used MediaPipe Face Landmarker for BOTH face count and gaze instead of face-api.js + MediaPipe (one runtime/model instead of three; same signals). Episode hysteresis via `ConditionEpisode`; long episodes chunk at 60s for monitor timeliness
- [x] 1.6 Gaze: coarse nose-to-cheek ratio + both-irises-cornered heuristic (`src/lib/proctoring/gaze.ts`), sustained-episode `gaze_away`
- [x] 1.7 Object detection: COCO-SSD self-hosted (`public/models/coco-ssd`, ~19MB in repo), phone=emit-at-open+snapshot, book/laptop=`prohibited_object` at close
- [x] 1.8 Audio VAD upgrade: sustained ≥5s episodes, 2s-quiet close, confidence from mean level
- [x] 1.9 Evidence: snapshot (320px JPEG → private storage path in screenshotUrl) only on multi-face/phone/sustained-no-face; capture indicator in widget; `/api/cron/purge-evidence` daily (30-day retention, vercel.json cron)
- [x] 1.10 Consent notice on instructions screen (proctored exams only)
- [ ] 1.11 Verification: tsc/lint/build/vitest + live QA of event flow end-to-end

## Track 2 — Live monitoring (doc 04)

- [x] 2.1 Surgical RLS — 4 tables (`Violation`/`ExamAttempt`/`ProctoringHeartbeat`/`MonitorDirective`), SELECT-only policies for authenticated, no write policies (bonus: direct PostgREST writes now denied). Prisma unaffected (connects as table owner, non-FORCE RLS). Applied+verified live via Management API. CLAUDE.md annotation pending (F.2)
- [x] 2.2 Realtime on per-exam monitor: `useMonitorRealtime` (debounced refresh triggers), polling fallback (10s down/60s live), Live/Polling badge. **Scope note**: cross-exam `teacher/monitor` overview page left on its existing polling (no single examId to filter on; v1 call)
- [x] 2.3 Roster: heartbeat-stale (90s) → 'disconnected', 'not_started', needs-attention sort, flagged on any high-severity or trust<60
- [x] 2.4 **ADAPTATION**: one `MonitorDirective` table (kind: snapshot|warning|force_submit) instead of separate SnapshotRequest — covers all teacher actions + audit in one mechanism. Snapshot round trip: directive → student Realtime/20s-poll → captureRef → upload → fulfilled → teacher polls → signed URL via `/api/evidence`. Capture indicator fires on student widget
- [x] 2.5 Teacher actions: warning banner (amber, dismissible) + force-submit (directive for live clients / `force-finalize` endpoint for dead ones — closes the browser-died-mid-exam gap)
- [x] 2.6 Decision 12: browser `Notification` when monitor tab hidden, high-severity only; full Web Push (service worker) deferred per doc 04's scope valve
- [ ] 2.7 Verification pass (tsc/lint/build/vitest green at baseline; live QA still blocked by network — see blocker note)

## Track 3a — AI exam creation (doc 02)

- [x] 3a.1 Schema: `GenerationJob`, `Item` +`generationJobId`/`aiGenerated`/`reviewedById`; Institution quota fields — applied+verified live; pg_trgm extension enabled
- [x] 3a.2 Real Claude call (`claude-sonnet-5` via `AI_MODEL` env-overridable constant, structured output, zod, retry≤2, injection-hardened frame); async via `after()` + job row; **mock fallback when no ANTHROPIC_API_KEY** (this env has none — real path activates when key lands on Vercel, job.model records which ran)
- [x] 3a.3 Dup detection: 30 recent approved stems in prompt + pg_trgm >0.6 → `ai-possible-duplicate` tag
- [x] 3a.4 Review affordances: 'AI' + 'possible duplicate' badges on bank list (status filter already existed); AiGeneratePanel polls `/api/ai/jobs/[jobId]` (3s), reports partial batches; quota 429 surfaces in panel. NOTE: `Item.reviewedById` stamping on approve/reject not yet wired into the approve flow — do with 3b review UI or F.1
- [x] 3a.5 Verification: tsc clean · 91/91 tests · lint baseline · build green (live QA still blocked by network)

## Track 3b — AI grading (doc 03)

- [ ] 3b.1 Schema: `Rubric`, `AnswerGrading`, `Answer.gradingStatus`, question rubric/testCases fields
- [ ] 3b.2 Two-stage submit: essay/coding → pending_ai; deterministic types unchanged; finalize recomputes via existing scoring
- [ ] 3b.3 Essay grading job (Claude structured output, rubric-based, injection-hardened prompt frame)
- [ ] 3b.4 Judge0 self-hosted via Docker (decision 7): docker-compose + execution client + hidden test cases
- [ ] 3b.5 Coding combined score (test weight + AI quality review)
- [ ] 3b.6 Teacher review UI on TCH-03 page: confirm/override/regrade; grading dashboard queue (decision 4: always-explicit confirm)
- [ ] 3b.7 Verification pass

## Track 4 — Psychometrics (doc 05)

- [ ] 4.1 Schema: `ItemAdministrationStat`, `ExamReliabilityStat`, `Question.sourceItemId` (+stamp it in materialization paths)
- [ ] 4.2 FastAPI service (numpy/pandas/scipy): p-value, corrected point-biserial, alpha/KR-20, distractor analysis; min-N gating (decision 10: hide <10, low-confidence <30); NO IRT (decision 11)
- [ ] 4.3 Trigger: on-exam-close enqueue + nightly sweep; app-side internal call
- [ ] 4.4 Surfacing: real FI/DI in bank item list, administration stats on results page
- [ ] 4.5 Verification pass

## Final

- [ ] F.1 Full regression: tsc/lint/build/vitest, live QA pass
- [ ] F.2 Update CLAUDE.md session log (incl. SEC-08 annotation) + commit

## Status notes

**ENVIRONMENT BLOCKER (still active)**: this network blocks outbound Postgres ports (5432/6543) — the dev server cannot reach the DB, so live end-to-end QA is impossible this session. Workaround for DDL/verification: `scripts/mgmt-sql.sh` (SQL over HTTPS via Supabase Management API, CLI keychain token). All schema changes applied + row-level verified that way. **Deferred live-QA checklist** (run when pg egress returns): (1) student exam flow with proctoring on — verify batched events land in Violation with server-derived severity, heartbeat row updates every 30s, trust score updates mid-exam; (2) face/gaze/object detectors against a real webcam (model loading, episode debounce, snapshot on multi-face/phone); (3) teacher monitor — Realtime badge shows Live, roster disconnected state after killing student tab (90s), snapshot round trip <5s, warning banner, force-submit both paths; (4) evidence signed-URL view + purge cron dry run.

Last state: tracks 1 and 2 fully committed (3 commits); tsc/lint/build/vitest all green at pre-existing baseline (91 tests).
Next step: track 3a — AI exam creation (schema: GenerationJob + Item columns + institution AI quota, then Claude call + job runner + review queue).
