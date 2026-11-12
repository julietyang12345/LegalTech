from app.analysis.incremental import reanalyze_rule_dependents
from app.analysis.issue_discovery import discover_issues
from app.analysis.rule_activation import activate_rules
from app.domain_contracts.schemas import EvidenceAssertion, Obligation, Provenance
from app.evals.golden import GoldenCase, evaluate_golden_cases
from app.legal_knowledge.case_rule_extraction import candidate_to_principle, extract_case_rule_candidate
from app.legal_knowledge.default_rules import extra_work_cost_communication_rule
from app.legal_knowledge.rule_registry import register_rule
from app.repositories.memory import store


def _p() -> Provenance:
    return Provenance(tenant_id="T1", matter_id="M1", analysis_run_id="R", pipeline_version="test")


def _a(kind: str, text: str, ident: str = "EW-1") -> EvidenceAssertion:
    return EvidenceAssertion(
        tenant_id="T1", matter_id="M1", source_document_id=f"DOC-{kind}",
        assertion_type=kind, statement=text, value={"extra_work_id": ident}, provenance=_p()
    )


def test_golden_metrics_cover_activation_and_requirement_accuracy() -> None:
    _principle, rule = extra_work_cost_communication_rule()
    report = evaluate_golden_cases(rule, [
        GoldenCase(
            id="positive",
            assertions=[_a("extra_work_detected", "Additional work occurred"), _a("cost_communication", "Additional costs were communicated")],
            expects_activation=True,
            expected_requirements={
                "extra_work_occurred": "LAWYER_REVIEW_REQUIRED",
                "cost_impact_communicated": "LAWYER_REVIEW_REQUIRED",
                "owner_approved_additional_cost": "INSUFFICIENT_INFORMATION",
            },
        ),
        GoldenCase(id="negative", assertions=[], expects_activation=False, expected_requirements={}),
    ])
    assert report["rule_activation_recall"] == 1.0
    assert report["requirement_evaluation_accuracy"] == 1.0


def test_case_rule_extraction_is_review_gated() -> None:
    candidate = extract_case_rule_candidate(
        case_document_id="CASE-1", title="Notice case", facts=["Delay occurred"],
        court_findings=["Notice analysis was fact-specific"], candidate_principle="Candidate only",
        tenant_id="T1", matter_id="M1",
    )
    assert candidate.requires_lawyer_review is True
    assert candidate.review_status.value == "PENDING"
    assert candidate_to_principle(candidate).approval_status.value == "DRAFT"


def test_rule_dependents_are_reanalyzed_with_new_assessment_version() -> None:
    store.issues.clear(); store.assessments.clear(); store.provenance.clear(); store.rule_activations.clear(); store.rule_specs.clear(); store.legal_principles.clear(); store.dependency_edges.clear()
    principle, rule = extra_work_cost_communication_rule()
    register_rule(principle, rule)
    obligation = Obligation(tenant_id="T1", matter_id="M1", clause_id="C1", obligation_type="change_order_approval", source_span_id="S1", provenance=_p())
    assertion = _a("extra_work_detected", "Additional work occurred")
    activation = activate_rules(rules=[rule], assertions=[assertion])
    issue = discover_issues(tenant_id="T1", matter_id="M1", obligations=[obligation], assertions=[assertion], rules=[rule], activations=activation)[0]
    from app.analysis.reconciliation import reconcile_issue
    first = reconcile_issue(issue=issue, obligations=[obligation], assertions=[assertion], analysis_run_id="R1", rule=rule)
    second_ids = reanalyze_rule_dependents(rule=rule, obligations=[obligation], assertions=[assertion], analysis_run_id="R2")
    assert second_ids == [issue.id]
    assert store.assessments[first.id].is_current is False
    assert issue.current_assessment_id != first.id
