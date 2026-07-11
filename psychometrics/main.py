"""Psychometrics service (Phase 3, doc 05 / decision 8).

Small FastAPI service, deployed separately from the Next.js app (Fly.io /
Railway / any container host). The app calls POST /compute with an exam id;
this service reads the response matrix from Postgres (IDs and numeric data
only — no student names or emails ever enter this process), computes classical
test statistics, and writes ONLY the two stats tables plus the Item rolling
aggregates. Idempotent: recomputing an administration upserts the same rows.

Env:
  DATABASE_URL           Postgres connection string (Supabase: use the direct
                         5432 connection, not pgBouncer)
  PSYCHOMETRICS_SECRET   shared secret; requests must send it as X-Service-Key

Run:  uvicorn main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import os
import uuid
from collections import defaultdict

import psycopg
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from stats import (
    MIN_N_FACILITY,
    corrected_discrimination,
    cronbach_alpha,
    distractor_analysis,
    facility_index,
    is_complete_matrix,
    kr20,
)

app = FastAPI(title="ExamPro Psychometrics", version="1.0.0")


class ComputeRequest(BaseModel):
    exam_id: str


def _connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise HTTPException(500, "DATABASE_URL not configured")
    return psycopg.connect(url)


def _authorize(key: str | None) -> None:
    expected = os.environ.get("PSYCHOMETRICS_SECRET")
    if expected and key != expected:
        raise HTTPException(401, "Invalid service key")


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}


@app.post("/compute")
def compute(req: ComputeRequest, x_service_key: str | None = Header(default=None)) -> dict:
    _authorize(x_service_key)
    run_id = str(uuid.uuid4())

    with _connect() as conn, conn.cursor() as cur:
        cur.execute(
            'SELECT "institutionId" FROM "Exam" WHERE id = %s', (req.exam_id,)
        )
        exam_row = cur.fetchone()
        if not exam_row:
            raise HTTPException(404, "Exam not found")
        institution_id = exam_row[0]

        # Response matrix: submitted attempts only, joined to each question's
        # marks and its durable bank-item link.
        cur.execute(
            '''
            SELECT a."attemptId", a."questionId", a."marksAwarded", a.response,
                   q.marks, q."sourceItemId", q.type
            FROM "Answer" a
            JOIN "ExamAttempt" att ON att.id = a."attemptId"
            JOIN "Question" q ON q.id = a."questionId"
            WHERE att."examId" = %s
              AND att.status IN ('submitted', 'auto_submitted')
            ''',
            (req.exam_id,),
        )
        rows = cur.fetchall()
        if not rows:
            return {"examId": req.exam_id, "computed": 0, "reason": "no submitted answers"}

        attempts = sorted({r[0] for r in rows})
        questions = sorted({r[1] for r in rows})
        attempt_idx = {a: i for i, a in enumerate(attempts)}
        question_idx = {q: i for i, q in enumerate(questions)}
        question_marks = {r[1]: r[4] for r in rows}
        source_item = {r[1]: r[5] for r in rows}
        question_type = {r[1]: r[6] for r in rows}

        matrix: list[list[float | None]] = [
            [None] * len(questions) for _ in attempts
        ]
        response_by_cell: dict[tuple[str, str], object] = {}
        for attempt_id, question_id, awarded, response, marks, _, _ in rows:
            fraction = (awarded or 0) / marks if marks else 0.0
            matrix[attempt_idx[attempt_id]][question_idx[question_id]] = fraction
            response_by_cell[(attempt_id, question_id)] = response

        # Per-student normalized totals (their own received set) for distractors.
        student_total = {
            attempts[i]: (
                sum(s for s in row if s is not None) / max(1, sum(1 for s in row if s is not None))
            )
            for i, row in enumerate(matrix)
        }

        computed = 0
        for question_id in questions:
            j = question_idx[question_id]
            col = [matrix[i][j] for i in range(len(attempts))]
            n = sum(1 for s in col if s is not None)
            fi = facility_index(col)
            disc = corrected_discrimination(matrix, j)

            distractors = None
            if question_type[question_id] in ("mcq", "true_false", "mrq"):
                picks: list[tuple[str, float]] = []
                for attempt_id in attempts:
                    response = response_by_cell.get((attempt_id, question_id))
                    if isinstance(response, str) and response:
                        picks.append((response, student_total[attempt_id]))
                    elif isinstance(response, list):
                        for option_id in response:
                            if isinstance(option_id, str):
                                picks.append((option_id, student_total[attempt_id]))
                if picks:
                    distractors = distractor_analysis(picks)

            # Stat identity: the bank Item when linked, else the exam-local
            # question (exam-scoped stats only — doc 05 stated limitation).
            item_key = source_item[question_id] or question_id
            cur.execute(
                '''
                INSERT INTO "ItemAdministrationStat"
                  (id, "itemId", "examId", "institutionId", "computeRunId",
                   "nResponses", "facilityIndex", discrimination,
                   "distractorStats", "insufficientN", "computedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT ("itemId", "examId") DO UPDATE SET
                  "computeRunId" = EXCLUDED."computeRunId",
                  "nResponses" = EXCLUDED."nResponses",
                  "facilityIndex" = EXCLUDED."facilityIndex",
                  discrimination = EXCLUDED.discrimination,
                  "distractorStats" = EXCLUDED."distractorStats",
                  "insufficientN" = EXCLUDED."insufficientN",
                  "computedAt" = NOW()
                ''',
                (
                    str(uuid.uuid4()), item_key, req.exam_id, institution_id, run_id,
                    n, fi, disc,
                    psycopg.types.json.Jsonb(distractors) if distractors else None,
                    n < MIN_N_FACILITY,
                ),
            )
            computed += 1

        # Reliability — classical alpha only for complete (non-pooled) matrices;
        # a sparse matrix honestly reports "not applicable" via NULLs (doc 05).
        alpha = cronbach_alpha(matrix) if is_complete_matrix(matrix) else None
        kr = kr20(matrix) if is_complete_matrix(matrix) else None
        cur.execute(
            '''
            INSERT INTO "ExamReliabilityStat"
              (id, "examId", "institutionId", "computeRunId", "cronbachAlpha",
               kr20, "nStudents", "nItems", "computedAt")
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT ("examId") DO UPDATE SET
              "computeRunId" = EXCLUDED."computeRunId",
              "cronbachAlpha" = EXCLUDED."cronbachAlpha",
              kr20 = EXCLUDED.kr20,
              "nStudents" = EXCLUDED."nStudents",
              "nItems" = EXCLUDED."nItems",
              "computedAt" = NOW()
            ''',
            (str(uuid.uuid4()), req.exam_id, institution_id, run_id, alpha, kr,
             len(attempts), len(questions)),
        )

        # Rolling aggregates on the bank Item (what teachers see in the bank
        # list): response-count-weighted mean across administrations. Gated by
        # MIN_N at the aggregate level.
        linked_items = {v for v in source_item.values() if v}
        for item_id in linked_items:
            cur.execute(
                '''
                SELECT "facilityIndex", discrimination, "nResponses"
                FROM "ItemAdministrationStat" WHERE "itemId" = %s
                ''',
                (item_id,),
            )
            stat_rows = cur.fetchall()
            total_n = sum(r[2] for r in stat_rows)
            if total_n < MIN_N_FACILITY:
                continue
            fi_pairs = [(r[0], r[2]) for r in stat_rows if r[0] is not None]
            di_pairs = [(r[1], r[2]) for r in stat_rows if r[1] is not None]
            agg_fi = sum(v * w for v, w in fi_pairs) / sum(w for _, w in fi_pairs) if fi_pairs else None
            agg_di = sum(v * w for v, w in di_pairs) / sum(w for _, w in di_pairs) if di_pairs else None
            cur.execute(
                'UPDATE "Item" SET "facilityIndex" = %s, "discriminationIndex" = %s WHERE id = %s',
                (agg_fi, agg_di, item_id),
            )

        conn.commit()

    return {
        "examId": req.exam_id,
        "computeRunId": run_id,
        "computed": computed,
        "nStudents": len(attempts),
        "reliability": {"cronbachAlpha": alpha, "kr20": kr},
    }
