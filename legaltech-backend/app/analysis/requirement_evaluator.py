from collections.abc import Iterable

from app.domain_contracts.recording import record_provenance
from app.domain_contracts.schemas import (
    AssessmentStatus,
    EvidenceAssertion,
    EvidenceStatus,
    ExecutableRuleSpec,
    Provenance,
    RequirementCheck,
    SearchAttempt,
)
from app.analysis.semantic_evaluator import judge_requirement
from app.analysis.text_semantics import is_negative_statement


def evaluate_requirements(
    *, rule: ExecutableRuleSpec, assertions: Iterable[EvidenceAssertion],
    search_attempts: Iterable[SearchAttempt], tenant_id: str, matter_id: str,
    analysis_run_id: str, pipeline_version: str = "0.1.0",
) -> list[RequirementCheck]:
    assertions = list(assertions)
    search_attempts = list(search_attempts)
    if any(a.tenant_id != tenant_id or a.matter_id != matter_id for a in assertions):
        raise ValueError("requirement evaluation cannot mix tenant or matter evidence")
    checks: list[RequirementCheck] = []
    for requirement in rule.requirements:
        supporting = [a for a in assertions if _supports(a, requirement)]
        contrary = [a for a in assertions if _contradicts(a, requirement)]
        semantic = judge_requirement(requirement, assertions) if requirement.evaluation.value in {
            "AI_SEMANTIC", "AI_AND_LAWYER_REVIEW"
        } else None
        if semantic:
            supporting = [a for a in assertions if a.id in semantic.supporting_ids]
            contrary = [a for a in assertions if a.id in semantic.contrary_ids]
        matching_searches = [
            search for search in search_attempts
            if search.tenant_id == tenant_id and search.matter_id == matter_id
            and (search.issue_id is None or any(query.lower() in search.query.lower() for query in requirement.evidence_queries))
        ]
        if contrary:
            result = AssessmentStatus.disputed
            evidence_status = EvidenceStatus.reconstructable
            explanation = semantic.explanation if semantic else "Contrary evidence was identified; the requirement cannot be treated as satisfied."
        elif not supporting:
            result = AssessmentStatus.insufficient_information
            evidence_status = EvidenceStatus.existence_only if matching_searches else EvidenceStatus.not_found
            explanation = "No supporting evidence was found in the available or recorded search scope."
        elif requirement.lawyer_review_required or requirement.evaluation.value in {"AI_SEMANTIC", "AI_AND_LAWYER_REVIEW"}:
            result = AssessmentStatus.lawyer_review_required
            evidence_status = EvidenceStatus.reconstructable
            explanation = semantic.explanation if semantic else "Candidate evidence was found, but semantic sufficiency requires lawyer review."
        else:
            result = AssessmentStatus.satisfied
            evidence_status = EvidenceStatus.reconstructable
            explanation = "Supporting evidence was identified for this requirement."

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
        checks.append(RequirementCheck(
            requirement_id=requirement.id,
            result=result,
            evidence_status=evidence_status,
            supporting_evidence_ids=[a.id for a in supporting],
            contrary_evidence_ids=[a.id for a in contrary],
            search_attempt_ids=[s.id for s in matching_searches],
            explanation=explanation,
            requires_lawyer_review=requirement.lawyer_review_required or result in {
                AssessmentStatus.disputed, AssessmentStatus.lawyer_review_required,
            },
            provenance=provenance,
        ))
    return checks


def _supports(assertion: EvidenceAssertion, requirement) -> bool:
    if assertion.assertion_type in requirement.supporting_assertion_types:
        return not is_negative_statement(assertion.statement)
    haystack = f"{assertion.assertion_type} {assertion.statement}".lower()
    return any(query.lower() in haystack for query in requirement.evidence_queries) and not is_negative_statement(assertion.statement)


def _contradicts(assertion: EvidenceAssertion, requirement) -> bool:
    if assertion.assertion_type in requirement.contrary_assertion_types:
        return True
    return is_negative_statement(assertion.statement) and (
        assertion.assertion_type in requirement.supporting_assertion_types
        or any(query.lower() in assertion.statement.lower() for query in requirement.evidence_queries)
    )


__all__ = ["evaluate_requirements"]
