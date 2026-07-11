"""Classical test theory statistics (Phase 3, doc 05).

Pure functions — no I/O — so every formula is unit-testable against textbook
fixtures. Decision 11: no IRT here; the schema leaves room for it, this module
deliberately does not implement 1PL/2PL.

Score matrix convention: rows = students (attempts), columns = items, values =
score *fraction* in [0, 1] (marksAwarded / marks — partial credit supported),
or None where that student did not receive that item (pooled exams).
"""
from __future__ import annotations

import math
from typing import Optional, Sequence

Matrix = Sequence[Sequence[Optional[float]]]

# Decision 10: display gating thresholds. Stats under MIN_N_FACILITY responses
# are stored but flagged insufficient; discrimination under MIN_N_DISCRIMINATION
# renders as "low confidence" in the UI.
MIN_N_FACILITY = 10
MIN_N_DISCRIMINATION = 30


def facility_index(item_scores: Sequence[Optional[float]]) -> Optional[float]:
    """Mean score fraction over students who received the item (p-value).

    Works for polytomous items because inputs are fractions, not 0/1.
    """
    observed = [s for s in item_scores if s is not None]
    if not observed:
        return None
    return sum(observed) / len(observed)


def _pearson(xs: Sequence[float], ys: Sequence[float]) -> Optional[float]:
    n = len(xs)
    if n < 2:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    var_x = sum((x - mean_x) ** 2 for x in xs)
    var_y = sum((y - mean_y) ** 2 for y in ys)
    if var_x == 0 or var_y == 0:
        return None  # no variance -> correlation undefined
    return cov / math.sqrt(var_x * var_y)


def corrected_discrimination(matrix: Matrix, item_index: int) -> Optional[float]:
    """Corrected item-total point-biserial: corr(item score, total-minus-item).

    The student's total is percentage-normalized over the items *they received*
    (excluding this one), which keeps pooled administrations comparable even
    though different students answered different sets (doc 05). Preferred over
    the 27%-split index because pooled draws give small, uneven per-item
    samples where fixed-fraction splits fall apart.
    """
    xs: list[float] = []
    ys: list[float] = []
    for row in matrix:
        item_score = row[item_index]
        if item_score is None:
            continue
        rest = [s for j, s in enumerate(row) if j != item_index and s is not None]
        if not rest:
            continue
        xs.append(item_score)
        ys.append(sum(rest) / len(rest))
    return _pearson(xs, ys)


def cronbach_alpha(matrix: Matrix) -> Optional[float]:
    """Cronbach's alpha over a COMPLETE matrix (no None cells).

    Classical alpha is undefined on a sparse (pooled) matrix — callers must
    pass only complete-case data, or report "not applicable for pooled
    administration" (doc 05).
    """
    rows = [row for row in matrix if all(s is not None for s in row)]
    n_items = len(rows[0]) if rows else 0
    if len(rows) < 2 or n_items < 2:
        return None

    # Item variances (population variance, consistent numerator/denominator).
    def variance(values: Sequence[float]) -> float:
        m = sum(values) / len(values)
        return sum((v - m) ** 2 for v in values) / len(values)

    item_vars = [variance([row[j] for row in rows]) for j in range(n_items)]  # type: ignore[misc]
    totals = [sum(row) for row in rows]  # type: ignore[arg-type]
    total_var = variance(totals)
    if total_var == 0:
        return None
    return (n_items / (n_items - 1)) * (1 - sum(item_vars) / total_var)


def kr20(matrix: Matrix) -> Optional[float]:
    """KR-20 — alpha's special case for dichotomous items.

    Only meaningful when every score is exactly 0 or 1; returns None otherwise.
    """
    rows = [row for row in matrix if all(s is not None for s in row)]
    if any(s not in (0.0, 1.0) for row in rows for s in row):  # type: ignore[comparison-overlap]
        return None
    return cronbach_alpha(rows)


def distractor_analysis(
    option_picks: Sequence[tuple[str, float]],
) -> dict[str, dict[str, int]]:
    """Per-option selection counts split by total-score quartile.

    Input: (optionId, student_total_fraction) per response. Output:
    {optionId: {count, topQuartile, bottomQuartile}} — "nobody picks
    distractor C" / "strong students pick the wrong answer" signals.
    """
    if not option_picks:
        return {}
    totals = sorted(t for _, t in option_picks)
    n = len(totals)
    quartile_size = max(1, math.ceil(n / 4))
    q1 = totals[quartile_size - 1]   # bottom ~25% are <= this
    q3 = totals[n - quartile_size]   # top ~25% are >= this

    out: dict[str, dict[str, int]] = {}
    for option_id, total in option_picks:
        entry = out.setdefault(option_id, {"count": 0, "topQuartile": 0, "bottomQuartile": 0})
        entry["count"] += 1
        if total >= q3:
            entry["topQuartile"] += 1
        if total <= q1:
            entry["bottomQuartile"] += 1
    return out


def is_complete_matrix(matrix: Matrix) -> bool:
    """True when every student received every item (non-pooled administration)."""
    return all(all(s is not None for s in row) for row in matrix)
