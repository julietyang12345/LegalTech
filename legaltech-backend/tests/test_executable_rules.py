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
    EvidenceRole,
    EvidenceAssertion,
    EvidenceStatus,
    Obligation,
    Provenance,
)
from app.legal_knowledge.default_rules import change_order_approval_rule, extra_work_cost_communication_rule
from app.analysis.semantic_evaluator import SemanticJudgment
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


def test_two_rules_keep_separate_issues_but_share_one_extra_work() -> None:
    store.issues.clear()
    store.rule_activations.clear()
    _principle_a, cost_rule = extra_work_cost_communication_rule()
    _principle_b, approval_rule = change_order_approval_rule()
    assertions = [
        _assertion("extra_work_detected", "EW-101 adds four steel supports.", "EW-101"),
        _assertion("signed_change_order", "CO-101 is signed by both parties.", {"extra_work_id": "EW-101"}, "CO-101"),
    ]
    activations = activate_rules(rules=[cost_rule, approval_rule], assertions=assertions)
    issues = discover_issues(
        tenant_id="T1", matter_id="M1", obligations=[_obligation()],
        assertions=assertions, rules=[cost_rule, approval_rule], activations=activations,
    )

    rule_issues = [issue for issue in issues if issue.rule_ids]
    assert {issue.rule_ids[0] for issue in rule_issues} == {cost_rule.id, approval_rule.id}
    assert {issue.extra_work_id for issue in rule_issues} == {"EW-101"}
    assert all(len(issue.rule_ids) == 1 for issue in rule_issues)


def test_ambiguous_multi_ew_triggers_do_not_create_unscoped_issue() -> None:
    store.issues.clear()
    store.rule_activations.clear()
    _principle, rule = extra_work_cost_communication_rule()
    event_id = "CE-MULTI"
    assertions = [
        _assertion("extra_work_detected", "EW-401 loading dock work.", "EW-401"),
        _assertion("extra_work_detected", "EW-402 service pipe work.", "EW-402"),
        _assertion("instruction_to_proceed", "Please proceed with the event.", {"change_event_id": event_id}),
    ]
    for assertion in assertions[:2]:
        assertion.value["change_event_id"] = event_id
    activations = activate_rules(rules=[rule], assertions=assertions)
    issues = discover_issues(
        tenant_id="T1", matter_id="M1", obligations=[_obligation()],
        assertions=assertions, rules=[rule], activations=activations,
    )

    assert issues
    assert all(issue.extra_work_id in {"EW-401", "EW-402"} for issue in issues)
    assert all(issue.issue_scope != event_id for issue in issues)


def test_document_level_ew_id_is_applied_when_document_is_unambiguous(monkeypatch) -> None:
    monkeypatch.setattr("app.extraction.signal_extractor.ai_candidates", lambda _text: [])
    signals = extract_atomic_signals(
        type("Document", (), {"id": "DOC-CO"})(),
        ParsedContent(document_id="DOC-CO", text="The signed change order is attached for EW-101. CO-101 adjusts the Contract Price by $25,000."),
    )
    assert signals
    assert {signal.value.get("extra_work_id") for signal in signals if isinstance(signal.value, dict)} == {"EW-101"}


def test_explicit_filename_disambiguates_change_order_document(monkeypatch) -> None:
    monkeypatch.setattr("app.extraction.signal_extractor.ai_candidates", lambda _text: [])
    signals = extract_atomic_signals(
        type("Document", (), {"id": "DOC-CO", "metadata": {"original_filename": "03_signed_change_order_EW401.txt"}})(),
        ParsedContent(document_id="DOC-CO", text="The signed change order is attached for EW-401 only. This document does not authorize EW-402."),
    )
    scoped = {signal.signal_type: signal.value.get("extra_work_id") for signal in signals if isinstance(signal.value, dict)}
    assert scoped["signed_change_order"] == "EW-401"


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


def test_invoice_reference_does_not_prove_owner_price_approval() -> None:
    _principle, rule = extra_work_cost_communication_rule()
    invoice = _assertion(
        "invoice_amount",
        "Invoice requests $25,000 payable under the signed change order.",
        "EW-101",
        "invoice",
    )
    checks = evaluate_requirements(
        rule=rule, assertions=[invoice], search_attempts=[],
        tenant_id="T1", matter_id="M1", analysis_run_id="R1",
    )
    approval = next(check for check in checks if check.requirement_id == "owner_approved_additional_cost")

    assert approval.evidence_outcome.value == "INSUFFICIENT_INFORMATION"
    assert approval.supporting_evidence_ids == []


def test_ai_cannot_promote_invoice_to_owner_approval(monkeypatch) -> None:
    _principle, rule = extra_work_cost_communication_rule()
    invoice = _assertion(
        "invoice_amount",
        "Invoice requests $25,000 payable under the signed change order.",
        "EW-101",
        "invoice",
    )
    monkeypatch.setattr(
        "app.analysis.requirement_evaluator.judge_requirement",
        lambda _requirement, _assertions: SemanticJudgment(
            result="support", supporting_ids=[invoice.id], contrary_ids=[], explanation="invalid model citation"
        ),
    )
    checks = evaluate_requirements(
        rule=rule, assertions=[invoice], search_attempts=[],
        tenant_id="T1", matter_id="M1", analysis_run_id="R1",
    )
    approval = next(check for check in checks if check.requirement_id == "owner_approved_additional_cost")

    assert approval.evidence_outcome.value == "INSUFFICIENT_INFORMATION"
    assert invoice.id not in approval.supporting_evidence_ids


def test_signed_change_order_amount_supports_price_basis() -> None:
    change_order = _assertion(
        "formal_change_document",
        "CO-101 is signed by both parties and adjusts the Contract Price by a $25,000 lump sum.",
        "EW-101",
        "CO-101",
    )
    _principle, change_rule = change_order_approval_rule()
    checks = evaluate_requirements(
        rule=change_rule, assertions=[change_order], search_attempts=[],
        tenant_id="T1", matter_id="M1", analysis_run_id="R1",
    )
    price_basis = next(check for check in checks if check.requirement_id == "price_basis_identified")

    assert price_basis.evidence_outcome.value == "SUPPORTED"


def test_case_a_contract_context_does_not_override_explicit_project_approval() -> None:
    _principle, rule = extra_work_cost_communication_rule()
    contract_context = _assertion(
        "scheduling_only",
        "A field direction such as Please proceed does not, without more, constitute written approval of an increase to the Contract Price.",
        "EW-101",
        "00_contract",
    )
    contract_context.evidence_role = EvidenceRole.normative_rule
    priced_request = _assertion(
        "cost_communication",
        "This extra work will increase the Contract Price by an estimated additional cost of $25,000.",
        "EW-101",
        "01_priced_request",
    )
    approval = _assertion(
        "price_approval",
        "I approve the additional cost of $25,000 for EW-101.",
        "EW-101",
        "02_owner_price_approval",
    )
    signed_change_order = _assertion(
        "signed_change_order",
        "Signed change order CO-101 approves the $25,000 adjustment for EW-101.",
        "EW-101",
        "03_signed_change_order",
    )

    checks = evaluate_requirements(
        rule=rule,
        assertions=[contract_context, priced_request, approval, signed_change_order],
        search_attempts=[], tenant_id="T1", matter_id="M1", analysis_run_id="R1",
    )
    by_id = {check.requirement_id: check for check in checks}

    assert by_id["cost_impact_communicated"].result != AssessmentStatus.disputed
    assert by_id["owner_approved_additional_cost"].result != AssessmentStatus.disputed
    assert priced_request.id in by_id["cost_impact_communicated"].supporting_evidence_ids
    assert approval.id in by_id["owner_approved_additional_cost"].supporting_evidence_ids
    assert signed_change_order.id in by_id["owner_approved_additional_cost"].supporting_evidence_ids
    assert all(
        link.relation_type.value != "CONTRADICTS"
        for link in store.evidence_links.values()
        if link.assertion_id == contract_context.id
    )


def test_normative_contract_text_does_not_activate_project_rule() -> None:
    _principle, rule = extra_work_cost_communication_rule()
    contract_signal = _assertion("extra_work_detected", "Extra Work means work outside the original scope.")
    contract_signal.evidence_role = EvidenceRole.normative_rule
    assert activate_rules(rules=[rule], assertions=[contract_signal]) == []


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


def test_four_extra_work_gold_cases_separate_evidence_outcome_from_review() -> None:
    _principle, rule = extra_work_cost_communication_rule()
    cases = [
        ([
            _assertion("extra_work_detected", "Additional steel supports are extra work."),
            _assertion("cost_communication", "Additional cost is $25,000."),
            _assertion("price_approval", "Owner approved the additional cost."),
        ], {"extra_work_occurred": "REQUIREMENT_SATISFIED", "cost_impact_communicated": "REQUIREMENT_SATISFIED", "owner_approved_additional_cost": "REQUIREMENT_SATISFIED"}),
        ([
            _assertion("extra_work_detected", "Additional steel supports are extra work."),
            _assertion("instruction_to_proceed", "Please proceed with the work."),
        ], {"extra_work_occurred": "REQUIREMENT_SATISFIED", "cost_impact_communicated": "INSUFFICIENT_INFORMATION", "owner_approved_additional_cost": "INSUFFICIENT_INFORMATION"}),
        ([
            _assertion("extra_work_detected", "Additional steel supports are extra work."),
            _assertion("instruction_to_proceed", "Please proceed."),
        ], {"extra_work_occurred": "REQUIREMENT_SATISFIED", "cost_impact_communicated": "INSUFFICIENT_INFORMATION", "owner_approved_additional_cost": "INSUFFICIENT_INFORMATION"}),
        ([
            _assertion("extra_work_detected", "East supports are extra work.", "EW-1"),
            _assertion("cost_communication", "West supports have additional cost.", "EW-2"),
        ], {"extra_work_occurred": "REQUIREMENT_SATISFIED", "cost_impact_communicated": "INSUFFICIENT_INFORMATION", "owner_approved_additional_cost": "INSUFFICIENT_INFORMATION"}),
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
