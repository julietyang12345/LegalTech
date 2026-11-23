"""Price rejection / revision variants (reviewer's A-E), independent of CO-04 wording.

The model is replaced by fixed labels, so these pin down the CODE rules:
which later facts may displace earlier ones, per requirement. Amounts, people,
dates and phrasing deliberately differ from the CO-04 gold files.
"""

from app.domain_contracts.schemas import AssessmentStatus, AssertionRelationType, EvidenceRelationType
from app.analysis.semantic_evaluator import RelationJudgment
from app.repositories.memory import store

from tests.test_evidence_relationships import APPROVAL, _a, _judge, _links, _run

COST = "cost_impact_communicated"


def _owner(assertion):
    assertion.actor = "Priya Shah"
    return assertion


def _contractor(assertion):
    assertion.actor = "Leo Brandt"
    return assertion


def test_a_rejected_quote_then_revised_quote_stays_disputed_and_notice_survives(monkeypatch) -> None:
    quote = _contractor(_a("estimate_amount", "Pricing for the added louvers is $41,500.", at="2025-06-02", doc="q1"))
    rejection = _owner(_a("approval_denied", "We can't accept that number.", at="2025-06-03", doc="r1"))
    revised = _contractor(_a("estimate_amount", "Updated pricing is $37,250.", at="2025-06-09", doc="q2"))
    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", _judge({
        APPROVAL: {
            rejection.id: RelationJudgment(rejection.id, "CONTRADICTS", "Owner refuses the price."),
            # A revised quote is context for approval even if the model links it.
            revised.id: RelationJudgment(revised.id, "CONTEXT", "New proposal.", change_target_id=rejection.id, change_type="MODIFIES"),
        },
        COST: {
            quote.id: RelationJudgment(quote.id, "SUPPORTS", "Cost stated."),
            revised.id: RelationJudgment(revised.id, "SUPPORTS", "Revised cost stated.", change_target_id=quote.id, change_type="MODIFIES"),
        },
    }))
    checks = _run([quote, rejection, revised])

    approval = checks[APPROVAL]
    assert approval.result == AssessmentStatus.disputed
    assert approval.contrary_evidence_ids == [rejection.id]
    assert approval.superseded_evidence_ids == []
    # The revision is recorded, but the original notice still counts as notice.
    cost = checks[COST]
    assert quote.id in cost.supporting_evidence_ids and revised.id in cost.supporting_evidence_ids
    assert any(
        link.source_assertion_id == revised.id and link.target_assertion_id == quote.id
        and link.relation_type == AssertionRelationType.modifies
        for link in store.assertion_links.values()
    )


def test_b_owner_later_approves_revised_price_resolves_the_rejection(monkeypatch) -> None:
    rejection = _owner(_a("approval_denied", "Pricing declined as submitted.", at="2025-06-03", doc="r1"))
    approval_fact = _owner(_a("price_approval", "Approved at $37,250.", at="2025-06-11", doc="a1"))
    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", _judge({
        APPROVAL: {
            rejection.id: RelationJudgment(rejection.id, "CONTRADICTS", "Refused."),
            approval_fact.id: RelationJudgment(approval_fact.id, "SUPPORTS", "Accepts revised price.", change_target_id=rejection.id, change_type="SUPERSEDES"),
        },
    }))
    approval = _run([rejection, approval_fact])[APPROVAL]

    assert approval.result == AssessmentStatus.satisfied
    assert approval.supporting_evidence_ids == [approval_fact.id]
    assert approval.superseded_evidence_ids == [rejection.id]
    assert _links(approval.id)[rejection.id] == EvidenceRelationType.context_only  # kept for audit


def test_c_rejection_on_one_extra_work_does_not_touch_another(monkeypatch) -> None:
    rejection = _owner(_a("approval_denied", "Not approving the canopy pricing.", at="2025-06-03", ew="EW-610", doc="r1"))
    other = _owner(_a("price_approval", "Approved: handrail extension at $6,100.", at="2025-06-04", ew="EW-611", doc="a1"))
    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", _judge({
        APPROVAL: {
            rejection.id: RelationJudgment(rejection.id, "CONTRADICTS", "Refused."),
            other.id: RelationJudgment(other.id, "SUPPORTS", "Approved."),
        },
    }))
    approval = _run([rejection, other], extra_work_id="EW-611")[APPROVAL]

    assert approval.result == AssessmentStatus.satisfied
    assert rejection.id not in _links(approval.id)


def test_d_request_to_revise_pricing_is_not_a_rejection(monkeypatch) -> None:
    revise = _owner(_a("pricing_unresolved", "Can you break this down by labor and material and resend?", at="2025-06-03", doc="r1"))
    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", _judge({
        APPROVAL: {revise.id: RelationJudgment(revise.id, "CONTEXT", "Asks for detail; no decision.")},
    }))
    approval = _run([revise])[APPROVAL]

    assert approval.result != AssessmentStatus.disputed
    assert approval.contrary_evidence_ids == []


def test_e_contractor_conditional_offer_does_not_erase_owner_rejection(monkeypatch) -> None:
    rejection = _owner(_a("approval_denied", "We can't accept that number.", at="2025-06-03", doc="r1"))
    offer = _contractor(_a("price_approval", "We'll hold $37,250 if you sign this week.", at="2025-06-09", doc="o1"))
    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", _judge({
        APPROVAL: {
            rejection.id: RelationJudgment(rejection.id, "CONTRADICTS", "Refused."),
            offer.id: RelationJudgment(offer.id, "CONDITIONAL", "Offer pending signature.", condition="signature", change_target_id=rejection.id, change_type="MODIFIES"),
        },
    }))
    approval = _run([rejection, offer])[APPROVAL]

    assert approval.result == AssessmentStatus.disputed
    assert approval.contrary_evidence_ids == [rejection.id]
    assert approval.superseded_evidence_ids == []
