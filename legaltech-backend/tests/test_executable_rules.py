from datetime import datetime

from app.analysis.issue_discovery import discover_issues
from app.analysis.reconciliation import reconcile_issue
from app.analysis.requirement_evaluator import evaluate_requirements
from app.analysis.rule_activation import activate_rules
from app.extraction.schemas import SignalCandidate
from app.extraction.signal_extractor import extract_atomic_signals
from app.parsers.base import ParsedContent
from app.domain_contracts.schemas import (
    AssessmentStatus,
    EvidenceAssertion,
    EvidenceStatus,
    Obligation,
    Provenance,
)
from app.legal_knowledge.default_rules import extra_work_cost_communication_rule
from app.repositories.memory import store
from app.ingestion.upload_ingestor import ingest_upload
from app.models.domain import DocumentType


def _p() -> Provenance:
    return Provenance(
        tenant_id="T1", matter_id="M1", analysis_run_id="R1", pipeline_version="test"
    )


def _assertion(assertion_type: str, statement: str, value=None, document: str = "D1") -> EvidenceAssertion:
    if value is None:
        value = {"extra_work_id": "EW-1"}
    elif isinstance(value, str):
        value = {"extra_work_id": value}
    return EvidenceAssertion(
        tenant_id="T1",
        matter_id="M1",
        source_document_id=document,
        assertion_type=assertion_type,
        statement=statement,
        value=value,
        asserted_at=datetime(2025, 1, 3),
        provenance=_p(),
    )


def _obligation() -> Obligation:
    return Obligation(
        tenant_id="T1",
        matter_id="M1",
        clause_id="C1",
        obligation_type="change_order_approval",
        source_span_id="S1",
        provenance=_p(),
    )


def test_extra_work_rule_creates_separate_issues_by_extra_work_scope() -> None:
    store.issues.clear()
    store.rule_activations.clear()
    principle, rule = extra_work_cost_communication_rule()
    assertions = [
        _assertion("extra_work_detected", "Additional work at east slope", {"extra_work_id": "EW-1"}),
        _assertion("extra_work_detected", "Additional work at west slope", {"extra_work_id": "EW-2"}, "D2"),
    ]
    activations = activate_rules(rules=[rule], assertions=assertions)
    issues = discover_issues(
        tenant_id="T1", matter_id="M1", obligations=[_obligation()],
        assertions=assertions, rules=[rule], activations=activations,
    )

    assert len(issues) == 2
    assert {issue.extra_work_id for issue in issues} == {"EW-1", "EW-2"}
    assert all(rule.id in issue.rule_ids for issue in issues)


def test_proceed_is_not_cost_approval_and_negative_approval_is_contrary() -> None:
    _principle, rule = extra_work_cost_communication_rule()
    proceed = _assertion("instruction_to_proceed", "Please proceed with the extra work.")
    negative = _assertion("price_approval", "The owner never approved additional cost.", document="D2")
    checks = evaluate_requirements(
        rule=rule, assertions=[proceed, negative], search_attempts=[],
        tenant_id="T1", matter_id="M1", analysis_run_id="R1",
    )
    approval = next(check for check in checks if check.requirement_id == "owner_approved_additional_cost")

    assert approval.result == AssessmentStatus.disputed
    assert negative.id in approval.contrary_evidence_ids
    assert proceed.id not in approval.supporting_evidence_ids


def test_working_day_notice_deadline_does_not_use_calendar_days() -> None:
    obligation = Obligation(
        tenant_id="T1", matter_id="M1", clause_id="C1",
        obligation_type="notice_of_extra_compensation", trigger_event="delay",
        deadline_value=2, deadline_unit="working_days", source_span_id="S1", provenance=_p(),
    )
    assertion = _assertion(
        "written_notice", "Written notice was sent.",
        {"event_at": "2025-01-03", "notice_at": "2025-01-07"},
    )
    issue = discover_issues(
        tenant_id="T1", matter_id="M1", obligations=[obligation], assertions=[assertion]
    )[0]
    assessment = reconcile_issue(
        issue=issue, obligations=[obligation], assertions=[assertion], analysis_run_id="R1"
    )

    assert assessment.status == AssessmentStatus.satisfied
    assert assessment.evidence_status == EvidenceStatus.reconstructable


def test_four_extra_work_gold_cases_keep_semantic_evidence_reviewable() -> None:
    _principle, rule = extra_work_cost_communication_rule()
    cases = [
        ([
            _assertion("extra_work_detected", "Additional steel supports are extra work."),
            _assertion("cost_communication", "Additional cost is $25,000."),
            _assertion("price_approval", "Owner approved the additional cost."),
        ], {"extra_work_occurred": "LAWYER_REVIEW_REQUIRED", "cost_impact_communicated": "LAWYER_REVIEW_REQUIRED", "owner_approved_additional_cost": "LAWYER_REVIEW_REQUIRED"}),
        ([
            _assertion("extra_work_detected", "Additional steel supports are extra work."),
            _assertion("instruction_to_proceed", "Please proceed with the work."),
        ], {"extra_work_occurred": "LAWYER_REVIEW_REQUIRED", "cost_impact_communicated": "INSUFFICIENT_INFORMATION", "owner_approved_additional_cost": "INSUFFICIENT_INFORMATION"}),
        ([
            _assertion("extra_work_detected", "Additional steel supports are extra work."),
            _assertion("instruction_to_proceed", "Please proceed."),
        ], {"extra_work_occurred": "LAWYER_REVIEW_REQUIRED", "cost_impact_communicated": "INSUFFICIENT_INFORMATION", "owner_approved_additional_cost": "INSUFFICIENT_INFORMATION"}),
        ([
            _assertion("extra_work_detected", "East supports are extra work.", "EW-1"),
            _assertion("cost_communication", "West supports have additional cost.", "EW-2"),
        ], {"extra_work_occurred": "LAWYER_REVIEW_REQUIRED", "cost_impact_communicated": "INSUFFICIENT_INFORMATION", "owner_approved_additional_cost": "INSUFFICIENT_INFORMATION"}),
    ]
    from app.evals.golden import GoldenCase, evaluate_golden_cases
    report = evaluate_golden_cases(rule, [
        GoldenCase(id=f"gold-{index}", assertions=assertions, expects_activation=True, expected_requirements=expected, scope_id="EW-1" if index == 3 else None)
        for index, (assertions, expected) in enumerate(cases)
    ])
    assert report["rule_activation_recall"] == 1.0
    assert report["requirement_evaluation_accuracy"] == 1.0


def test_evidence_scope_does_not_use_other_extra_work_cost() -> None:
    _principle, rule = extra_work_cost_communication_rule()
    ew1 = _assertion("extra_work_detected", "EW-1 additional work.", "EW-1")
    ew2_cost = _assertion("cost_communication", "EW-2 additional cost communicated.", "EW-2")
    checks = evaluate_requirements(
        rule=rule,
        assertions=[ew1],
        search_attempts=[], tenant_id="T1", matter_id="M1", analysis_run_id="R1",
    )
    cost_check = next(check for check in checks if check.requirement_id == "cost_impact_communicated")
    assert ew2_cost.id not in cost_check.supporting_evidence_ids
    assert cost_check.result == AssessmentStatus.insufficient_information


def test_ai_partial_output_is_merged_with_heuristic_trigger(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.extraction.signal_extractor.ai_candidates",
        lambda _text: [SignalCandidate(signal_type="instruction_to_proceed", value=True, source_text="Please proceed", confidence=0.9)],
    )
    signals = extract_atomic_signals(
        type("Document", (), {"id": "DOC-1"})(),
        ParsedContent(document_id="DOC-1", text="Extra work is required. Please proceed."),
    )
    assert {signal.signal_type for signal in signals} >= {"instruction_to_proceed", "extra_work_detected"}


def test_no_notice_sent_is_not_extracted_as_notice(monkeypatch) -> None:
    monkeypatch.setattr("app.extraction.signal_extractor.ai_candidates", lambda _text: [])
    signals = extract_atomic_signals(
        type("Document", (), {"id": "DOC-2"})(),
        ParsedContent(document_id="DOC-2", text="No notice was sent for the delay."),
    )
    signal_types = {signal.signal_type for signal in signals}
    assert "written_notice" not in signal_types
    assert "notice_denied" in signal_types


def test_activation_rejects_cross_matter_evidence() -> None:
    _principle, rule = extra_work_cost_communication_rule()
    first = _assertion("extra_work_detected", "EW-1 extra work", "EW-1")
    second = _assertion("extra_work_detected", "EW-2 extra work", "EW-2")
    second.matter_id = "M2"
    import pytest
    with pytest.raises(ValueError, match="cannot mix"):
        activate_rules(rules=[rule], assertions=[first, second])


def test_upload_dedupe_is_scoped_to_tenant_and_matter(tmp_path, monkeypatch) -> None:
    import app.ingestion.upload_ingestor as upload_module
    store.documents.clear(); store.jobs.clear(); store.events.clear(); store.processed_documents.clear()
    monkeypatch.setattr(upload_module, "STORAGE_ROOT", tmp_path)
    first, first_job = ingest_upload(b"same", "../../safe.txt", DocumentType.email, "M1", tenant_id="T1")
    second, second_job = ingest_upload(b"same", "safe.txt", DocumentType.email, "M2", tenant_id="T1")
    duplicate, duplicate_job = ingest_upload(b"same", "safe.txt", DocumentType.email, "M1", tenant_id="T1")
    assert first_job is not None and second_job is not None
    assert duplicate_job is None and duplicate.id == first.id
    assert first.storage_path == str(tmp_path / first.id / "safe.txt")
    assert second.id != first.id
