from collections.abc import Iterable
from datetime import date, datetime

from app.analysis.evidence_relationships import assertion_scope
from app.domain_contracts.recording import record_evidence_link, record_provenance
from app.domain_contracts.schemas import (
    AssessmentStatus,
    EvidenceAssertion,
    EvidenceOutcome,
    EvidenceRelationType,
    EvidenceRole,
    EvidenceStatus,
    ExecutableRuleSpec,
    Provenance,
    RequirementCheck,
    RequirementReviewStatus,
    SearchAttempt,
    UncertaintyReason,
)
from app.analysis.semantic_evaluator import judge_requirement
from app.analysis.text_semantics import is_negative_statement
from app.analysis.text_semantics import is_explicit_denial
from app.analysis.conflict_classifier import classify_conflict
from app.analysis.evidence_matching import matches_queries


def evaluate_requirements(
    *, rule: ExecutableRuleSpec, assertions: Iterable[EvidenceAssertion],
    search_attempts: Iterable[SearchAttempt], tenant_id: str, matter_id: str,
    analysis_run_id: str, pipeline_version: str = "0.1.0",
) -> list[RequirementCheck]:
    # Retrieval can return the same assertion through the issue scope and a
    # requirement-specific search. Evaluate and link each source once.
    assertions = list({assertion.id: assertion for assertion in assertions}.values())
    search_attempts = list(search_attempts)
    if any(a.tenant_id != tenant_id or a.matter_id != matter_id for a in assertions):
        raise ValueError("requirement evaluation cannot mix tenant or matter evidence")
    checks: list[RequirementCheck] = []
    project_assertions = [
        assertion for assertion in assertions
        if assertion.evidence_role == EvidenceRole.project_fact
    ]
    extra_work_id = next((assertion_scope(assertion) for assertion in assertions if assertion_scope(assertion)), None)
    for requirement in rule.requirements:
        supporting = [a for a in project_assertions if _supports(a, requirement)]
        contrary = [a for a in project_assertions if _contradicts(a, requirement)]
        semantic_candidates = [
            assertion for assertion in project_assertions
            if assertion.assertion_type in {
                *requirement.supporting_assertion_types,
                *requirement.contrary_assertion_types,
            } or matches_queries(assertion, requirement.evidence_queries)
        ]
        semantic = judge_requirement(requirement, semantic_candidates) if requirement.evaluation.value in {
            "AI_SEMANTIC", "AI_AND_LAWYER_REVIEW"
        } else None
        if semantic:
            # The model may only promote an assertion that deterministic code
            # considers semantically eligible for this requirement. IDs alone
            # are not enough: an invoice can mention a signed CO without being
            # proof of owner approval.
            supporting = [a for a in semantic_candidates if a.id in semantic.supporting_ids and _supports(a, requirement)]
            contrary = [a for a in semantic_candidates if a.id in semantic.contrary_ids and _contradicts(a, requirement)]
        matching_searches = [
            search for search in search_attempts
            if search.tenant_id == tenant_id and search.matter_id == matter_id
            and (search.issue_id is None or any(query.lower() in search.query.lower() for query in requirement.evidence_queries))
        ]
        result, evidence_outcome, review_status, evidence_status, explanation = _classify_result(
            supporting=supporting,
            contrary=contrary,
            matching_searches=matching_searches,
            semantic_explanation=semantic.explanation if semantic else None,
        )
        conflict_classification = None
        if supporting and contrary:
            conflict_classification = classify_conflict(supporting[0], contrary[0])
        uncertainty_reason, next_action = _uncertainty_for(
            requirement=requirement,
            result=result,
            supporting=supporting,
            contrary=contrary,
            matching_searches=matching_searches,
            semantic=semantic,
            all_assertions=project_assertions,
        )

        provenance = record_provenance(Provenance(
            tenant_id=tenant_id,
            matter_id=matter_id,
            source_document_ids=sorted({a.source_document_id for a in supporting + contrary}),
            source_span_ids=sorted({a.source_span_id for a in supporting + contrary if a.source_span_id}),
            analysis_run_id=analysis_run_id,
            pipeline_version=pipeline_version,
            method=requirement.evaluation.value,
            rationale=f"Requirement evaluation for rule {rule.id} v{rule.version}.",
        ))
        check = RequirementCheck(
            requirement_id=requirement.id,
            extra_work_id=extra_work_id,
            evidence_outcome=evidence_outcome,
            review_status=review_status,
            result=result,
            evidence_status=evidence_status,
            supporting_evidence_ids=[a.id for a in supporting],
            contrary_evidence_ids=[a.id for a in contrary],
            search_attempt_ids=[s.id for s in matching_searches],
            explanation=explanation,
            requires_lawyer_review=review_status == RequirementReviewStatus.required,
            uncertainty_reason=uncertainty_reason,
            next_action=next_action,
            conflict_classification=conflict_classification,
            provenance=provenance,
        )
        checks.append(check)
        for assertion in supporting:
            record_evidence_link(
                tenant_id=tenant_id, matter_id=matter_id,
                extra_work_id=extra_work_id,
                requirement_check_id=check.id, assertion_id=assertion.id,
                relation_type=EvidenceRelationType.supports,
            )
        for assertion in contrary:
            record_evidence_link(
                tenant_id=tenant_id, matter_id=matter_id,
                extra_work_id=extra_work_id,
                requirement_check_id=check.id, assertion_id=assertion.id,
                relation_type=EvidenceRelationType.contradicts,
            )
        for assertion in assertions:
            if assertion.evidence_role == EvidenceRole.project_fact:
                continue
            if matches_queries(assertion, requirement.evidence_queries):
                record_evidence_link(
                    tenant_id=tenant_id, matter_id=matter_id,
                    extra_work_id=extra_work_id,
                    requirement_check_id=check.id, assertion_id=assertion.id,
                    relation_type=EvidenceRelationType.context_only,
                )
    return checks


def _classify_result(*, supporting, contrary, matching_searches, semantic_explanation):
    """Keep evidence, coverage, and review state derived in one place."""
    if contrary:
        return (
            AssessmentStatus.disputed,
            EvidenceOutcome.disputed,
            RequirementReviewStatus.required,
            EvidenceStatus.reconstructable,
            semantic_explanation or "Contrary evidence was identified; the requirement cannot be treated as satisfied.",
        )
    if not supporting:
        return (
            AssessmentStatus.insufficient_information,
            EvidenceOutcome.insufficient_information,
            RequirementReviewStatus.required,
            EvidenceStatus.existence_only if matching_searches else EvidenceStatus.not_found,
            "No supporting evidence was found in the available or recorded search scope.",
        )
    return (
        AssessmentStatus.satisfied,
        EvidenceOutcome.supported,
        RequirementReviewStatus.not_required,
        EvidenceStatus.reconstructable,
        semantic_explanation or "Supporting evidence was identified for this requirement.",
    )


def _uncertainty_for(*, requirement, result, supporting, contrary, matching_searches, semantic, all_assertions):
    if contrary:
        return (
            UncertaintyReason.conflicting_evidence,
            "Compare the conflicting source documents, scope, authority, and dates.",
        )
    if not supporting:
        if matching_searches:
            return (
                UncertaintyReason.search_no_match,
                "Search the remaining project evidence and confirm the supplied corpus is complete.",
            )
        if requirement.id in {"owner_approved_additional_cost", "approval_documented"}:
            return (
                UncertaintyReason.no_explicit_approval_found,
                "Search signed change orders, owner pricing emails, and possible waiver or alternative entitlement evidence.",
            )
        return (
            UncertaintyReason.partial_evidence_set,
            "Confirm whether the relevant project records were uploaded and searched.",
        )
    if requirement.id == "cost_impact_communicated" and _communication_after_work(all_assertions):
        return (
            UncertaintyReason.cost_communication_after_work_start,
            "Check the contract notice rule and whether a waiver or alternative entitlement basis applies.",
        )
    if semantic is None and requirement.evaluation.value in {"AI_SEMANTIC", "AI_AND_LAWYER_REVIEW"}:
        return (
            UncertaintyReason.heuristic_only,
            "Confirm the classification against the cited source text before relying on it for entitlement.",
        )
    return (None, None)


def _communication_after_work(assertions) -> bool:
    work_dates = [_assertion_date(item) for item in assertions if any(term in item.assertion_type for term in ("work_performed", "installation", "daily_report", "construction_started"))]
    communication_dates = [_assertion_date(item) for item in assertions if "cost" in item.assertion_type or "price" in item.assertion_type or "invoice" in item.assertion_type]
    work_dates = [value for value in work_dates if value]
    communication_dates = [value for value in communication_dates if value]
    return bool(work_dates and communication_dates and min(communication_dates) > min(work_dates))


def _assertion_date(assertion):
    value = assertion.event_at
    if not value and isinstance(assertion.value, dict):
        value = assertion.value.get("event_at") or assertion.value.get("communication_at")
    if not value:
        return assertion.asserted_at.date() if assertion.asserted_at else None
    return _as_date(value)


def _as_date(value) -> date | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except (TypeError, ValueError):
        try:
            return date.fromisoformat(str(value))
        except (TypeError, ValueError):
            return None


def _supports(assertion: EvidenceAssertion, requirement) -> bool:
    if assertion.evidence_role != EvidenceRole.project_fact:
        return False
    if assertion.assertion_type in requirement.supporting_assertion_types:
        return _is_affirmative_fact(assertion)
    # Queries retrieve candidates; assertion types determine whether a fact
    # can prove this particular requirement. This prevents invoice text that
    # mentions a signed CO from proving owner approval by keyword alone.
    return False


def _contradicts(assertion: EvidenceAssertion, requirement) -> bool:
    if assertion.evidence_role != EvidenceRole.project_fact:
        return False
    if assertion.assertion_type in requirement.contrary_assertion_types:
        return _is_negative_or_denial(assertion)
    return _is_negative_or_denial(assertion) and assertion.assertion_type in requirement.supporting_assertion_types


def _is_affirmative_fact(assertion: EvidenceAssertion) -> bool:
    if is_negative_statement(assertion.statement):
        return False
    value = assertion.value if isinstance(assertion.value, dict) else {}
    if value.get("polarity") in {"negative", "uncertain"}:
        return False
    if assertion.assertion_type in {
        "signed_change_order", "price_approval", "approved_amount",
        "express_authorization", "written_authorization",
    } and value.get("temporal_status") in {"planned", "denied", "conditional"}:
        return False
    return True


def _is_negative_or_denial(assertion: EvidenceAssertion) -> bool:
    value = assertion.value if isinstance(assertion.value, dict) else {}
    return (
        value.get("polarity") == "negative"
        or value.get("temporal_status") == "denied"
        or is_explicit_denial(assertion.statement)
        or assertion.assertion_type in {"approval_denied", "authorization_denial", "notice_denied"}
    )


__all__ = ["evaluate_requirements"]
