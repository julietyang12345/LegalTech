from collections.abc import Iterable

from app.domain_contracts.recording import record_search_attempt
from app.domain_contracts.schemas import EvidenceAssertion, ExecutableRuleSpec, Issue, SearchAttempt


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
    assertion_scope = None
    if isinstance(assertion.value, dict):
        assertion_scope = assertion.value.get("extra_work_id") or assertion.value.get("event_id") or assertion.value.get("change_event_id")
    if issue.extra_work_id and assertion_scope:
        return str(assertion_scope) == issue.extra_work_id
    if issue.issue_scope and not assertion_scope:
        return assertion.source_document_id == issue.issue_scope
    return True


def _matches_requirement(assertion: EvidenceAssertion, queries: list[str]) -> bool:
    haystack = f"{assertion.assertion_type} {assertion.statement}".lower()
    return any(query.lower() in haystack for query in queries)
