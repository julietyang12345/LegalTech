"""Sparse deterministic rubric checks with an optional independent semantic judge."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Protocol


class CriterionJudge(Protocol):
    def evaluate(self, *, criterion: dict, evidence: dict) -> dict[str, Any]: ...


def evaluate_rubric(result: dict[str, Any], judge: CriterionJudge | None = None) -> dict[str, Any]:
    checks = []
    for criterion in result.get("checks", []):
        deterministic = _deterministic(criterion, result)
        semantic = None
        if criterion.get("type") in {"llm_judge", "semantic"}:
            semantic = _safe_judge(judge, criterion, result) if judge is not None else {"passed": False, "error": "semantic judge not configured"}
        passed = deterministic["passed"] if semantic is None else deterministic["passed"] and semantic["passed"]
        checks.append({**deterministic, "semantic": semantic, "passed": passed, "failure_stage": _failure_stage(deterministic, semantic, result)})
    passed = sum(item["passed"] for item in checks)
    return {"case_id": result.get("case_id"), "passed": passed, "total": len(checks), "score": passed / len(checks) if checks else 1.0, "all_pass": bool(checks) and passed == len(checks), "criteria": checks}


def _deterministic(criterion: dict, result: dict) -> dict[str, Any]:
    kind = criterion.get("type")
    checks = result.get("analysis", {}).get("requirement_checks", [])
    requirement = criterion.get("requirement")
    matching = _matching_checks(checks, criterion)
    actual = matching[0].get("result") if len(matching) == 1 else None
    ambiguous = len(matching) > 1
    if kind == "requirement_status":
        expected = criterion.get("expected")
        passed = not ambiguous and actual == expected
        return _outcome(criterion, passed, expected, actual, _evidence_ids(matching),
                        "Requirement status matched." if passed else _check_failure(matching, ambiguous, "Observed requirement status differs from expected status."))
    if kind in {"llm_judge", "semantic"}:
        return {"id": criterion.get("id"), "type": kind, "passed": True, "expected": "semantic judge", "actual": None}
    if kind == "time_order":
        return _time_order_outcome(criterion, result)
    if ambiguous or not matching:
        return _outcome(criterion, False, {"requirement": requirement}, None, [],
                        "Requirement is missing or the criterion matched multiple Extra Works; source checks cannot pass.")
    source_documents = _source_documents(matching, result, role="supporting")
    document = criterion.get("document")
    if kind == "forbidden_source":
        passed = document not in source_documents
        return _outcome(criterion, passed, {"forbidden": document}, sorted(source_documents), _evidence_ids(matching, role="supporting"),
                        "Forbidden document was not linked." if passed else "Forbidden document was linked as supporting evidence.")
    if kind == "required_source":
        passed = document in source_documents
        return _outcome(criterion, passed, {"required": document}, sorted(source_documents), _evidence_ids(matching, role="supporting"),
                        "Required document was linked." if passed else "Required document was not linked as supporting evidence.")
    if kind == "uncertainty_reason":
        expected = criterion.get("expected")
        actual = matching[0].get("uncertainty_reason")
        return _outcome(criterion, actual == expected, expected, actual, _evidence_ids(matching),
                        "Uncertainty reason matched." if actual == expected else "Observed uncertainty reason differs from expected reason.")
    if kind == "conflict_classification":
        expected = criterion.get("expected")
        actual = matching[0].get("conflict_classification")
        return _outcome(criterion, actual == expected, expected, actual, _evidence_ids(matching),
                        "Conflict classification matched." if actual == expected else "Observed conflict classification differs from expected classification.")
    if kind == "cross_ew_isolation":
        target = criterion.get("extra_work_id")
        evidence_ids = set(_evidence_ids(matching))
        assertion_by_id = {item.get("id"): item for item in result.get("assertions", [])}
        leaked = sorted({
            _assertion_scope(assertion)
            for assertion_id, assertion in assertion_by_id.items()
            if assertion_id in evidence_ids
            and _assertion_scope(assertion)
            and _assertion_scope(assertion) != target
        })
        passed = bool(target) and not leaked
        return _outcome(criterion, passed, {"isolated_to": target}, leaked, sorted(evidence_ids),
                        "Evidence remained isolated to the requested Extra Work." if passed else "Evidence from another Extra Work was linked to this requirement.")
    if kind == "retrieval_recall":
        required = set(criterion.get("required_assertion_ids", criterion.get("required_ids", [])))
        forbidden = set(criterion.get("forbidden_assertion_ids", []))
        actual = {
            assertion_id
            for stage in result.get("stages", {}).get("retrieval", [])
            for coverage in stage.get("coverage", [])
            for assertion_id in coverage.get("candidate_assertion_ids", [])
        }
        missing = sorted(required - actual)
        leaked = sorted(forbidden & actual)
        passed = not missing and not leaked
        return _outcome(criterion, passed, {"required": sorted(required), "forbidden": sorted(forbidden)},
                        {"retrieved": sorted(actual), "missing": missing, "forbidden_found": leaked}, [],
                        "Required retrieval candidates were found." if passed else "Retrieval recall or cross-scope exclusion failed.")
    if kind == "scope_resolution":
        target = criterion.get("assertion_id")
        assertion = next((item for item in result.get("assertions", []) if item.get("id") == target), None)
        expected = criterion.get("expected_status", "INFERRED")
        actual = assertion.get("relationship_status") if assertion else None
        return _outcome(criterion, actual == expected, expected, actual, [target] if assertion else [],
                        "Scope resolution matched." if actual == expected else "Scope resolution did not match the expected status.")
    return {"id": criterion.get("id"), "type": kind, "passed": False, "expected": "supported criterion type", "actual": "unsupported"}


def _matching_checks(checks: list[dict], criterion: dict) -> list[dict]:
    return [
        check for check in checks
        if check.get("requirement_id") == criterion.get("requirement")
        and (criterion.get("extra_work_id") is None or check.get("extra_work_id") == criterion.get("extra_work_id"))
    ]


def _evidence_ids(checks: list[dict], role: str | None = None) -> list[str]:
    fields = ("supporting_evidence_ids", "contrary_evidence_ids") if role is None else (f"{role}_evidence_ids",)
    return sorted({item for check in checks for field in fields for item in check.get(field, [])})


def _source_documents(checks: list[dict], result: dict, role: str | None = None) -> set[str]:
    ids = set(_evidence_ids(checks, role=role))
    document_names = {value: key for key, value in result.get("documents", {}).items()}
    return {
        document_names.get(assertion.get("source_document_id"), assertion.get("source_document_id"))
        for assertion in result.get("assertions", [])
        if assertion.get("id") in ids
    }


def _assertion_scope(assertion: dict) -> str | None:
    if assertion.get("extra_work_id"):
        return assertion["extra_work_id"]
    value = assertion.get("value")
    return value.get("extra_work_id") if isinstance(value, dict) else None


def _outcome(criterion, passed, expected, actual, evidence_ids, reason):
    return {"id": criterion.get("id"), "type": criterion.get("type"), "passed": passed,
            "expected": expected, "actual": actual, "evidence_ids": evidence_ids, "reason": reason}


def _check_failure(matching, ambiguous, fallback):
    if ambiguous:
        return "Criterion matched multiple requirement checks; specify extra_work_id."
    if not matching:
        return "Requirement check was not produced by the pipeline."
    return fallback


def _time_order_outcome(criterion: dict, result: dict) -> dict[str, Any]:
    earlier_field = criterion.get("earlier_field") or criterion.get("before")
    later_field = criterion.get("later_field") or criterion.get("after")
    target = criterion.get("extra_work_id")
    assertions = [a for a in result.get("assertions", []) if not target or _assertion_scope(a) == target]
    earlier = _first_time(assertions, earlier_field)
    later = _first_time(assertions, later_field)
    expected = criterion.get("expected", "before")
    passed = False
    if earlier and later:
        passed = earlier < later if expected == "before" else earlier > later if expected == "after" else False
    reason = "Temporal ordering matched." if passed else "Required timestamps are missing, invalid, or in the wrong order."
    return _outcome(criterion, passed, {"earlier": earlier_field, "later": later_field, "expected": expected},
                    {"earlier": earlier.isoformat() if earlier else None, "later": later.isoformat() if later else None}, [], reason)


def _first_time(assertions: list[dict], field: str | None) -> datetime | None:
    if not field:
        return None
    for assertion in assertions:
        value = assertion.get(field)
        if value:
            try:
                return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except ValueError:
                return None
    return None


def _safe_judge(judge: CriterionJudge, criterion: dict, result: dict) -> dict[str, Any]:
    try:
        response = judge.evaluate(criterion=criterion, evidence=result)
        return {"passed": response.get("verdict", response.get("passed")) in {True, "pass", "PASS"}, "reasoning": str(response.get("reasoning", ""))}
    except Exception as error:
        return {"passed": False, "error": str(error)}


def _failure_stage(criterion: dict, semantic: dict | None, result: dict) -> str:
    if semantic is not None and not semantic.get("passed", False):
        return "SEMANTIC_JUDGE"
    if criterion["passed"]:
        return "NONE"
    if criterion["type"] == "required_source" and not result.get("assertions"):
        return "EXTRACTION"
    if criterion["type"] in {"forbidden_source", "required_source"}:
        return "UNKNOWN"
    if criterion["type"] == "requirement_status":
        if not result.get("analysis", {}).get("requirement_checks"):
            return "UNKNOWN"
        return "REQUIREMENT_EVALUATION"
    return "UNKNOWN"
