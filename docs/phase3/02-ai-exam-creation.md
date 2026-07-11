# Phase 3 — AI Exam Creation Architecture

Status: architecture proposal (no implementation yet)
Scope: turns the existing **mock** generator (`/api/ai/generate-questions` + `lib/ai/question-generator.ts`) into a real Claude-API-backed, asynchronous generation pipeline. The surrounding plumbing already exists from spec items 6–7 (2026-07-09): the route is item-bank-scoped and permission-checked (editor+), CLO-aware with cross-tenant CLO verification, batch-capped (`MAX_BATCH_SIZE = 15`), stamps `learningObjectiveId`, and lands drafts directly in the `Item` table. Phase 3 swaps the canned generator for Claude and makes the call async — it does **not** rebuild the flow.

## Flow (end to end)

```
Teacher (bank detail page, "Generate with AI" panel)
  │  course/topic/CLO (CurriculumPicker) + quantity + difficulty mix + qtype mix
  │  + optional free-text guidance ("focus on pointer arithmetic, avoid syntax trivia")
  ▼
POST /api/ai/generate-questions        ← unchanged auth surface: editor+ on target bank,
  │                                       CLO institution check, MAX_BATCH_SIZE zod cap
  │  creates GenerationJob row (status: queued), returns { jobId } immediately (202)
  ▼
Job runner (async, see "Where the job runs")
  │  builds prompt (CLO text, Bloom's level, difficulty, type distribution, dup-avoidance list)
  │  → Claude API (structured output / tool-use JSON schema)
  │  → validates + post-processes each item (schema, dedup, difficulty tag sanity)
  ▼
Item rows created: status = draft, bankId, learningObjectiveId, generation metadata
  ▼
Review queue: the bank's existing item list filtered to status=draft
  teacher edits/approves/rejects  →  approved items become normal bank items,
  usable by fixed selection AND item-8 dynamic pooling (blueprint counts only see approved)
```

Key property: **AI output never reaches a student without a human approve step.** The existing `ItemStatus` draft→approved lifecycle *is* the review queue — no new moderation subsystem, just a "Pending AI review (n)" filter/tab on the bank detail page and a batch-level review screen (approve/reject/edit per item, "approve all", diff-against-prompt view).

## Why async / job-based (not real-time)

- A 15-item batch with rationale + distractor quality is a long Claude call (potentially 30–90 s with retries) — beyond comfortable HTTP request lifetimes on Vercel serverless, and a terrible UX to block a form on.
- Failures (rate limit, overload, malformed JSON) need retry with backoff, which only makes sense in a job model.
- Job rows give an audit/cost trail for free.

**UX contract:** panel shows the job as "Generating… (queued → running → n/15 done)" via polling `GET /api/ai/jobs/[jobId]` (matching the codebase's existing polling idiom — notifications 30 s, results 15 s; Realtime is not needed for a single teacher watching their own job). On completion, the bank list refreshes with the new drafts highlighted. Teacher can navigate away; the existing notifications feed gains a "Your generation batch is ready for review" entry.

## Where the job runs — decision needed

| Option | Fit |
|---|---|
| A. Vercel background function / `waitUntil` | Zero new infra; ties job lifetime to Vercel limits (fine for ≤15 items); no queue semantics — a crash loses the job (job row's `status=running` + `startedAt` staleness check lets a sweeper mark it failed) |
| B. Cloudflare Worker + Queues | Real queue, retries, DLQ; new deploy surface + secrets duplication (DB + Anthropic key in two platforms) |
| C. Supabase Edge Function + pg_cron poller | Keeps everything in Supabase; pg-based polling is clunky but simple |

**Recommendation: A for v1** (batch cap of 15 keeps jobs small; the job *row* is the durability mechanism, the runtime is disposable), with the job runner written as a platform-agnostic function so moving to B later is a lift-and-shift. This is the same "start in-app, promote to Worker when scale demands" posture as the trust-score compute in `01-proctoring-signals.md`. Listed in consolidated open decisions.

## Claude API usage

- **Model:** default `claude-sonnet-5` for generation (quality-sensitive, cost-tolerable at ≤15 items/job); config-switchable per environment. Do not hardcode model IDs in call sites — one config constant, since model migration is routine.
- **Structured output:** define the item shape (stem, type, options[{text,isCorrect}], correctAnswer, explanation, difficulty, estimated Bloom's level) as a tool/JSON schema so responses are machine-parseable; reject-and-retry (max 2) on schema-invalid output rather than attempting repair heuristics.
- **Prompt composition** (server-side only, never client-supplied wholesale — teacher free-text is interpolated into a fixed frame, mitigating prompt-injection-shaped nonsense in guidance text):
  - CLO text + Bloom's level + learning domain (already resolved server-side with the item-7 cross-tenant check)
  - requested type distribution + difficulty distribution
  - **dup-avoidance context:** stems of existing approved items in the same bank under the same CLO (capped, e.g. most recent 30) with an explicit "do not duplicate or trivially rephrase these" instruction — first line of duplicate defense, cheap because it reuses the query the blueprint counts already run
- The ready-to-activate directive comment placed in the route during item 7 (`Phase 3: call Anthropic API here`) marks the exact seam.

## Schema — `GenerationJob` (new) + `Item` metadata (additive)

```
GenerationJob {
  id, institutionId, requestedById, itemBankId, learningObjectiveId?
  status        queued | running | succeeded | partial | failed
  requestedCount, producedCount
  promptParams  Json   — everything the prompt was built from (guidance text, mixes)
  model         String — exact model ID used
  inputTokens/outputTokens/costUsd — from the API response usage block
  error         String?
  createdAt, startedAt, finishedAt
}
Item (additive columns) {
  generationJobId  String?  — FK; null = human-authored (backward compatible, same
                              nullable-FK pattern as Question.attemptId / Item.bankId)
  aiGenerated      Boolean @default(false)
  reviewedById     String?  — who approved/rejected (audit)
}
```

`promptParams` + `model` + token counts on the job row give: per-tenant cost reporting (sum `costUsd` by `institutionId`), reproducibility for debugging bad batches, and an audit answer to "where did this question come from" — without bloating every `Item` row (items carry only the FK).

## Guardrails

1. **Tenant isolation** — already enforced (bank permission via `resolveBankPermission`, CLO institution check from item 7); the job runner re-checks bank→institution on execution, not just at enqueue, in case access was revoked between the two (jobs are async now — the enqueue-time check alone is no longer sufficient).
2. **Duplicate detection**, two layers:
   - *Prompt-side* (above): existing stems in context with a don't-duplicate instruction.
   - *Post-generation:* trigram similarity (`pg_trgm`, available on Supabase) between each generated stem and existing stems in the bank; above ~0.6 similarity, the item is still created but flagged `metadata.possibleDuplicateOfId` and badged "possible duplicate" in the review queue. Never silently dropped — the teacher decides. Embedding-based semantic dedup (pgvector) is the known upgrade path if trigram proves too literal; not v1.
3. **Difficulty tagging** — Claude's self-assessed difficulty is stored but badged "AI-estimated" in the review UI until real psychometrics exist; once `05-psychometrics.md`'s facility index flows, observed difficulty supersedes the estimate and large disagreements (AI said easy, p-value says hard) surface as a bank-health signal.
4. **Batch cap** — existing `MAX_BATCH_SIZE = 15` retained (also bounds job runtime and cost per job); per-institution daily generation cap (config, e.g. 200 items/day) as a cost circuit-breaker.
5. **No auto-approval, ever** — `status: draft` is unconditional on creation; there is no config to skip review in v1.
6. **Failure honesty** — partial batches (item-7's `Promise.all`-of-independent-creates decision carries over: a partial batch of drafts is harmless) mark the job `partial` with `producedCount < requestedCount`, shown as such in the panel rather than pretending success.

## "AI creation of exam" vs "AI creation of items" — scope note

Haris's Phase 3 note says "AI creation of exam." The architecture deliberately keeps generation **bank-scoped** (items land in a bank, then exams draw from banks) rather than resurrecting exam-scoped generation, because item 6 (2026-07-09) explicitly decoupled generation from the exam wizard and item 8's pooling/blueprint machinery already turns "a bank with CLO-tagged approved items" into "an exam" with zero extra AI surface. A future one-click "draft me a whole exam" flow composes the two existing pieces: generate → auto-fill a blueprint from the generated CLO distribution → teacher reviews both. Noted as a fast-follow, not part of the v1 generation pipeline.

## Open decisions for Haris

1. Job runtime home: Vercel background (recommended v1) vs Cloudflare Worker + Queues vs Supabase Edge Function.
2. Per-institution generation quota / cost ceiling — number, and whether admins can see a cost dashboard.
3. Whether teacher free-text guidance is allowed at all in v1 (adds prompt-quality variance) or v1 ships CLO+mix-only.
