from app.domain_contracts.schemas import Assessment, DependencyEdge, ExecutableRuleSpec, Issue
from app.repositories.memory import store


def record_issue_dependencies(issue: Issue, assessment: Assessment, rule: ExecutableRuleSpec | None = None) -> list[DependencyEdge]:
    edges = [
        _edge(issue, "issue", issue.id, "assessment", assessment.id, "issue_assessment"),
    ]
    for obligation_id in issue.obligation_ids:
        edges.append(_edge(issue, "obligation", obligation_id, "issue", issue.id, "obligation_issue"))
    for evidence_id in issue.evidence_ids:
        edges.append(_edge(issue, "evidence_assertion", evidence_id, "issue", issue.id, "evidence_issue"))
    if rule:
        edges.append(_edge(issue, "executable_rule", f"{rule.id}:{rule.version}", "issue", issue.id, "rule_issue"))
    evidence = set(issue.evidence_ids)
    existing = {
        (edge.upstream_id, edge.downstream_id, edge.relation_type)
        for edge in store.dependency_edges.values()
        if edge.upstream_type == "evidence_assertion" and edge.downstream_type == "evidence_assertion"
    }
    for link in store.assertion_links.values():
        if link.tenant_id != issue.tenant_id or link.matter_id != issue.matter_id:
            continue
        if link.source_assertion_id not in evidence and link.target_assertion_id not in evidence:
            continue
        # Changing the earlier assertion can change how the later one reads, and
        # vice versa; record the edge so either correction finds this issue.
        key = (link.target_assertion_id, link.source_assertion_id, link.relation_type.value)
        if key not in existing:
            edges.append(_edge(issue, "evidence_assertion", link.target_assertion_id, "evidence_assertion", link.source_assertion_id, link.relation_type.value))
            existing.add(key)
    for edge in edges:
        store.dependency_edges[edge.id] = edge
    return edges


def determine_assertion_affected_issues(assertion_ids: set[str]) -> set[str]:
    """Return issues downstream of newly added or corrected assertions.

    Follows assertion-to-assertion change edges in both directions, so
    correcting an approval also reaches issues that rely on its modification.
    """
    related = set(assertion_ids)
    frontier = set(assertion_ids)
    assertion_edges = [
        edge for edge in store.dependency_edges.values()
        if edge.upstream_type == "evidence_assertion" and edge.downstream_type == "evidence_assertion"
    ]
    while frontier:
        reached = {
            other
            for edge in assertion_edges
            for current, other in ((edge.upstream_id, edge.downstream_id), (edge.downstream_id, edge.upstream_id))
            if current in frontier
        } - related
        related |= reached
        frontier = reached
    return {
        edge.downstream_id
        for edge in store.dependency_edges.values()
        if edge.upstream_type == "evidence_assertion"
        and edge.upstream_id in related
        and edge.downstream_type == "issue"
    }


def _edge(issue: Issue, upstream_type: str, upstream_id: str, downstream_type: str, downstream_id: str, relation_type: str) -> DependencyEdge:
    return DependencyEdge(
        tenant_id=issue.tenant_id,
        matter_id=issue.matter_id,
        upstream_type=upstream_type,
        upstream_id=upstream_id,
        downstream_type=downstream_type,
        downstream_id=downstream_id,
        relation_type=relation_type,
    )
