import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime

from app.analysis.evidence_relationships import assertion_scope
from app.domain_contracts.recording import record_assertion_link, record_evidence_link, record_provenance
from app.domain_contracts.schemas import (
    AssertionRelationType,
    AssessmentStatus,
    ConflictClassification,
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
from app.analysis.semantic_evaluator import PROMPT_VERSION, judge_requirement
from app.analysis.text_semantics import is_negative_statement
from app.analysis.text_semantics import is_conditional_statement, is_explicit_denial
from app.analysis.conflict_classifier import classify_conflict, validate_ai_relationship
from app.analysis.evidence_matching import matches_queries
from app.analysis.event_time import parse_event_date


AI_METHODS = {"AI_SEMANTIC", "AI_AND_LAWYER_REVIEW"}
APPROVAL_REQUIREMENTS = {"owner_approved_additional_cost", "approval_documented"}
# Requirements whose legal effect depends on ordering against work start.
TEMPORAL_REQUIREMENTS = {"cost_impact_communicated", *APPROVAL_REQUIREMENTS}
# Reasons that always route a check to human review, whatever the outcome.
REVIEW_REASONS = {
    UncertaintyReason.analysis_incomplete,
    UncertaintyReason.semantic_uncertain,
    UncertaintyReason.condition_unmet,
    UncertaintyReason.later_modification,
    UncertaintyReason.approval_after_work_start,
    UncertaintyReason.temporal_order_uncertain,
    UncertaintyReason.scope_unverified,
}
NEXT_ACTIONS = {
    UncertaintyReason.analysis_incomplete: "Re-run semantic analysis; the model failed or did not see every candidate, so absence of support is not yet a finding.",
    UncertaintyReason.conflicting_evidence: "Compare the conflicting source documents, scope, authority, and dates.",
    UncertaintyReason.condition_unmet: "Locate evidence that the stated condition (e.g. signature) was satisfied before treating the approval as effective.",
    UncertaintyReason.semantic_uncertain: "Read the cited source language; the system could not determine whether it supports or denies this requirement.",
    UncertaintyReason.search_no_match: "Search the remaining project evidence and confirm the supplied corpus is complete.",
    UncertaintyReason.no_explicit_approval_found: "Search signed change orders, owner pricing emails, and possible waiver or alternative entitlement evidence.",
    UncertaintyReason.partial_evidence_set: "Confirm whether the relevant project records were uploaded and searched.",
    UncertaintyReason.cost_communication_after_work_start: "Check the contract notice rule and whether a waiver or alternative entitlement basis applies.",
    UncertaintyReason.approval_after_work_start: "Approval post-dates work start; assess ratification, waiver, or course-of-dealing arguments.",
    UncertaintyReason.temporal_order_uncertain: "Confirm source dates; the order of approval/communication and work start could not be established.",
    UncertaintyReason.scope_unverified: "Confirm the supporting evidence concerns this extra work item; it carries no EW identifier.",
    UncertaintyReason.later_modification: "Review the later modification and confirm which version of the approval or position is in force.",
    UncertaintyReason.heuristic_only: "Confirm the classification against the cited source text before relying on it for entitlement.",
}


@dataclass
class _Classified:
    relation: EvidenceRelationType
    method: str
    rationale: str | None = None
    condition: str | None = None


def evaluate_requirements(
    *, rule: ExecutableRuleSpec, assertions: Iterable[EvidenceAssertion],
    search_attempts: Iterable[SearchAttempt], tenant_id: str, matter_id: str,
    analysis_run_id: str, pipeline_version: str = "0.1.0",
    extra_work_id: str | None = None,
) -> list[RequirementCheck]:
    """Label each candidate per requirement, then derive the check in code.

    Pipeline per requirement:
    1. Code: tenant/matter isolation and EW scope validation.
    2. AI (when configured): one relation label per candidate.
    3. Code: admit labels only where assertion type/role allows them; record
       validated MODIFIES/SUPERSEDES/REVOKES edges and drop superseded facts.
    4. Code: derive result, review state, and all uncertainty reasons.
    """
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
    if extra_work_id is None:
        extra_work_id = next((assertion_scope(a) for a in assertions if assertion_scope(a)), None)
    # Scope validation: a fact explicitly tied to another EW never counts here.
    excluded = [
        a for a in project_assertions
        if extra_work_id and assertion_scope(a) and assertion_scope(a) != extra_work_id
    ]
    excluded_ids = {a.id for a in excluded}
    project_assertions = [a for a in project_assertions if a.id not in excluded_ids]
    for requirement in rule.requirements:
        retrieval = _latest_retrieval(search_attempts, requirement.id, tenant_id, matter_id, extra_work_id)
        retrieved_ids = set(retrieval.candidate_assertion_ids) if retrieval else set()
        semantic_only_ids = set(retrieval.semantic_candidate_ids) if retrieval else set()
        retrieval_incomplete = bool(retrieval and retrieval.semantic_status in {"FAILED", "PARTIAL"})
        # Union of direct matches and whatever targeted retrieval (including
        # AI selection) returned for this requirement. Scope was already
        # validated above, so retrieval cannot reintroduce another EW.
        candidates = [
            assertion for assertion in project_assertions
            if assertion.assertion_type in {
                *requirement.supporting_assertion_types,
                *requirement.price_bearing_assertion_types,
                *requirement.contrary_assertion_types,
            } or matches_queries(assertion, requirement.evidence_queries)
            or assertion.id in retrieved_ids
        ]
        is_ai_requirement = requirement.evaluation.value in AI_METHODS
        semantic = judge_requirement(requirement, candidates) if is_ai_requirement else None
        semantic_failed = semantic is not None and semantic.status == "failed"
        usable_semantic = semantic if semantic is not None and not semantic_failed else None
        omitted_ids = set(semantic.omitted_ids) if semantic else set()

        classified = {
            a.id: label for a in candidates
            if (label := _classify(a, requirement, usable_semantic, omitted_ids, a.id in semantic_only_ids)) is not None
        }
        superseded, unordered_changes, relationship_classifications = _record_changes(
            candidates=candidates, semantic=usable_semantic, classified=classified,
            requirement_id=requirement.id, tenant_id=tenant_id, matter_id=matter_id,
            extra_work_id=extra_work_id,
        )
        active = [a for a in candidates if a.id in classified and a.id not in superseded]
        by_relation = {
            relation: [a for a in active if classified[a.id].relation == relation]
            for relation in EvidenceRelationType
        }
        supporting = by_relation[EvidenceRelationType.supports]
        contrary = by_relation[EvidenceRelationType.contradicts]
        conditional = by_relation[EvidenceRelationType.conditional]
        uncertain = by_relation[EvidenceRelationType.uncertain]
        analysis_complete = not semantic_failed and not omitted_ids and not retrieval_incomplete

        matching_searches = [
            search for search in search_attempts
            if search.tenant_id == tenant_id and search.matter_id == matter_id
            and (search.issue_id is None or any(query.lower() in search.query.lower() for query in requirement.evidence_queries))
        ]
        result, evidence_outcome, review_status, evidence_status, explanation = _classify_result(
            supporting=supporting,
            contrary=contrary,
            conditional=conditional,
            uncertain=uncertain,
            matching_searches=matching_searches,
            analysis_complete=analysis_complete,
            semantic_explanation=usable_semantic.explanation if usable_semantic else None,
        )
        conflict_classification = None
        if supporting and contrary:
            conflict_classification = classify_conflict(supporting[0], contrary[0])
        elif relationship_classifications:
            conflict_classification = relationship_classifications[0]
        elif superseded:
            conflict_classification = ConflictClassification.later_modification
        reasons = _uncertainty_reasons(
            requirement=requirement,
            supporting=supporting,
            contrary=contrary,
            conditional=conditional,
            uncertain=uncertain,
            superseded=superseded,
            unordered_changes=unordered_changes,
            matching_searches=matching_searches,
            semantic=semantic,
            analysis_complete=analysis_complete,
            all_assertions=project_assertions,
            extra_work_id=extra_work_id,
        )
        if any(reason in REVIEW_REASONS for reason in reasons):
            review_status = RequirementReviewStatus.required

        linked = supporting + contrary + conditional + uncertain
        provenance = record_provenance(Provenance(
            tenant_id=tenant_id,
            matter_id=matter_id,
            source_document_ids=sorted({a.source_document_id for a in linked}),
            source_span_ids=sorted({a.source_span_id for a in linked if a.source_span_id}),
            analysis_run_id=analysis_run_id,
            pipeline_version=pipeline_version,
            model_id=usable_semantic.model_id if usable_semantic else None,
            prompt_version=PROMPT_VERSION if usable_semantic else None,
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
            conditional_evidence_ids=[a.id for a in conditional],
            uncertain_evidence_ids=[a.id for a in uncertain],
            superseded_evidence_ids=sorted(superseded),
            excluded_evidence_ids=sorted(excluded_ids),
            analysis_complete=analysis_complete,
            search_attempt_ids=[s.id for s in matching_searches],
            explanation=explanation,
            requires_lawyer_review=review_status == RequirementReviewStatus.required,
            uncertainty_reason=reasons[0] if reasons else None,
            uncertainty_reasons=reasons,
            next_action=NEXT_ACTIONS.get(reasons[0]) if reasons else None,
            conflict_classification=conflict_classification,
            provenance=provenance,
        )
        checks.append(check)
        for assertion in candidates:
            label = classified.get(assertion.id)
            if label is None:
                continue
            relation, rationale = label.relation, label.rationale
            if assertion.id in superseded:
                relation = EvidenceRelationType.context_only
                rationale = f"Superseded by a later assertion; originally {label.relation.value}."
            record_evidence_link(
                tenant_id=tenant_id, matter_id=matter_id,
                extra_work_id=extra_work_id,
                requirement_check_id=check.id, assertion_id=assertion.id,
                relation_type=relation, method=label.method,
                rationale=rationale, condition=label.condition,
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
                    rationale="Normative or context text; not a project fact.",
                )
    return checks


def _latest_retrieval(search_attempts, requirement_id, tenant_id, matter_id, extra_work_id):
    """Most recent targeted retrieval for this requirement and EW scope."""
    attempts = [
        attempt for attempt in search_attempts
        if attempt.tenant_id == tenant_id and attempt.matter_id == matter_id
        and attempt.filters.get("requirement_id") == requirement_id
        and (attempt.scope or {}).get("extra_work_id") == extra_work_id
    ]
    return max(attempts, key=lambda attempt: attempt.completed_at) if attempts else None


def _classify(assertion, requirement, semantic, omitted_ids, semantic_only=False) -> _Classified | None:
    """Return the admitted relation of one candidate to one requirement."""
    if semantic is None and assertion.id in omitted_ids:
        # A model failure or partial response must not silently turn an
        # unclassified assertion into deterministic evidence.
        return None
    if semantic is not None and assertion.id not in omitted_ids:
        judged = semantic.relation_for(assertion.id)
        if judged is None:
            # Model saw it and chose not to label it: not evidence either way.
            return None
        return _admit(judged, assertion, requirement, semantic_only)
    return _deterministic(assertion, requirement)


def _admit(judged, assertion, requirement, semantic_only=False) -> _Classified:
    """Structural gate on a model label.

    The model decides what the language means. Code decides what an assertion
    of this type is allowed to prove: an invoice mentioning a signed CO can be
    context for owner approval, never proof of it.
    """
    if assertion.relationship_status == "UNRESOLVED_SCOPE":
        return _Classified(EvidenceRelationType.uncertain, "CODE_SCOPE", "Extra Work scope is unresolved; lawyer review is required.")
    supporting_type = _is_supporting_type(assertion, requirement)
    eligible = supporting_type or assertion.assertion_type in requirement.contrary_assertion_types
    method = "AI_SEMANTIC"
    relation = judged.relation
    if relation == "SUPPORTS":
        if not supporting_type:
            if semantic_only:
                # Found only by AI retrieval and judged supportive, but its
                # extracted type is not one this requirement accepts. The type
                # list may be incomplete: route to review instead of hiding it.
                return _Classified(EvidenceRelationType.uncertain, method, f"Model support for {assertion.assertion_type}, a type this requirement does not accept; verify manually.")
            return _Classified(EvidenceRelationType.context_only, method, f"Model support rejected: {assertion.assertion_type} cannot establish this requirement.")
        if _is_negative_or_denial(assertion):
            return _Classified(EvidenceRelationType.uncertain, method, "Model support conflicts with extracted negative polarity.")
        if _is_conditional(assertion):
            return _Classified(EvidenceRelationType.conditional, method, judged.rationale, judged.condition or "Condition stated in source.")
        if not _is_affirmative_fact(assertion):
            return _Classified(EvidenceRelationType.uncertain, method, "Model support conflicts with extracted temporal status or polarity.")
        return _Classified(EvidenceRelationType.supports, method, judged.rationale)
    if relation == "CONTRADICTS":
        if eligible:
            return _Classified(EvidenceRelationType.contradicts, method, judged.rationale)
        return _Classified(EvidenceRelationType.context_only, method, "Model contradiction rejected: assertion type is not eligible for this requirement.")
    if relation == "CONDITIONAL":
        if supporting_type:
            return _Classified(EvidenceRelationType.conditional, method, judged.rationale, judged.condition)
        return _Classified(EvidenceRelationType.context_only, method, judged.rationale)
    if relation == "UNCERTAIN" and eligible:
        return _Classified(EvidenceRelationType.uncertain, method, judged.rationale)
    return _Classified(EvidenceRelationType.context_only, method, judged.rationale)


def _deterministic(assertion, requirement) -> _Classified:
    method = "DETERMINISTIC"
    if _contradicts(assertion, requirement):
        return _Classified(EvidenceRelationType.contradicts, method)
    if _is_supporting_type(assertion, requirement):
        if _is_conditional(assertion):
            return _Classified(EvidenceRelationType.conditional, method, condition="Condition stated in source.")
        if _is_affirmative_fact(assertion):
            return _Classified(EvidenceRelationType.supports, method)
        value = assertion.value if isinstance(assertion.value, dict) else {}
        if value.get("polarity") == "uncertain":
            return _Classified(EvidenceRelationType.uncertain, method, "Extracted polarity is uncertain.")
    return _Classified(EvidenceRelationType.context_only, method)


def _record_changes(*, candidates, semantic, classified, requirement_id, tenant_id, matter_id, extra_work_id):
    """Validate model-proposed change edges and return (superseded ids, unordered?).

    Code checks: both ends are candidates, same Matter/EW scope, and the
    target is earlier than the source. Missing material facts do not create an
    assertion link and instead route the check to review.
    """
    if semantic is None:
        return set(), False, []
    by_id = {a.id: a for a in candidates}
    superseded: set[str] = set()
    unordered = False
    classifications: list[ConflictClassification] = []
    for source_id, judged in semantic.relations.items():
        target_id = judged.change_target_id
        source, target = by_id.get(source_id), by_id.get(target_id)
        if source is None or target is None or source_id not in classified:
            continue
        classification, rejection = validate_ai_relationship(source, target, judged.change_type or "")
        if classification == ConflictClassification.different_scope:
            classifications.append(classification)
            continue
        if rejection:
            unordered = True
            continue
        if classification:
            classifications.append(classification)
        record_assertion_link(
            tenant_id=tenant_id, matter_id=matter_id, extra_work_id=extra_work_id,
            source_assertion_id=source_id, target_assertion_id=target_id,
            relation_type=AssertionRelationType(judged.change_type),
            requirement_id=requirement_id, rationale=judged.rationale,
        )
        superseded.add(target_id)
    return superseded, unordered, classifications


def _classify_result(*, supporting, contrary, conditional, uncertain, matching_searches, analysis_complete, semantic_explanation):
    """Keep evidence, coverage, and review state derived in one place."""
    if contrary:
        return (
            AssessmentStatus.disputed,
            EvidenceOutcome.disputed,
            RequirementReviewStatus.required,
            EvidenceStatus.reconstructable,
            semantic_explanation or "Contrary evidence was identified; the requirement cannot be treated as satisfied.",
        )
    if not analysis_complete:
        return (
            AssessmentStatus.insufficient_information,
            EvidenceOutcome.unknown,
            RequirementReviewStatus.required,
            EvidenceStatus.partial,
            semantic_explanation or "Semantic analysis did not classify every relevant evidence item; absence of support is not a finding.",
        )
    if supporting:
        return (
            AssessmentStatus.satisfied,
            EvidenceOutcome.supported,
            RequirementReviewStatus.not_required,
            EvidenceStatus.reconstructable,
            semantic_explanation or "Supporting evidence was identified for this requirement.",
        )
    if conditional:
        return (
            AssessmentStatus.lawyer_review_required,
            EvidenceOutcome.insufficient_information,
            RequirementReviewStatus.required,
            EvidenceStatus.partial,
            "Evidence is affirmative but conditional; the condition is not shown as satisfied.",
        )
    if uncertain:
        return (
            AssessmentStatus.insufficient_information,
            EvidenceOutcome.insufficient_information,
            RequirementReviewStatus.required,
            EvidenceStatus.partial,
            "Relevant evidence exists but its bearing on this requirement could not be determined.",
        )
    return (
        AssessmentStatus.insufficient_information,
        EvidenceOutcome.insufficient_information,
        RequirementReviewStatus.required,
        EvidenceStatus.existence_only if matching_searches else EvidenceStatus.not_found,
        "No supporting evidence was found in the available or recorded search scope.",
    )


def _uncertainty_reasons(
    *, requirement, supporting, contrary, conditional, uncertain, superseded,
    unordered_changes, matching_searches, semantic, analysis_complete,
    all_assertions, extra_work_id,
) -> list[UncertaintyReason]:
    """All applicable reasons, most decision-relevant first."""
    reasons: list[UncertaintyReason] = []
    if not analysis_complete:
        reasons.append(UncertaintyReason.analysis_incomplete)
    if contrary:
        reasons.append(UncertaintyReason.conflicting_evidence)
    elif not supporting:
        if conditional:
            reasons.append(UncertaintyReason.condition_unmet)
        elif uncertain:
            reasons.append(UncertaintyReason.semantic_uncertain)
        elif analysis_complete:
            if matching_searches:
                reasons.append(UncertaintyReason.search_no_match)
            elif requirement.id in APPROVAL_REQUIREMENTS:
                reasons.append(UncertaintyReason.no_explicit_approval_found)
            else:
                reasons.append(UncertaintyReason.partial_evidence_set)
    else:
        if requirement.id == "cost_impact_communicated" and _communication_after_work(all_assertions):
            reasons.append(UncertaintyReason.cost_communication_after_work_start)
        if requirement.id in APPROVAL_REQUIREMENTS and _after_work_start(supporting, all_assertions):
            reasons.append(UncertaintyReason.approval_after_work_start)
        if requirement.id in TEMPORAL_REQUIREMENTS and _work_dates(all_assertions) and not any(_assertion_date(a) for a in supporting):
            reasons.append(UncertaintyReason.temporal_order_uncertain)
        if extra_work_id and not any(assertion_scope(a) for a in supporting):
            reasons.append(UncertaintyReason.scope_unverified)
    if superseded:
        reasons.append(UncertaintyReason.later_modification)
    if unordered_changes:
        reasons.append(UncertaintyReason.temporal_order_uncertain)
    if supporting and semantic is None and requirement.evaluation.value in AI_METHODS:
        reasons.append(UncertaintyReason.heuristic_only)
    return list(dict.fromkeys(reasons))


def _work_dates(assertions) -> list[date]:
    dates = [
        _assertion_date(item) for item in assertions
        if any(term in item.assertion_type for term in ("work_performed", "installation", "daily_report", "construction_started"))
    ]
    return [value for value in dates if value]


def _after_work_start(evidence, all_assertions) -> bool:
    """True only when every dated item post-dates the earliest work start."""
    work_dates = _work_dates(all_assertions)
    evidence_dates = [value for value in (_assertion_date(a) for a in evidence) if value]
    return bool(work_dates and evidence_dates and min(evidence_dates) > min(work_dates))


def _communication_after_work(assertions) -> bool:
    communications = [
        item for item in assertions
        if any(term in item.assertion_type for term in ("cost", "price", "invoice", "estimate"))
    ]
    return _after_work_start(communications, assertions)


def _assertion_date(assertion):
    value = _semantic_time_value(assertion)
    if not value and isinstance(assertion.value, dict):
        value = assertion.value.get("event_at") or assertion.value.get("communication_at")
    if not value:
        return None
    return parse_event_date(value, reference_at=assertion.uploaded_at)


def _as_date(value) -> date | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except (TypeError, ValueError):
        try:
            return date.fromisoformat(str(value))
        except (TypeError, ValueError):
            return None


def _semantic_time_value(assertion: EvidenceAssertion) -> str | None:
    if assertion.assertion_type == "work_planned":
        return assertion.work_planned_at
    if assertion.assertion_type == "work_performed":
        return assertion.work_start_at
    if assertion.assertion_type == "work_completed":
        return assertion.work_completed_at
    if assertion.assertion_type in {"cost_communication", "pricing_unresolved", "written_notice", "estimate_amount"}:
        return assertion.price_communicated_at or assertion.communication_at
    if assertion.assertion_type in {"price_approval", "approved_amount", "signed_change_order", "express_authorization"}:
        return assertion.price_approved_at or assertion.approval_at
    return assertion.event_at


_PRICE_TEXT = re.compile(r"\$\s?\d|\b(lump sum|unit price|unit rate|time and materials|t&m|cost[- ]plus)\b", re.IGNORECASE)


def _states_price(assertion: EvidenceAssertion) -> bool:
    """True when the assertion itself carries an amount or pricing method."""
    value = assertion.value if isinstance(assertion.value, dict) else {}
    for key in ("amount", "approved_amount", "value"):
        candidate = value.get(key)
        if isinstance(candidate, (int, float)) and not isinstance(candidate, bool):
            return True
    return bool(_PRICE_TEXT.search(assertion.statement))


def _is_supporting_type(assertion: EvidenceAssertion, requirement) -> bool:
    """Type gate. Price-bearing types (e.g. a signed CO) qualify only when the
    assertion states a price; a bare signature line proves approval, not price.
    """
    if assertion.assertion_type in requirement.supporting_assertion_types:
        return True
    return assertion.assertion_type in requirement.price_bearing_assertion_types and _states_price(assertion)


def _supports(assertion: EvidenceAssertion, requirement) -> bool:
    if assertion.evidence_role != EvidenceRole.project_fact:
        return False
    if assertion.relationship_status == "UNRESOLVED_SCOPE":
        return False
    if _is_supporting_type(assertion, requirement):
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
        # "We need to finalize the change form" is a plan, not a document.
        "formal_change_document", "pricing_method",
    } and value.get("temporal_status") in {"planned", "denied", "conditional"}:
        return False
    return True


def _is_conditional(assertion: EvidenceAssertion) -> bool:
    if _is_negative_or_denial(assertion):
        return False
    value = assertion.value if isinstance(assertion.value, dict) else {}
    return value.get("temporal_status") == "conditional" or is_conditional_statement(assertion.statement)


def _is_negative_or_denial(assertion: EvidenceAssertion) -> bool:
    value = assertion.value if isinstance(assertion.value, dict) else {}
    return (
        value.get("polarity") == "negative"
        or value.get("temporal_status") == "denied"
        or is_explicit_denial(assertion.statement)
        or assertion.assertion_type in {"approval_denied", "authorization_denial", "notice_denied"}
    )


__all__ = ["evaluate_requirements"]
