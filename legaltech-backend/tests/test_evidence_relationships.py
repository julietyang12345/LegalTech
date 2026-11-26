"""Per-requirement evidence relations, change edges, scope/time checks, and uncertainty reasons."""

from datetime import datetime

import pytest

from app.analysis.dependency_graph import determine_assertion_affected_issues, record_issue_dependencies
from app.analysis.requirement_evaluator import evaluate_requirements
from app.analysis.semantic_evaluator import (
    RelationJudgment,
    SemanticJudgment,
    bounded_excerpts,
    failed_judgment,
    parse_judgment,
)
from app.domain_contracts.schemas import (
    AssertionRelationType,
    AssessmentStatus,
    EvidenceAssertion,
    EvidenceRelationType,
    Issue,
    IssueType,
    Provenance,
    RequirementReviewStatus,
    UncertaintyReason,
)
from app.legal_knowledge.default_rules import extra_work_cost_communication_rule
from app.repositories.memory import store

APPROVAL = "owner_approved_additional_cost"


@pytest.fixture(autouse=True)
def _clean_store():
    store.reset()
    yield
    store.reset()


def _p() -> Provenance:
    return Provenance(tenant_id="T1", matter_id="M1", analysis_run_id="R1", pipeline_version="test")


def _a(kind: str, text: str, *, at: str | None = None, ew: str | None = "EW-201", doc: str = "D", **value) -> EvidenceAssertion:
    payload = dict(value)
    if ew:
        payload["extra_work_id"] = ew
    if at:
        payload["event_at"] = at
    return EvidenceAssertion(
        tenant_id="T1", matter_id="M1", source_document_id=doc, extra_work_id=ew,
        assertion_type=kind, statement=text, value=payload, event_at=at,
        asserted_at=datetime(2025, 2, 10), provenance=_p(),
    )


def _judge(by_requirement: dict[str, dict[str, RelationJudgment]]):
    """Fake model: per-requirement relations, unlabeled for other requirements."""
    def judge(requirement, candidates):
        relations = {
            assertion_id: judged
            for assertion_id, judged in by_requirement.get(requirement.id, {}).items()
            if assertion_id in {c.id for c in candidates}
        }
        if not relations:
            return None
        return SemanticJudgment(result="uncertain", explanation="fake", relations=relations)
    return judge


def _run(assertions, extra_work_id="EW-201"):
    _principle, rule = extra_work_cost_communication_rule()
    checks = evaluate_requirements(
        rule=rule, assertions=assertions, search_attempts=[],
        tenant_id="T1", matter_id="M1", analysis_run_id="R1", extra_work_id=extra_work_id,
    )
    return {check.requirement_id: check for check in checks}


def _links(check_id: str) -> dict[str, EvidenceRelationType]:
    return {
        link.assertion_id: link.relation_type
        for link in store.evidence_links.values()
        if link.requirement_check_id == check_id
    }


def test_ew201_timeline_relations_are_per_requirement_and_change_edge_targets_prior_denial(monkeypatch) -> None:
    cost = _a("cost_communication", "The additional work will cost $25,000.", at="2025-02-02", doc="feb2")
    proceed = _a("instruction_to_proceed", "Please proceed with the work.", at="2025-02-03", doc="feb3")
    denial = _a("price_approval", "I do not approve the additional $25,000.", at="2025-02-04", doc="feb4")
    conditional = _a("price_approval", "I now approve $20,000, subject to signing.", at="2025-02-06", doc="feb6")
    # The same owner revises their own decision.
    denial.actor = conditional.actor = "Dana Owner"
    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", _judge({
        APPROVAL: {
            cost.id: RelationJudgment(cost.id, "CONTEXT", "A cost proposal is not approval."),
            denial.id: RelationJudgment(denial.id, "CONTRADICTS", "Explicit refusal."),
            conditional.id: RelationJudgment(
                conditional.id, "CONDITIONAL", "Approval gated on signature.", condition="signing",
                change_target_id=denial.id, change_type="MODIFIES",
            ),
        },
        "cost_impact_communicated": {cost.id: RelationJudgment(cost.id, "SUPPORTS", "States the cost.")},
    }))

    checks = _run([cost, proceed, denial, conditional])
    approval = checks[APPROVAL]

    # The Feb 6 email modifies the Feb 4 denial specifically.
    [edge] = store.assertion_links.values()
    assert (edge.source_assertion_id, edge.target_assertion_id) == (conditional.id, denial.id)
    assert edge.relation_type == AssertionRelationType.modifies
    assert approval.superseded_evidence_ids == [denial.id]
    assert approval.contrary_evidence_ids == []
    assert approval.conditional_evidence_ids == [conditional.id]
    assert approval.result == AssessmentStatus.lawyer_review_required
    assert approval.uncertainty_reasons[:2] == [UncertaintyReason.condition_unmet, UncertaintyReason.later_modification]
    assert approval.review_status == RequirementReviewStatus.required

    links = _links(approval.id)
    assert cost.id not in links  # never a candidate for approval: bounded retrieval
    assert links[denial.id] == EvidenceRelationType.context_only  # superseded, kept for audit
    assert links[conditional.id] == EvidenceRelationType.conditional
    # Same email supports a different requirement.
    assert cost.id in checks["cost_impact_communicated"].supporting_evidence_ids


def test_paraphrased_denial_is_contrary_when_model_reads_it(monkeypatch) -> None:
    refusal = _a("price_approval", "We're not paying a cent more for that framing.", at="2025-02-04")
    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", _judge({
        APPROVAL: {refusal.id: RelationJudgment(refusal.id, "CONTRADICTS", "Refuses extra payment.")},
    }))
    approval = _run([refusal])[APPROVAL]

    assert approval.result == AssessmentStatus.disputed
    assert approval.contrary_evidence_ids == [refusal.id]


def test_model_support_against_negative_polarity_becomes_uncertain(monkeypatch) -> None:
    denial = _a("price_approval", "I did not approve the $25,000.", at="2025-02-04")
    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", _judge({
        APPROVAL: {denial.id: RelationJudgment(denial.id, "SUPPORTS", "wrong")},
    }))
    approval = _run([denial])[APPROVAL]

    assert approval.supporting_evidence_ids == []
    assert approval.uncertain_evidence_ids == [denial.id]
    assert approval.uncertainty_reason == UncertaintyReason.semantic_uncertain
    assert approval.requires_lawyer_review


def test_conditional_approval_is_not_satisfied_without_model() -> None:
    conditional = _a("price_approval", "I approve $20,000, subject to signing the change order.", at="2025-02-06")
    approval = _run([conditional])[APPROVAL]

    assert approval.supporting_evidence_ids == []
    assert approval.conditional_evidence_ids == [conditional.id]
    assert approval.uncertainty_reason == UncertaintyReason.condition_unmet
    assert approval.result != AssessmentStatus.satisfied


def test_change_edge_pointing_forward_in_time_is_rejected(monkeypatch) -> None:
    earlier = _a("price_approval", "I approve $25,000.", at="2025-02-02")
    later = _a("price_approval", "Approval stands at $25,000.", at="2025-02-09")
    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", _judge({
        APPROVAL: {
            earlier.id: RelationJudgment(earlier.id, "SUPPORTS", change_target_id=later.id, change_type="SUPERSEDES"),
            later.id: RelationJudgment(later.id, "SUPPORTS"),
        },
    }))
    approval = _run([earlier, later])[APPROVAL]

    assert store.assertion_links == {}
    assert approval.superseded_evidence_ids == []
    assert set(approval.supporting_evidence_ids) == {earlier.id, later.id}


def test_model_failure_is_analysis_incomplete_not_missing_evidence(monkeypatch) -> None:
    unrelated = _a("cost_communication", "Revised price attached.", at="2025-02-02")
    monkeypatch.setattr(
        "app.analysis.requirement_evaluator.judge_requirement",
        lambda _requirement, _candidates: failed_judgment("timeout"),
    )
    approval = _run([unrelated])[APPROVAL]

    assert approval.analysis_complete is False
    assert approval.uncertainty_reason == UncertaintyReason.analysis_incomplete
    assert UncertaintyReason.no_explicit_approval_found not in approval.uncertainty_reasons
    assert approval.evidence_outcome.value == "UNKNOWN"
    assert approval.requires_lawyer_review


def test_truncated_candidates_fall_back_and_flag_incomplete(monkeypatch) -> None:
    approval_fact = _a("price_approval", "I approve the additional cost of $25,000.", at="2025-02-05")
    monkeypatch.setattr(
        "app.analysis.requirement_evaluator.judge_requirement",
        lambda _requirement, candidates: SemanticJudgment(
            result="uncertain", relations={}, omitted_ids=[c.id for c in candidates],
        ),
    )
    approval = _run([approval_fact])[APPROVAL]

    assert approval.supporting_evidence_ids == [approval_fact.id]  # deterministic fallback
    assert approval.analysis_complete is False
    assert approval.uncertainty_reason == UncertaintyReason.analysis_incomplete
    assert approval.review_status == RequirementReviewStatus.required


def test_other_extra_work_evidence_is_excluded_by_scope() -> None:
    other = _a("price_approval", "I approve $25,000.", at="2025-02-05", ew="EW-999")
    approval = _run([other])[APPROVAL]

    assert approval.excluded_evidence_ids == [other.id]
    assert approval.supporting_evidence_ids == []


def test_unscoped_support_flags_scope_unverified() -> None:
    unscoped = _a("price_approval", "I approve the additional cost.", at="2025-02-05", ew=None)
    approval = _run([unscoped])[APPROVAL]

    assert approval.supporting_evidence_ids == [unscoped.id]
    assert UncertaintyReason.scope_unverified in approval.uncertainty_reasons
    assert approval.requires_lawyer_review


def test_approval_after_work_start_is_flagged() -> None:
    work = _a("work_performed", "Crew installed the supports.", at="2025-02-03")
    approval_fact = _a("price_approval", "I approve the additional cost of $25,000.", at="2025-02-08")
    approval = _run([work, approval_fact])[APPROVAL]

    assert approval.result == AssessmentStatus.satisfied
    assert approval.uncertainty_reason == UncertaintyReason.approval_after_work_start
    assert approval.requires_lawyer_review


def test_undated_approval_with_dated_work_is_temporal_order_uncertain() -> None:
    work = _a("work_performed", "Crew installed the supports.", at="2025-02-03")
    approval_fact = _a("price_approval", "I approve the additional cost of $25,000.")
    approval = _run([work, approval_fact])[APPROVAL]

    assert UncertaintyReason.temporal_order_uncertain in approval.uncertainty_reasons


def test_parse_judgment_drops_unknown_ids_labels_and_self_changes() -> None:
    judgment = parse_judgment(
        {"relations": [
            {"id": "A1", "relation": "supports", "changes": {"target_id": "A1", "type": "MODIFIES"}},
            {"id": "A2", "relation": "APPROVED"},
            {"id": "GHOST", "relation": "CONTRADICTS"},
            {"id": "A3", "relation": "CONTRADICTS", "changes": {"target_id": "A1", "type": "REVOKES"}},
        ]},
        sent_ids=["A1", "A2", "A3"],
    )
    assert set(judgment.relations) == set()
    assert judgment.status == "failed"
    assert "A2" in judgment.omitted_ids
    # Partial coverage is rejected as a whole; no relation may be promoted.
    assert judgment.result == "uncertain"
    assert parse_judgment({"relations": []}, sent_ids=["A1"]).status == "failed"
    assert parse_judgment({"result": "support"}, sent_ids=["A1"]).status == "failed"


def test_excerpt_budget_omits_whole_assertions_instead_of_cutting_text() -> None:
    first = _a("price_approval", "Short.", at="2025-02-01")
    second = _a("price_approval", "x" * 500, at="2025-02-02")
    lines, omitted = bounded_excerpts([second, first], max_chars=300)

    assert len(lines) == 1 and lines[0].startswith(first.id)
    assert omitted == [second.id]


def test_correcting_modified_assertion_reaches_issue_through_change_edge(monkeypatch) -> None:
    denial = _a("price_approval", "I do not approve the additional $25,000.", at="2025-02-04")
    conditional = _a("price_approval", "I now approve $20,000, subject to signing.", at="2025-02-06")
    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", _judge({
        APPROVAL: {
            denial.id: RelationJudgment(denial.id, "CONTRADICTS"),
            conditional.id: RelationJudgment(conditional.id, "CONDITIONAL", change_target_id=denial.id, change_type="MODIFIES"),
        },
    }))
    _run([denial, conditional])
    other_issue = Issue(
        tenant_id="T1", matter_id="M1", type=IssueType.change_order,
        evidence_ids=[conditional.id], title="t", summary="s",
    )
    store.issues[other_issue.id] = other_issue
    record_issue_dependencies(other_issue, type("A", (), {"id": "ASSESS-X"})())

    # The issue cites only the Feb 6 email, but correcting Feb 4 must reach it.
    assert determine_assertion_affected_issues({denial.id}) == {other_issue.id}


def test_signed_co_supports_price_basis_only_when_it_states_a_price() -> None:
    from app.legal_knowledge.default_rules import change_order_approval_rule
    _principle, rule = change_order_approval_rule()
    signature = _a("signed_change_order", "Owner signature: /s/ Anika Patel, April 14, 2026", at="2026-04-14")
    priced = _a("signed_change_order", "CO-505 signed; Contract Price Adjustment: $13,600.00", at="2026-04-14", doc="co2")

    def price_basis(assertions):
        checks = evaluate_requirements(
            rule=rule, assertions=assertions, search_attempts=[],
            tenant_id="T1", matter_id="M1", analysis_run_id="R1", extra_work_id="EW-201",
        )
        return next(check for check in checks if check.requirement_id == "price_basis_identified")

    assert price_basis([signature]).supporting_evidence_ids == []
    assert _links(price_basis([signature]).id)[signature.id] == EvidenceRelationType.context_only
    assert price_basis([signature, priced]).supporting_evidence_ids == [priced.id]


def test_dashboard_gap_is_not_cancelled_by_another_rule_with_same_requirement_id() -> None:
    from types import SimpleNamespace
    from app.api.issues import _aggregate_requirement_gaps

    def record(rule_id, missing, satisfied):
        checks = [SimpleNamespace(requirement_id=r, result=SimpleNamespace(value="REQUIREMENT_SATISFIED"), evidence_outcome=None) for r in satisfied]
        return {
            "issue": SimpleNamespace(id=rule_id, rule_ids=[rule_id]),
            "assessment": SimpleNamespace(requirement_checks=checks),
            "dashboard": {"missing_requirements": missing, "contrary_requirements": []},
        }

    missing, _contrary, _unmet = _aggregate_requirement_gaps([
        record("RULE_A", ["extra_work_occurred"], []),
        record("RULE_B", [], ["extra_work_occurred"]),
    ])
    assert missing == ["extra_work_occurred"]


def test_semantic_excerpt_names_source_document_and_correspondents() -> None:
    """The model needs to know a sentence came from the contractor's email to the
    owner; otherwise "current estimate is $13,600" reads as mere background."""
    from app.analysis.semantic_evaluator import _excerpt
    from app.models.domain import Document, DocumentType
    from app.services.pipeline import correspondence_header

    text = ("PROJECT CORRESPONDENCE\nDate sent: April 7, 2026\nFrom: Owen Fox <owen@stellar.example>\n"
            "To: Anika Patel <anika@gardenview.example>\nSubject: Additional duct reroute\n\n"
            "current estimate is $13,600.")
    header = correspondence_header(text)
    assert header["from"].startswith("Owen Fox") and header["to"].startswith("Anika Patel")

    document = Document(document_type=DocumentType.email, file_hash="h", storage_path="/tmp/x",
                        metadata={f"header_{key}": value for key, value in header.items()})
    store.documents[document.id] = document
    excerpt = _excerpt(_a("estimate_amount", "current estimate is $13,600.", doc=document.id))
    assert "source=email from Owen Fox" in excerpt and "to Anika Patel" in excerpt
