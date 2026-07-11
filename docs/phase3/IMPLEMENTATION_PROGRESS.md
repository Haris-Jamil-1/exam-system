# Phase 3 Implementation Progress

Authority: full autonomy per Haris's kickoff prompt (2026-07-11). Decisions 1–12 locked in that prompt — do not re-litigate; log adaptations here.
Baseline before any Phase 3 code: `vitest` 63/63 · `tsc --noEmit` clean · lint 3 errors/1 warning (pre-existing) · `next build` 51 routes.
Note: `CLAUDE.md` has uncommitted edits by Haris (his own Phase 3 notes) — leave them out of Phase 3 commits unless updating the session log section.

## Track 1 — Proctoring signals (doc 01)

- [x] 1.1 Schema: `ViolationType` +`gaze_away`+`prohibited_object`; `Violation` +`confidence`/`endedAt`/`clientSeq`; new `ProctoringHeartbeat` table → applied + verified on live DB
- [x] 1.2 Trust score v2: server-side pure function (`src/lib/trust-score.ts`) with severity/duration/confidence weighting + per-type caps; unit tests; wired into submit route + violation ingest
- [x] 1.3 Batch ingest: `POST /api/violations` accepts event batches; server-side severity re-derivation (`src/lib/proctoring/severity.ts`); heartbeat upsert; clientSeq idempotency; NEW ownership check (student can only write to own attempt — was missing pre-Phase-3)
- [ ] 1.4 Client event pipeline: `ProctoringEventBuffer` (10s/20-event/immediate-high flush, sessionStorage mirror, clientSeq, 30s heartbeat); guards (Tab/Fullscreen) rewired through it
- [ ] 1.5 Real face detection: face-api.js (@vladmandic/face-api fork), self-hosted models in `public/models/`, episode-based no_face/multiple_faces with hysteresis; replaces `Math.random()` mock
- [ ] 1.6 Gaze: MediaPipe Face Landmarker (tasks-vision), coarse yaw/iris heuristic, sustained-episode `gaze_away`
- [ ] 1.7 Object detection: TF.js COCO-SSD on sampled frames (~10s), `phone_detected` / `prohibited_object`
- [ ] 1.8 Audio VAD upgrade: sustained-speech episodes (>5s) instead of instant RMS threshold spam
- [ ] 1.9 Evidence: snapshot auto-capture on high-severity only (decision 1), student-visible capture indicator (decision 3), 30-day retention purge job
- [ ] 1.10 Consent notice line on the pre-exam instructions screen (decision 1)
- [ ] 1.11 Verification: tsc/lint/build/vitest + live QA of event flow end-to-end

## Track 2 — Live monitoring (doc 04)

- [ ] 2.1 Surgical RLS on `Violation`/`ExamAttempt`/`ProctoringHeartbeat` (decision 2 — narrows SEC-08 accepted-risk scope: RLS added ONLY to these 3 tables to gate Realtime reads; app routes keep using service-role connection; annotate CLAUDE.md, don't erase the sign-off)
- [ ] 2.2 Realtime subscriptions on teacher monitor pages (replace 10s polling; keep polling as websocket fallback)
- [ ] 2.3 Roster grid: attempt state, trust score, heartbeat freshness, needs-attention sort
- [ ] 2.4 `SnapshotRequest` table + on-demand snapshot round trip + student-side indicator
- [ ] 2.5 Teacher actions: warn student (banner via per-attempt channel), force-submit
- [ ] 2.6 Alerts: badge default; push only for multi-face/phone/sustained-no-face (decision 12; Web Push may slip to follow-up — scope valve per doc 04)
- [ ] 2.7 Verification pass

## Track 3a — AI exam creation (doc 02)

- [ ] 3a.1 Schema: `GenerationJob`, `Item` +`generationJobId`/`aiGenerated`/`reviewedById`; Institution AI quota fields (decision 5: monthly quota default 1000 + usage counter, hard stop)
- [ ] 3a.2 Real Claude API call (structured output), async job via Vercel background pattern (decision 6), model in one config constant
- [ ] 3a.3 Dup detection: prompt-side stems + pg_trgm post-check flag
- [ ] 3a.4 Review queue UI: draft filter/tab + batch review on bank page; job status polling endpoint
- [ ] 3a.5 Verification pass

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

Last state: 1.1 done and committed. **ENVIRONMENT BLOCKER**: current network blocks outbound Postgres ports (5432/6543) — `prisma db push` and any live pg connection (including the dev server) cannot reach the DB from this machine right now. Workaround in place: `scripts/mgmt-sql.sh` runs SQL over HTTPS via the Supabase Management API (CLI keychain token); schema changes applied + verified that way. Live-server QA is blocked until the network allows pg egress — lean on unit tests/build; queue live QA steps in a checklist for when connectivity returns.
Next step: 1.2 trust score v2 (`src/lib/trust-score.ts` + tests, wire into submit route).
