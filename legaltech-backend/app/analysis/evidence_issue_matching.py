"""Conservative matching from newly extracted evidence to existing issues."""

from collections.abc import Iterable

from app.analysis.evidence_relationships import assertion_event_scope, assertion_scope
from app.domain_contracts.schemas import DependencyEdge, EvidenceAssertion, Issue
from app.repositories.memory import store


def match_new_evidence(assertion_ids: Iterable[str]) -> set[str]:
    """Attach unlinked assertions to an existing issue when the match is unique.

    EW identifiers are authoritative. If an assertion has no EW identifier,
    its resolved change-event ID is used as a stable fallback. Ambiguous
    matches are deliberately left for human review instead of being guessed.
    """
    matched_issue_ids: set[str] = set()
    for assertion_id in assertion_ids:
        assertion = store.assertions.get(assertion_id)
        if not assertion:
            continue
        candidates = _candidates(assertion)
        if len(candidates) != 1:
            continue
        issue = candidates[0]
        if assertion.id not in issue.evidence_ids:
            issue.evidence_ids.append(assertion.id)
        _record_evidence_dependency(issue, assertion)
        matched_issue_ids.add(issue.id)
    return matched_issue_ids


def _candidates(assertion: EvidenceAssertion) -> list[Issue]:
    ew_id = assertion_scope(assertion)
    event_id = assertion_event_scope(assertion)
    candidates = [
        issue for issue in store.issues.values()
        if issue.tenant_id == assertion.tenant_id
        and issue.matter_id == assertion.matter_id
        and _issue_matches(issue, ew_id, event_id)
    ]
    if candidates:
        return candidates
    # A unique unresolved issue in the same matter is a safe fallback for
    # sources whose parser could not recover a project/event identifier.
    return [
        issue for issue in store.issues.values()
        if issue.tenant_id == assertion.tenant_id
        and issue.matter_id == assertion.matter_id
        and issue.current_assessment_id is not None
        and issue.extra_work_id is None
        and not issue.evidence_ids
    ]


def _issue_matches(issue: Issue, ew_id: str | None, event_id: str | None) -> bool:
    if ew_id:
        return issue.extra_work_id == ew_id or issue.issue_scope == ew_id
    return bool(event_id and issue.issue_scope == event_id)


def _record_evidence_dependency(issue: Issue, assertion: EvidenceAssertion) -> None:
    exists = any(
        edge.upstream_type == "evidence_assertion"
        and edge.upstream_id == assertion.id
        and edge.downstream_type == "issue"
        and edge.downstream_id == issue.id
        for edge in store.dependency_edges.values()
    )
    if exists:
        return
    edge = DependencyEdge(
        tenant_id=issue.tenant_id,
        matter_id=issue.matter_id,
        upstream_type="evidence_assertion",
        upstream_id=assertion.id,
        downstream_type="issue",
        downstream_id=issue.id,
        relation_type="evidence_issue",
    )
    store.dependency_edges[edge.id] = edge
