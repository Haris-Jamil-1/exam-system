"""Psychometrics compute — Vercel Python Function (follow-up task 2).

Formerly a standalone FastAPI service; now deployed inside this Vercel project
(auto-detected via requirements.txt) and called internally at
POST /api/psychometrics/compute. All calculation logic is unchanged from the
Phase 3 service (see _stats.py); this is a hosting change only. Stateless,
batch/on-demand — nothing here needs a persistent worker, and a full exam
recompute is a few hundred rows of arithmetic, far under Vercel's duration cap.

Env: DATABASE_URL (direct 5432 connection), PSYCHOMETRICS_SECRET (optional
shared secret, checked against the X-Service-Key header).
"""
from __future__ import annotations

import json
import os
import uuid
from http.server import BaseHTTPRequestHandler

import psycopg

from _stats import (
    MIN_N_FACILITY,
    corrected_discrimination,
    cronbach_alpha,
    distractor_analysis,
    facility_index,
    is_complete_matrix,
    kr20,
)


def compute_exam(exam_id: str) -> dict:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL not configured")
    run_id = str(uuid.uuid4())

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute('SELECT "institutionId" FROM "Exam" WHERE id = %s', (exam_id,))
        exam_row = cur.fetchone()
        if not exam_row:
            return {"error": "Exam not found", "_status": 404}
        institution_id = exam_row[0]

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
            (exam_id,),
        )
        rows = cur.fetchall()
        if not rows:
            return {"examId": exam_id, "computed": 0, "reason": "no submitted answers"}

        attempts = sorted({r[0] for r in rows})
        questions = sorted({r[1] for r in rows})
        attempt_idx = {a: i for i, a in enumerate(attempts)}
        question_idx = {q: i for i, q in enumerate(questions)}
        source_item = {r[1]: r[5] for r in rows}
        question_type = {r[1]: r[6] for r in rows}

        matrix: list[list[float | None]] = [[None] * len(questions) for _ in attempts]
        response_by_cell: dict[tuple[str, str], object] = {}
        for attempt_id, question_id, awarded, response, marks, _, _ in rows:
            fraction = (awarded or 0) / marks if marks else 0.0
            matrix[attempt_idx[attempt_id]][question_idx[question_id]] = fraction
            response_by_cell[(attempt_id, question_id)] = response

        student_total = {
            attempts[i]: (
                sum(s for s in row if s is not None)
                / max(1, sum(1 for s in row if s is not None))
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
                    str(uuid.uuid4()), item_key, exam_id, institution_id, run_id,
                    n, fi, disc,
                    psycopg.types.json.Jsonb(distractors) if distractors else None,
                    n < MIN_N_FACILITY,
                ),
            )
            computed += 1

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
            (str(uuid.uuid4()), exam_id, institution_id, run_id, alpha, kr,
             len(attempts), len(questions)),
        )

        linked_items = {v for v in source_item.values() if v}
        for item_id in linked_items:
            cur.execute(
                'SELECT "facilityIndex", discrimination, "nResponses" '
                'FROM "ItemAdministrationStat" WHERE "itemId" = %s',
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
        "examId": exam_id,
        "computeRunId": run_id,
        "computed": computed,
        "nStudents": len(attempts),
        "reliability": {"cronbachAlpha": alpha, "kr20": kr},
    }


class handler(BaseHTTPRequestHandler):
    def _send(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self) -> None:  # noqa: N802 (Vercel handler convention)
        expected = os.environ.get("PSYCHOMETRICS_SECRET")
        if expected and self.headers.get("X-Service-Key") != expected:
            self._send(401, {"error": "Invalid service key"})
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
            exam_id = body.get("exam_id")
            if not exam_id:
                self._send(400, {"error": "exam_id is required"})
                return
            result = compute_exam(exam_id)
            status = result.pop("_status", 200)
            self._send(status, result)
        except Exception as err:  # noqa: BLE001 — surface as clean JSON 500
            self._send(500, {"error": str(err)})
