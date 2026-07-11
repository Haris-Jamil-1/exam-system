# Phase 3 — Psychometrics Architecture

Status: architecture proposal (no implementation yet)
Scope: replaces the random FI%/DI% placeholders in `teacher/items` with real, answer-derived statistics, and finally populates `Item.facilityIndex` / `Item.discriminationIndex` — schema fields that have existed since Phase 2 with **no calculator anywhere in the codebase** (confirmed during item 8's audit). Also directly closes item 8's known scope-limited gap: per-item stats for pooled exams, where each item was answered by only the subset of students who drew it.

## Statistics computed

| Statistic | Definition | Notes |
|---|---|---|
| **Facility index (p-value)** | mean(marksAwarded) / maxMarks per item | Works for polytomous items (partial credit — `marksAwarded` is `Float` since SCR-05), not just 0/1. Interpretation bands for the UI: <0.3 hard, 0.3–0.7 moderate, >0.7 easy |
| **Discrimination index** | Item–total point-biserial correlation (corrected: item score vs total-minus-this-item, avoiding self-correlation inflation) | Preferred over the classic upper-27%/lower-27% split because pooled exams give small, uneven per-item samples where fixed-fraction splits fall apart. Bands: <0.2 review, 0.2–0.4 acceptable, >0.4 good |
| **Reliability** | Cronbach's alpha (general, handles partial credit); KR-20 reported when all items are dichotomous (it's the special case) | Per *administration*, not per item. For pooled exams, alpha over a sparse matrix is not meaningful as-is — see pooling section |
| **Distractor analysis** | Per-option selection frequency, split by total-score quartile | Cheap to compute alongside p-values; the single most actionable output for item writers ("nobody picks distractor C") |
| **IRT (1PL/2PL)** — *stretch goal* | Latent-trait difficulty/discrimination via `py-irt` or `girth` | Flagged stretch: needs larger samples (≳200 responses/item for stable 2PL), adds model-fit interpretation burden on teachers. The schema below stores it when it arrives; no v1 commitment |

**Minimum-sample gating:** any statistic computed from fewer than N responses (default 10; 30 for discrimination) is stored but rendered as "insufficient data (n=…)" rather than as a number a teacher might act on. Small-sample psychometrics presented confidently is worse than none.

## The identity problem: Question vs Item

Answers reference `Question` rows, which are per-exam (and for pooled exams, per-attempt) **copies** of bank `Item`s. Psychometrics must aggregate at the *Item* level to be meaningful across administrations — which requires a durable `Question.sourceItemId` link (additive nullable FK, the established pattern). Materialization paths (fixed selection from banks, item-8 pooling) must stamp it going forward; historical Question rows without it simply don't contribute to item-level stats (stated limitation, not a migration project). Questions authored directly on an exam (never from a bank) have no Item and get exam-scoped stats only.

## Versioned-per-administration stats model

```
ItemAdministrationStat {            — one row per (item, administration)
  id, itemId, institutionId
  examId                            — the administration (an exam run of that item)
  computedAt, computeRunId
  nResponses      Int
  facilityIndex   Float?
  discrimination  Float?            — corrected point-biserial
  distractorStats Json?             — per-option counts by score quartile
  irtParams       Json?             — stretch; null until/unless IRT lands
  insufficientN   Boolean           — gating flag (see above)
}
ExamReliabilityStat {               — one row per administration
  id, examId, computedAt, computeRunId
  cronbachAlpha   Float?, kr20 Float?, nStudents Int, nItems Int
  sectionAlphas   Json?             — per item-9 section, where sections exist
}
Item.facilityIndex / .discriminationIndex (existing fields)
  = response-count-weighted rolling aggregate across that item's administration rows —
    the "current best estimate" teachers see in the bank list; the per-administration
    rows are the versioned history behind it (drill-down: "this item got easier over time")
```

Append-only per administration: recomputing an administration (e.g. after a regrade from `03-ai-grading.md` changes `marksAwarded`) **replaces that administration's row** (upsert on `[itemId, examId]`) and re-derives the rolling aggregate; `computeRunId` ties every row to the batch run that produced it for debuggability.

## Pooled exams (closing item 8's gap)

For a pooled exam, each student answered a different subset — a sparse student × item matrix:

- **p-values:** unaffected — computed over whoever answered the item (`nResponses` is just smaller; the minimum-N gate does the honesty work).
- **Discrimination:** point-biserial against the student's *total on their own drawn set* (percentage-normalized so different draw compositions are comparable). Imperfect — totals come from different item sets — but standard practice for pool-based testing at this scale, and exactly why the corrected point-biserial was chosen over 27%-split.
- **Reliability:** classical alpha is undefined on a sparse matrix. Report per-*blueprint-CLO-stratum* alpha only where enough students shared items, otherwise render "not applicable for pooled administration" honestly. True pooled-form reliability is an IRT concept — another reason IRT is the flagged stretch goal rather than a hack now.

## Computation: batch, and where it runs

**Trigger model — batch, not incremental** (per requirement, and because discrimination/alpha are whole-administration computations that can't be maintained incrementally anyway):

1. **On exam close** (primary): when an exam's last attempt finalizes or its `endTime` passes, enqueue a compute run for that administration.
2. **Nightly sweep** (safety net): recompute administrations touched since the last run (catches regrades, late force-submits, missed triggers). Idempotent by construction (pure recompute + upsert), so double-running is harmless.

**Compute location — Python service, as leaned:**

| | Small Python service (recommended) | Node (in-app) |
|---|---|---|
| Ecosystem | numpy/pandas/scipy: point-biserial, alpha are one-liners; `pingouin`/`girth`/`py-irt` for the IRT stretch | Everything hand-rolled or thin npm packages of varying quality; IRT effectively unavailable |
| Correctness confidence | Battle-tested implementations, testable against textbook datasets | Hand-rolled stats = hand-rolled bugs in exactly the numbers teachers will make item decisions on |
| Ops cost | One small container (Fly.io/Railway/Render, or a scheduled job) — and a natural co-tenant for `03`'s self-hosted Judge0 box if that option is chosen | Zero new infra |
| Skillset | Matches existing Python skillset (given) | — |

**Recommendation: Python.** Shape: a stateless FastAPI-style service, **called by** the app's job trigger with `{ examId }`; it reads the response matrix from Postgres read-only, computes, and writes only the two stats tables above (its DB credentials are scoped to exactly that — it never touches operational tables). Nightly sweep via the service's own scheduler or an app-side cron hitting its endpoint — decided at implementation, not architectural. It receives IDs and numeric response data only (no student names/emails), keeping its PII surface near zero.

The IRT stretch goal is the strongest single argument for Python: if it's ever wanted, the service already exists and it's a library import; in Node it's a rewrite.

## Surfacing (UI)

- **Bank item list (`teacher/items/[bankId]`):** the FI%/DI% columns become real (rolling aggregates), with the insufficient-N state and a trend sparkline where multiple administrations exist. AI-estimated difficulty (from `02`) is badged distinctly until observed data supersedes it; large AI-vs-observed disagreement flags the item for review.
- **Exam results page:** per-administration difficulty chart upgraded from the current answer-derived heuristic to the real stats + alpha for the administration; the item-8 pooled-exam banner is replaced by actual pooled-aware stats.
- **Item detail:** administration history, distractor table, discrimination band with a plain-language hint ("low discrimination: strong students miss this item as often as weak ones — check for ambiguity").

## Open decisions for Haris

1. **Python service hosting:** where the container lives (Fly.io/Railway/Render; co-located with Judge0 if 03's self-host option is chosen) and whether nightly scheduling lives in the service or in an app-side cron.
2. **Minimum-N thresholds** (proposed 10 for p-value, 30 for discrimination) — display-gating policy, worth a explicit sign-off since it decides when teachers see numbers.
3. **IRT stretch:** commit to it inside Phase 3 (adds `py-irt`/`girth` and interpretation UI) or park it as Phase 4. Recommendation: park it; classical stats deliver 90% of teacher value here.
