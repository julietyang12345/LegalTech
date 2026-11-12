from app.domain_contracts.schemas import CaseRuleCandidate, LegalPrinciple, Provenance, ReviewStatus, RuleApprovalStatus


def extract_case_rule_candidate(
    *, case_document_id: str, title: str, facts: list[str], court_findings: list[str],
    candidate_principle: str, source_span_ids: list[str] | None = None,
    applicability_limits: list[str] | None = None,
    tenant_id: str, matter_id: str,
) -> CaseRuleCandidate:
    """Create a review-gated case-law candidate without publishing a rule."""
    return CaseRuleCandidate(
        tenant_id=tenant_id,
        matter_id=matter_id,
        case_document_id=case_document_id,
        title=title,
        extracted_facts=facts,
        court_findings=court_findings,
        candidate_principle=candidate_principle,
        applicability_limits=applicability_limits or [],
        source_span_ids=source_span_ids or [],
        review_status=ReviewStatus.pending,
        requires_lawyer_review=True,
    )


def candidate_to_principle(candidate: CaseRuleCandidate, *, jurisdiction: str = "REQUIRES_VERIFICATION") -> LegalPrinciple:
    """Materialize a draft principle; publication still requires lawyer approval."""
    provenance = Provenance(
        tenant_id=candidate.tenant_id,
        matter_id=candidate.matter_id,
        source_document_ids=[candidate.case_document_id],
        source_span_ids=candidate.source_span_ids,
        analysis_run_id=f"CASE-RULE-{candidate.id}",
        pipeline_version="case-rule-extraction-0.1",
        method="case_rule_candidate_extraction",
        rationale="Candidate extracted from a case; facts and limits require lawyer review.",
    )
    return LegalPrinciple(
        tenant_id=candidate.tenant_id,
        matter_id=candidate.matter_id,
        title=candidate.title,
        statement=candidate.candidate_principle,
        jurisdiction=jurisdiction,
        source_document_ids=[candidate.case_document_id],
        source_span_ids=candidate.source_span_ids,
        approval_status=RuleApprovalStatus.draft,
        provenance=provenance,
    )
