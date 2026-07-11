"""Textbook-fixture tests for the classical stats (doc 05: hand-rolled stats =
hand-rolled bugs, so every formula is validated against known values)."""
import math

from stats import (
    corrected_discrimination,
    cronbach_alpha,
    distractor_analysis,
    facility_index,
    is_complete_matrix,
    kr20,
)


def test_facility_index_basic():
    assert facility_index([1.0, 0.0, 1.0, 1.0]) == 0.75
    assert facility_index([]) is None
    assert facility_index([None, None]) is None


def test_facility_index_partial_credit_and_sparse():
    # Polytomous fractions and pooled (None) cells both handled.
    assert facility_index([0.5, None, 1.0]) == 0.75


def test_corrected_discrimination_positive():
    # Strong students (high rest-score) do better on the item -> positive r.
    matrix = [
        [1.0, 1.0, 1.0],
        [1.0, 1.0, 0.8],
        [0.0, 0.2, 0.1],
        [0.0, 0.0, 0.3],
    ]
    r = corrected_discrimination(matrix, 0)
    assert r is not None and r > 0.8


def test_corrected_discrimination_excludes_item_itself():
    # With only one other column, "total minus item" is exactly that column.
    matrix = [[1.0, 0.0], [0.0, 1.0]]
    r = corrected_discrimination(matrix, 0)
    assert r is not None and math.isclose(r, -1.0)


def test_corrected_discrimination_no_variance_returns_none():
    matrix = [[1.0, 1.0], [1.0, 0.0]]
    assert corrected_discrimination(matrix, 0) is None


def test_cronbach_alpha_textbook():
    # Guttman-pattern 3-item example, computed by hand (population variances):
    # item vars = 0.1875 + 0.25 + 0.1875 = 0.625; totals [3,2,1,0] var = 1.25
    # alpha = (3/2) * (1 - 0.625/1.25) = 0.75
    matrix = [
        [1.0, 1.0, 1.0],
        [1.0, 1.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0],
    ]
    alpha = cronbach_alpha(matrix)
    assert alpha is not None and math.isclose(alpha, 0.75, abs_tol=1e-9)


def test_cronbach_alpha_requires_enough_data():
    assert cronbach_alpha([[1.0, 0.0]]) is None  # one student
    assert cronbach_alpha([[1.0], [0.0]]) is None  # one item


def test_kr20_matches_alpha_for_dichotomous_and_rejects_polytomous():
    dichotomous = [
        [1.0, 1.0, 1.0],
        [1.0, 1.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0],
    ]
    assert math.isclose(kr20(dichotomous), cronbach_alpha(dichotomous))
    polytomous = [[0.5, 1.0], [1.0, 0.0]]
    assert kr20(polytomous) is None


def test_distractor_analysis_quartiles():
    picks = [
        ("A", 0.9), ("A", 0.85),  # strong students pick A
        ("B", 0.2), ("B", 0.1),   # weak students pick B
        ("A", 0.5),
    ]
    out = distractor_analysis(picks)
    assert out["A"]["count"] == 3
    assert out["B"]["count"] == 2
    assert out["A"]["topQuartile"] >= 1
    assert out["B"]["bottomQuartile"] == 2


def test_is_complete_matrix():
    assert is_complete_matrix([[1.0, 0.0], [0.5, 1.0]])
    assert not is_complete_matrix([[1.0, None], [0.5, 1.0]])
