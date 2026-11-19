from datetime import datetime

from app.analysis.evidence_issue_matching import match_new_evidence
from app.analysis.issue_discovery import discover_issues
from app.analysis.requirement_evaluator import evaluate_requirements
from app.analysis.reconciliation import _elapsed_days
from app.analysis.rule_activation import activate_rules
from app.domain_contracts.schemas import (
    AssessmentStatus,
    EvidenceAssertion,
    Issue,
    Obligation,
    Provenance,
    UncertaintyReason,
)
from app.legal_knowledge.default_rules import extra_work_cost_communication_rule
from app.repositories.memory import store


def _provenance() -> Provenance:
    return Provenance(tenant_id="GOLD", matter_id="M-GOLD", analysis_run_id="GOLD-RUN", pipeline_version="gold")


def _assertion(kind: str, text: str, ew: str | None, event_at: str | None, document: str) -> EvidenceAssertion:
    value = {"change_event_id": "CE-GOLD"}
    if ew:
        value["extra_work_id"] = ew
    if event_at:
        value["event_at"] = event_at
    return EvidenceAssertion(
        tenant_id="GOLD", matter_id="M-GOLD", source_document_id=document,
        extra_work_id=ew, assertion_type=kind, statement=text, value=value,
        event_at=event_at, time_source="SOURCE_TEXT" if event_at else "UNKNOWN",
        time_confidence="EXPLICIT" if event_at else "UNKNOWN", relationship_status="EXPLICIT" if ew else "UNSCOPED", provenance=_provenance(),
    )


def test_t01_cost_communication_before_work_has_ordered_sources() -> None:
    _, rule = extra_work_cost_communication_rule()
    assertions = [
        _assertion("work_performed", "EW-201 work started on 2025-02-05.", "EW-201", "2025-02-05", "daily"),
        _assertion("cost_communication", "EW-201 additional cost communicated on 2025-02-03.", "EW-201", "2025-02-03", "notice"),
    ]
    checks = evaluate_requirements(rule=rule, assertions=assertions, search_attempts=[], tenant_id="GOLD", matter_id="M-GOLD", analysis_run_id="T01")
    cost = next(check for check in checks if check.requirement_id == "cost_impact_communicated")
    assert cost.result == AssessmentStatus.satisfied
    assert cost.uncertainty_reason != UncertaintyReason.cost_communication_after_work_start
    assert cost.supporting_evidence_ids == [assertions[1].id]


def test_t02_cost_communication_after_work_is_flagged() -> None:
    _, rule = extra_work_cost_communication_rule()
    assertions = [
        _assertion("work_performed", "EW-201 work started on 2025-02-05.", "EW-201", "2025-02-05", "daily"),
        _assertion("cost_communication", "EW-201 additional cost requested on 2025-02-10.", "EW-201", "2025-02-10", "email"),
    ]
    checks = evaluate_requirements(rule=rule, assertions=assertions, search_attempts=[], tenant_id="GOLD", matter_id="M-GOLD", analysis_run_id="T02")
    cost = next(check for check in checks if check.requirement_id == "cost_impact_communicated")
    assert cost.result == AssessmentStatus.satisfied
    assert cost.uncertainty_reason == UncertaintyReason.cost_communication_after_work_start


def test_r01_two_extra_works_keep_separate_issue_relationships() -> None:
    store.issues.clear()
    _, rule = extra_work_cost_communication_rule()
    obligation = Obligation(tenant_id="GOLD", matter_id="M-GOLD", clause_id="C", obligation_type="change_order_approval", source_span_id="S", provenance=_provenance())
    assertions = [
        _assertion("extra_work_detected", "EW-201 steel supports occurred.", "EW-201", "2025-02-05", "d1"),
        _assertion("extra_work_detected", "EW-202 electrical changes occurred.", "EW-202", "2025-02-06", "d2"),
    ]
    activations = activate_rules(rules=[rule], assertions=assertions)
    issues = discover_issues(tenant_id="GOLD", matter_id="M-GOLD", obligations=[obligation], assertions=assertions, rules=[rule], activations=activations)
    assert {issue.extra_work_id for issue in issues} == {"EW-201", "EW-202"}
    assert {issue.evidence_ids[0] for issue in issues} == {assertions[0].id, assertions[1].id}


def test_r02_unscoped_reply_matches_only_unique_event_scope() -> None:
    store.issues.clear()
    store.assertions.clear()
    issue = Issue(tenant_id="GOLD", matter_id="M-GOLD", type="CHANGE_ORDER", issue_scope="CE-GOLD", extra_work_id="EW-201", title="Cost issue", summary="Review", current_assessment_id="ASSESS-1")
    store.issues[issue.id] = issue
    reply = _assertion("cost_communication", "Replying to your pricing request, the additional cost is $25,000.", None, "2025-02-10", "reply")
    store.assertions[reply.id] = reply
    matched = match_new_evidence([reply.id])
    assert matched == {issue.id}
    assert reply.relationship_status == "INFERRED"
    assert reply.id in issue.evidence_ids


def test_c01_same_scope_opposite_approval_is_direct_conflict() -> None:
    _, rule = extra_work_cost_communication_rule()
    approved = _assertion("price_approval", "Owner approved the additional $25,000 for EW-201.", "EW-201", "2025-02-03", "approve")
    denied = _assertion("approval_denied", "Owner never approved additional compensation for EW-201.", "EW-201", "2025-02-04", "deny")
    checks = evaluate_requirements(rule=rule, assertions=[approved, denied], search_attempts=[], tenant_id="GOLD", matter_id="M-GOLD", analysis_run_id="C01")
    approval = next(check for check in checks if check.requirement_id == "owner_approved_additional_cost")
    assert approval.result == AssessmentStatus.disputed
    assert approval.conflict_classification is not None
    assert approval.conflict_classification.value in {"DIRECT_CONFLICT", "TEMPORAL_SUPERSESSION"}


def test_u01_missing_approval_is_not_a_denial() -> None:
    _, rule = extra_work_cost_communication_rule()
    proceed = _assertion("instruction_to_proceed", "Please proceed with EW-201 work.", "EW-201", "2025-02-03", "owner-email")
    checks = evaluate_requirements(rule=rule, assertions=[proceed], search_attempts=[], tenant_id="GOLD", matter_id="M-GOLD", analysis_run_id="U01")
    approval = next(check for check in checks if check.requirement_id == "owner_approved_additional_cost")
    assert approval.result == AssessmentStatus.insufficient_information
    assert approval.evidence_outcome.value == "INSUFFICIENT_INFORMATION"
    assert approval.uncertainty_reason == UncertaintyReason.no_explicit_approval_found
    assert approval.next_action and "change orders" in approval.next_action


def test_working_day_count_honors_contract_holiday_and_counting_rule() -> None:
    obligation = Obligation(
        tenant_id="GOLD", matter_id="M-GOLD", clause_id="C", obligation_type="notice",
        source_span_id="S", holiday_dates=["2025-02-03"], counting_rule="AFTER_EVENT", provenance=_provenance(),
    )
    assert _elapsed_days(datetime(2025, 1, 31).date(), datetime(2025, 2, 4).date(), "working_days", obligation) == 1
