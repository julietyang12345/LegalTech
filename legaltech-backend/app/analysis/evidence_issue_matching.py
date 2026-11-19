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
        if not candidates:
            if assertion_scope(assertion) is None:
                assertion.relationship_status = "AMBIGUOUS"
                assertion.relationship_reason = "No unique Extra Work match was established; human review required"
            continue
        for issue in candidates:
            if not issue.extra_work_id and assertion_scope(assertion):
                issue.extra_work_id = assertion_scope(assertion)
                issue.issue_scope = issue.extra_work_id
            if assertion.id not in issue.evidence_ids:
                issue.evidence_ids.append(assertion.id)
            if assertion.relationship_status == "UNSCOPED":
                assertion.relationship_status = "INFERRED"
                assertion.relationship_reason = "Matched to the only Extra Work scope within the same matter and change event"
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
        if ew_id:
            return candidates
        # An unscoped assertion can update all rules for one event when those
        # issues share the same unambiguous EW identity (including all-null
        # legacy issues). Never fan out across multiple known EWs.
        known_ews = {issue.extra_work_id for issue in candidates if issue.extra_work_id}
        return candidates if len(known_ews) <= 1 else []
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
    if not event_id:
        return False
    if issue.issue_scope == event_id:
        return True
    # Older issues may have a document or event scope recorded differently.
    # Their existing evidence still provides a reliable event relationship.
    linked_event_ids = {
        assertion_event_scope(store.assertions[assertion_id])
        for assertion_id in issue.evidence_ids
        if assertion_id in store.assertions
    }
    return event_id in linked_event_ids


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
