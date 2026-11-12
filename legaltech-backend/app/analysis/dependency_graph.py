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
    for edge in edges:
        store.dependency_edges[edge.id] = edge
    return edges


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
