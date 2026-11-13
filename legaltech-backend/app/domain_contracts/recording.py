"""Explicit persistence adapters for provenance and search coverage."""

from typing import Any

from app.domain_contracts.schemas import EvidenceLink, EvidenceRelationType, Issue, Provenance, SearchAttempt, WorkflowStatus
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
) -> SearchAttempt:
    result_ids = result_document_ids or []
    attempt = SearchAttempt(
        tenant_id=tenant_id, matter_id=matter_id, issue_id=issue_id, query=query,
        scope=scope or {}, filters=filters or {}, corpus_version=corpus_version,
        retrieval_strategy=retrieval_strategy, result_document_ids=result_ids,
        result_count=len(result_ids), analysis_run_id=analysis_run_id,
    )
    store.search_attempts[attempt.id] = attempt
    return attempt


def record_evidence_link(
    *, tenant_id: str, matter_id: str, requirement_check_id: str,
    assertion_id: str, relation_type: EvidenceRelationType,
    extra_work_id: str | None = None,
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
    )
    store.evidence_links[link.id] = link
    return link


def transition_issue(issue_id: str, target: WorkflowStatus) -> Issue:
    issue = store.issues[issue_id]
    issue.workflow_status = transition(issue.workflow_status, target)
    return issue
