from app.evals.report import build_report, to_markdown
from app.evals.rubric import evaluate_rubric


def _result(checks, requirement_checks=None, assertions=None):
    return {
        "case_id": "B",
        "documents": {"04_invoice.txt": "DOC-4", "03_daily_report.txt": "DOC-3"},
        "assertions": assertions or [],
        "analysis": {"requirement_checks": requirement_checks or []},
        "stages": {},
        "checks": checks,
    }


def test_sparse_rubric_checks_status_and_source_by_filename() -> None:
    result = _result(
        [
            {"id": "B01", "type": "requirement_status", "requirement": "owner_approved_additional_cost", "expected": "INSUFFICIENT_INFORMATION"},
            {"id": "B02", "type": "forbidden_source", "requirement": "owner_approved_additional_cost", "document": "04_invoice.txt"},
            {"id": "B03", "type": "required_source", "requirement": "work_performed", "document": "03_daily_report.txt"},
        ],
        requirement_checks=[
            {"requirement_id": "owner_approved_additional_cost", "result": "INSUFFICIENT_INFORMATION", "supporting_evidence_ids": [], "contrary_evidence_ids": []},
            {"requirement_id": "work_performed", "result": "REQUIREMENT_SATISFIED", "supporting_evidence_ids": ["A3"], "contrary_evidence_ids": []},
        ],
        assertions=[{"id": "A3", "source_document_id": "DOC-3"}],
    )
    rubric = evaluate_rubric(result)
    assert rubric["all_pass"] is True
    assert rubric["score"] == 1.0


def test_forbidden_source_fails_only_when_linked_as_evidence() -> None:
    result = _result(
        [{"id": "B02", "type": "forbidden_source", "requirement": "owner_approved_additional_cost", "document": "04_invoice.txt"}],
        requirement_checks=[{"requirement_id": "owner_approved_additional_cost", "result": "REQUIREMENT_SATISFIED", "supporting_evidence_ids": ["A4"], "contrary_evidence_ids": []}],
        assertions=[{"id": "A4", "source_document_id": "DOC-4"}],
    )
    rubric = evaluate_rubric(result)
    assert rubric["criteria"][0]["passed"] is False
    assert rubric["criteria"][0]["failure_stage"] == "UNKNOWN"


def test_missing_requirement_cannot_pass_source_criterion() -> None:
    result = _result(
        [{"id": "B04", "type": "forbidden_source", "requirement": "missing", "document": "04_invoice.txt"}],
    )
    criterion = evaluate_rubric(result)["criteria"][0]
    assert criterion["passed"] is False
    assert "missing" in criterion["reason"]


def test_contrary_evidence_is_not_supporting_source() -> None:
    result = _result(
        [{"id": "B05", "type": "forbidden_source", "requirement": "R", "document": "04_invoice.txt"}],
        requirement_checks=[{"requirement_id": "R", "supporting_evidence_ids": [], "contrary_evidence_ids": ["A1"]}],
        assertions=[{"id": "A1", "source_document_id": "DOC-4"}],
    )
    assert evaluate_rubric(result)["criteria"][0]["passed"] is True


def test_requirement_status_matches_extra_work_id() -> None:
    result = _result(
        [{"id": "B06", "type": "requirement_status", "requirement": "R", "extra_work_id": "EW-202", "expected": "PASS"}],
        requirement_checks=[
            {"requirement_id": "R", "extra_work_id": "EW-201", "result": "FAIL"},
            {"requirement_id": "R", "extra_work_id": "EW-202", "result": "PASS"},
        ],
    )
    assert evaluate_rubric(result)["criteria"][0]["passed"] is True


def test_new_deterministic_criteria() -> None:
    result = _result(
        [
            {"id": "T02", "type": "time_order", "extra_work_id": "EW-1", "earlier_field": "communication_at", "later_field": "work_start_at", "expected": "before"},
            {"id": "U01", "type": "uncertainty_reason", "requirement": "approval", "expected": "NO_EXPLICIT_APPROVAL_FOUND"},
            {"id": "X01", "type": "cross_ew_isolation", "requirement": "approval", "extra_work_id": "EW-1"},
        ],
        requirement_checks=[{
            "requirement_id": "approval", "extra_work_id": "EW-1", "result": "INSUFFICIENT_INFORMATION",
            "uncertainty_reason": "NO_EXPLICIT_APPROVAL_FOUND", "supporting_evidence_ids": ["A1"], "contrary_evidence_ids": [],
        }],
        assertions=[{
            "id": "A1", "source_document_id": "DOC-1", "extra_work_id": "EW-1",
            "communication_at": "2026-01-01T09:00:00", "work_start_at": "2026-01-02T09:00:00",
        }],
    )
    rubric = evaluate_rubric(result)
    assert rubric["all_pass"] is True


def test_semantic_failure_is_reported_at_judge_stage() -> None:
    result = _result([{"id": "S01", "type": "llm_judge", "match_criteria": "Do not overclaim."}])
    criterion = evaluate_rubric(result)["criteria"][0]
    assert criterion["passed"] is False
    assert criterion["failure_stage"] == "SEMANTIC_JUDGE"


def test_semantic_criterion_requires_configured_judge() -> None:
    result = _result([{"id": "B03", "type": "llm_judge", "match_criteria": "Do not overclaim."}])
    rubric = evaluate_rubric(result)
    assert rubric["criteria"][0]["passed"] is False
    assert "not configured" in rubric["criteria"][0]["semantic"]["error"]


def test_report_preserves_observable_stages() -> None:
    result = _result([])
    result["stages"] = {"extraction": [{"assertion_id": "A1"}], "retrieval": []}
    report = build_report(result, evaluate_rubric(result))
    assert report["stages"]["extraction"][0]["assertion_id"] == "A1"
    assert "Evaluation Report" in to_markdown(report)
