# Phase 3 — Integration Summary

Status: architecture proposal (no implementation yet)
Companion to: `01-proctoring-signals.md` · `02-ai-exam-creation.md` · `03-ai-grading.md` · `04-live-monitoring.md` · `05-psychometrics.md`

## How the five areas connect (textual diagram)

The shared spine is the **exam session** (`ExamAttempt` + its `Answer`, `Violation`, `SectionAttempt` children) and the **item lifecycle** (`Item` → `Question` copy → answered → measured):

```
                        ITEM LIFECYCLE
  [02 AI Creation] ──GenerationJob──▶ Item (draft) ──teacher review──▶ Item (approved)
                                        │  aiGenerated, generationJobId          │
                                        │                    fixed selection / item-8 pooling
                                        ▼                                        ▼
  [05 Psychometrics] ◀─sourceItemId── Question (per-exam / per-attempt copy)
        ▲    writes Item.facilityIndex/discriminationIndex                       │
        │    + ItemAdministrationStat / ExamReliabilityStat                      │
        │    (batch: exam close + nightly, Python service)                       │
        │                                                                        ▼
        └───────────────reads marksAwarded─────────────── Answer ◀── student submits
                                                             ▲
                        EXAM SESSION (ExamAttempt)           │ marksAwarded set by:
                                                             │  deterministic scorer (unchanged)
  [03 AI Grading] ──GradingJob──▶ AnswerGrading log ─────────┘  or teacher confirm/override
        │    essay: Claude+Rubric · coding: Judge0 sandbox + Claude review          of AI suggestion
        │    finalize → existing computeSectionScores → ExamAttempt.score
        │
  [01 Proctoring] student client detectors (face/gaze/audio/objects/tab, events only)
        │            └──batched ProctoringEvents──▶ POST /api/violations
        │                     ▼                              ▼
        │              Violation rows            ProctoringHeartbeat (liveness)
        │                     │                              │
        │                     ▼                              │
        │            TRUST SCORE (server-side pure fn) ──▶ ExamAttempt.trustScore
        │                     │
  [04 Live Monitoring] ◀──Supabase Realtime (Violation / ExamAttempt / heartbeat)──┘
         teacher monitor: roster + event feed + on-demand SnapshotRequest
         actions: warn student, force-submit ──▶ existing submit path (auto_submitted)
```

Reading the joints:

- **01 → 04** is one pipeline, split by role: the student client *produces* events through the authenticated API route; the teacher monitor *consumes* the resulting rows via Realtime. Trust score sits between them, server-side, feeding both the live roster and the final attempt record.
- **02 → 05** closes a loop: AI-estimated difficulty at creation is superseded by observed facility index once administrations exist, and large disagreement is itself a bank-health signal.
- **03 → 05**: regrades change `marksAwarded`, which is why psychometrics recomputation is idempotent-upsert per administration with a nightly sweep, not compute-once.
- **03 → item 9**: AI-graded finalization deliberately re-enters the *existing* section-scoring path (`computeSectionScores`) rather than growing a parallel one.
- **02 → item 8**: generated items become pool-eligible only on approval, so the blueprint counts teachers see never include unreviewed AI output.
- **Shared job pattern**: 02's GenerationJob, 03's GradingJob, and 05's compute runs all use the same job-row-is-durability model with async-time re-validation of permissions — one pattern, three consumers.

## New tools & libraries

| Tool / library | Area | Justification |
|---|---|---|
| face-api.js (self-hosted models) | 01 | Face count/presence in-browser; already the plan of record; small models, no server round-trip |
| MediaPipe Face Mesh (WASM) | 01 | Head-pose + iris landmarks for coarse gaze heuristic; maintained by Google; beats semi-abandoned WebGazer and avoids server-side frames entirely |
| TF.js COCO-SSD (lite backbone) | 01 | Phone/book/laptop detection on sampled frames; ~1 MB; swappable behind the event contract when a fine-tuned model is warranted |
| Web Audio API + AudioWorklet (heuristic VAD; Silero VAD via onnxruntime-web as upgrade) | 01 | Sustained-speech detection with zero raw audio upload; heuristic first, model only if precision demands |
| Anthropic API — `claude-sonnet-5`, structured/tool output | 02, 03 | Item generation, rubric-based essay grading, code-quality review; JSON-schema outputs keep responses machine-parseable; single config constant for the model ID |
| Judge0 (self-hosted preferred) | 03 | Purpose-built arbitrary-code execution sandbox with per-run limits; explicitly instead of Cloudflare Workers, which cannot safely run untrusted multi-language code |
| Supabase Realtime (postgres_changes) | 04 | Replaces 10 s polling on monitor pages; read fan-out of API-written rows; polling retained as websocket fallback |
| Web Push (service worker) | 04 | High-severity alerts when the teacher isn't on the monitor tab; scope valve — v1 may ship badge/toast only |
| pg_trgm (Supabase extension) | 02 | Cheap post-generation duplicate detection; pgvector semantic dedup is the flagged upgrade path |
| Small Python service (FastAPI-style; numpy/pandas/scipy; `py-irt`/`girth` if IRT lands) | 05 | Battle-tested stats implementations vs hand-rolled Node math; matches existing skillset; makes the IRT stretch a library import instead of a rewrite; read-only DB access, writes only stats tables |
| Cloudflare Workers / Queues | 02, 01 (deferred) | *Not required for v1* — named as the promotion target for job runtime and trust-score scheduling if/when Vercel-background limits bite; kept out of v1 to avoid a second deploy surface prematurely |

New schema surface (all additive, consistent with the project's nullable-FK conventions): `ProctoringHeartbeat`, `SnapshotRequest`, `GenerationJob`, `Rubric`, `AnswerGrading`, `ItemAdministrationStat`, `ExamReliabilityStat`; additive columns on `Violation`, `Item`, `Question` (`sourceItemId`), `Answer` (`gradingStatus`); two new `ViolationType` values.

## Consolidated open decisions — need Haris's input

**Policy (blocking — don't build past them silently):**

1. **Raw media retention (01)** — the big one. Level A (events only) / **B (snapshot on high-severity — recommended)** / C (short A/V clips) / D (full recording — rejected). Plus: retention duration, student consent notice (recommended regardless), per-institution configurability.
2. **RLS for Realtime (04)** — surgical RLS on `Violation`/`ExamAttempt`/`ProctoringHeartbeat` (recommended; partially reopens the SEC-08 accepted-risk sign-off from 2026-07-06, as the first step of the already-planned post-Phase-3 RLS revisit) vs Broadcast channels with auth callbacks.
3. **Snapshot transparency (04)** — visible indicator on the student's screen when a teacher pulls a snapshot? (Recommend visible — deterrence + simpler consent story.)
4. **AI grading confirmation policy (03)** — always-explicit teacher confirmation (recommended) vs auto-confirm high-confidence suggestions after N days. And: is teacher-approved AI feedback shown to students by default or opt-in?
5. **Cost ceilings (02, 03)** — per-institution generation/grading quota numbers, and whether admins get a cost dashboard.

**Infrastructure (recommendation given; sign-off wanted):**

6. **Async job runtime (02, 03)** — Vercel background functions for v1 (recommended) vs Cloudflare Worker + Queues vs Supabase Edge Functions; trust-score compute follows the same call.
7. **Code sandbox hosting (03)** — self-hosted Judge0 (recommended, ~$5–10/mo VM, code stays on our infra) vs Judge0 hosted API (zero ops, student code leaves our infra).
8. **Python stats service hosting (05)** — Fly.io/Railway/Render; possibly co-located with Judge0 if self-hosting.

**Scope (cheap to decide, cheap to change):**

9. **Teacher free-text guidance in generation prompts (02)** — allow in v1, or CLO + distribution mixes only.
10. **Minimum-N display gates (05)** — proposed 10 (p-value) / 30 (discrimination) before teachers see real numbers.
11. **IRT (05)** — inside Phase 3 or parked for Phase 4 (recommend park).
12. **Alert defaults (04)** — which severities push vs badge out of the box; per-exam customization in v1?

## Suggested build order

Dependencies suggest: **01 → 04** as one track (04 consumes 01's events; 01 is independently shippable with the existing polling monitor), **02 → 03** as a second track (03 reuses 02's job pattern and Claude plumbing; 02 is the smaller lift since item 6–7 built most of its surface), **05 last** (it consumes finalized answers from everything else and closes item 8's stats gap once real data flows). Policy decisions 1–2 gate the start of track one; 6–7 gate track two.
