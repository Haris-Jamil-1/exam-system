# ExamPro Psychometrics Service

Small FastAPI service (Phase 3, doc 05 / decision 8) that computes classical
test statistics — facility index (p-value), corrected item-total point-biserial
discrimination, Cronbach's alpha / KR-20, and distractor analysis — for one
exam administration at a time. IRT (1PL/2PL) is deliberately not implemented
(decision 11); the schema leaves room for it.

## Deploy

Any container host (Fly.io / Railway / Render):

```
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Env vars:
- `DATABASE_URL` — Supabase **direct** connection (port 5432), read/write.
  The service reads Answer/ExamAttempt/Question and writes ONLY
  `ItemAdministrationStat`, `ExamReliabilityStat`, and the Item FI/DI rolling
  aggregates. It receives IDs and numeric response data only — no student
  names/emails.
- `PSYCHOMETRICS_SECRET` — shared secret; the app sends it as `X-Service-Key`.

App-side env (Vercel):
- `PSYCHOMETRICS_URL` — e.g. `https://exampro-psychometrics.fly.dev`
- `PSYCHOMETRICS_SECRET` — same value as above

## Triggers

- Nightly sweep: `/api/cron/psychometrics` (vercel.json cron) recomputes exams
  with submissions newer than their last stat run. Idempotent by construction
  (pure recompute + upsert), so double-running is harmless.
- On-demand: teacher's "Recompute stats" → `POST /api/psychometrics/recompute`.

## Tests

```
pytest
```

Every formula is validated against hand-computed textbook fixtures
(`test_stats.py`) — see doc 05 on why stats correctness gets its own tests.

## Semantics worth knowing

- Scores are fractions (marksAwarded/marks), so partial credit is handled.
- Pooled exams (sparse student × item matrices): p-values and discrimination
  are computed over whoever received each item, with `nResponses` stored and
  `insufficientN` flagged below 10 responses (decision 10; the UI treats <30
  as "low confidence" for discrimination). Classical alpha is reported as
  NULL for pooled administrations — honestly "not applicable" rather than a
  misleading number.
- `Question.sourceItemId` links stats back to the bank `Item` across
  administrations; questions authored directly on an exam get exam-scoped
  stats only.
