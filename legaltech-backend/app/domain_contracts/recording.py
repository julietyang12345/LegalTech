"""Explicit persistence adapters for provenance and search coverage."""

from typing import Any

from app.domain_contracts.schemas import AssertionLink, AssertionRelationType, EvidenceLink, EvidenceRelationType, Issue, Provenance, SearchAttempt, WorkflowStatus
from app.domain_contracts.state_machine import transition
from app.repositories.memory import store


def record_provenance(provenance: Provenance) -> Provenance:
    store.provenance[provenance.id] = provenance
    return provenance


def record_search_attempt(
    *, tenant_id: str, matter_id: str, query: str, corpus_version: str,
    retrieval_strategy: str, analysis_run_id: str, issue_id: str | None = None,
    scope: dict[str, Any] | None = None, filters: dict[str, Any] | None = None,
    result_document_ids: list[str] | None = None,
    eligible_document_ids: list[str] | None = None,
    searched_document_ids: list[str] | None = None,
    candidate_assertion_ids: list[str] | None = None,
    unresolved_scope_assertion_ids: list[str] | None = None,
    coverage_status: str = "UNKNOWN",
    semantic_candidate_ids: list[str] | None = None,
    semantic_status: str = "NOT_RUN",
) -> SearchAttempt:
    result_ids = result_document_ids or []
    attempt = SearchAttempt(
        tenant_id=tenant_id, matter_id=matter_id, issue_id=issue_id, query=query,
        scope=scope or {}, filters=filters or {}, corpus_version=corpus_version,
        retrieval_strategy=retrieval_strategy, result_document_ids=result_ids,
        result_count=len(result_ids), analysis_run_id=analysis_run_id,
        eligible_document_ids=eligible_document_ids or [],
        searched_document_ids=searched_document_ids or [],
        candidate_assertion_ids=candidate_assertion_ids or [],
        unresolved_scope_assertion_ids=unresolved_scope_assertion_ids or [],
        coverage_status=coverage_status,
        semantic_candidate_ids=semantic_candidate_ids or [],
        semantic_status=semantic_status,
    )
    store.search_attempts[attempt.id] = attempt
    return attempt


def record_evidence_link(
    *, tenant_id: str, matter_id: str, requirement_check_id: str,
    assertion_id: str, relation_type: EvidenceRelationType,
    extra_work_id: str | None = None, method: str = "DETERMINISTIC",
    rationale: str | None = None, condition: str | None = None,
) -> EvidenceLink:
    """Persist an explicit assertion-to-requirement relationship."""
    existing = next(
        (
            link for link in store.evidence_links.values()
            if link.requirement_check_id == requirement_check_id
            and link.assertion_id == assertion_id
            and link.relation_type == relation_type
        ),
        None,
    )
    if existing:
        return existing
    link = EvidenceLink(
        tenant_id=tenant_id,
        matter_id=matter_id,
        extra_work_id=extra_work_id,
        requirement_check_id=requirement_check_id,
        assertion_id=assertion_id,
        relation_type=relation_type,
        method=method,
        rationale=rationale,
        condition=condition,
    )
    store.evidence_links[link.id] = link
    return link


def record_assertion_link(
    *, tenant_id: str, matter_id: str, source_assertion_id: str,
    target_assertion_id: str, relation_type: AssertionRelationType,
    extra_work_id: str | None = None, requirement_id: str | None = None,
    method: str = "AI_SEMANTIC", rationale: str | None = None,
) -> AssertionLink:
    """Persist a validated later-assertion -> earlier-assertion edge."""
    existing = next(
        (
            link for link in store.assertion_links.values()
            if link.source_assertion_id == source_assertion_id
            and link.target_assertion_id == target_assertion_id
            and link.relation_type == relation_type
        ),
        None,
    )
    if existing:
        return existing
    link = AssertionLink(
        tenant_id=tenant_id, matter_id=matter_id, extra_work_id=extra_work_id,
        source_assertion_id=source_assertion_id, target_assertion_id=target_assertion_id,
        relation_type=relation_type, requirement_id=requirement_id,
        method=method, rationale=rationale,
    )
    store.assertion_links[link.id] = link
    return link


def transition_issue(issue_id: str, target: WorkflowStatus) -> Issue:
    issue = store.issues[issue_id]
    issue.workflow_status = transition(issue.workflow_status, target)
    return issue
