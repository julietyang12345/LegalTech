from collections.abc import Iterable

from app.domain_contracts.recording import record_search_attempt
from app.domain_contracts.schemas import EvidenceAssertion, EvidenceRole, ExecutableRuleSpec, Issue, SearchAttempt
from app.analysis.evidence_relationships import assertion_event_scope, assertion_scope


def retrieve_requirement_evidence(
    *, issue: Issue, rule: ExecutableRuleSpec, assertions: Iterable[EvidenceAssertion],
    analysis_run_id: str, corpus_version: str = "memory-assertions-v1",
) -> tuple[list[EvidenceAssertion], list[SearchAttempt]]:
    """Run bounded, requirement-specific retrieval within one issue scope.

    This is the deterministic retrieval adapter used by the first vertical
    slice. A vector/full-text adapter can replace the matcher without changing
    RequirementCheck contracts.
    """
    scoped = [assertion for assertion in assertions if _in_issue_scope(issue, assertion)]
    found: dict[str, EvidenceAssertion] = {}
    attempts: list[SearchAttempt] = []
    for requirement in rule.requirements:
        matches = [
            assertion for assertion in scoped
            if _matches_requirement(assertion, requirement.evidence_queries)
        ]
        for assertion in matches:
            found[assertion.id] = assertion
        attempts.append(record_search_attempt(
            tenant_id=issue.tenant_id,
            matter_id=issue.matter_id,
            issue_id=issue.id,
            query=" OR ".join(requirement.evidence_queries) or requirement.label,
            scope={"issue_scope": issue.issue_scope, "extra_work_id": issue.extra_work_id},
            filters={"requirement_id": requirement.id, "tenant_id": issue.tenant_id, "matter_id": issue.matter_id},
            corpus_version=corpus_version,
            retrieval_strategy="scoped_full_text_candidate",
            analysis_run_id=analysis_run_id,
            result_document_ids=sorted({assertion.source_document_id for assertion in matches}),
        ))
    return list(found.values()), attempts


def _in_issue_scope(issue: Issue, assertion: EvidenceAssertion) -> bool:
    if assertion.tenant_id != issue.tenant_id or assertion.matter_id != issue.matter_id:
        return False
    scope = assertion_scope(assertion)
    if issue.extra_work_id:
        # An EW-scoped issue must not silently absorb unscoped contract text or
        # evidence from another EW. Normative text is retained separately as
        # context, never as a project fact for this issue.
        return scope == issue.extra_work_id
    if issue.issue_scope:
        return (
            assertion_event_scope(assertion) == issue.issue_scope
            or assertion.source_document_id == issue.issue_scope
        ) and assertion.evidence_role == EvidenceRole.project_fact
    return assertion.evidence_role == EvidenceRole.project_fact


def _matches_requirement(assertion: EvidenceAssertion, queries: list[str]) -> bool:
    haystack = f"{assertion.assertion_type} {assertion.statement}".lower()
    return any(query.lower() in haystack for query in queries)
