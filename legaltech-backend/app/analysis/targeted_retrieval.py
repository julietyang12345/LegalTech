"""Hybrid, auditable requirement retrieval."""

from collections.abc import Iterable
import json
import logging

from app.analysis.evidence_relationships import assertion_event_scope, assertion_scope
from app.analysis.evidence_matching import matches_queries
from app.analysis.semantic_evaluator import bounded_excerpts
from app.core.config import get_settings
from app.domain_contracts.recording import record_search_attempt
from app.domain_contracts.schemas import EvidenceAssertion, EvidenceRole, ExecutableRuleSpec, Issue, SearchAttempt

logger = logging.getLogger(__name__)


def retrieve_requirement_evidence(
    *, issue: Issue, rule: ExecutableRuleSpec, assertions: Iterable[EvidenceAssertion],
    analysis_run_id: str, corpus_version: str = "memory-assertions-v2",
) -> tuple[list[EvidenceAssertion], list[SearchAttempt]]:
    """Retrieve direct, thread-context, and optional semantic candidates."""
    corpus = [
        assertion for assertion in assertions
        if assertion.tenant_id == issue.tenant_id
        and assertion.matter_id == issue.matter_id
        and assertion.evidence_role == EvidenceRole.project_fact
    ]
    eligible_document_ids = sorted({assertion.source_document_id for assertion in corpus})
    found: dict[str, EvidenceAssertion] = {}
    attempts: list[SearchAttempt] = []
    for requirement in rule.requirements:
        direct = [
            assertion for assertion in corpus
            if _directly_in_issue_scope(issue, assertion)
            and _direct_match(assertion, requirement)
        ]
        anchors = [assertion for assertion in corpus if _directly_in_issue_scope(issue, assertion)]
        thread_ids = {_conversation_id(assertion) for assertion in anchors if _conversation_id(assertion)}
        thread_candidates = [
            assertion for assertion in corpus
            if _conversation_id(assertion) in thread_ids and _thread_scope_candidate(issue, assertion)
        ]
        for assertion in thread_candidates:
            if assertion.id not in {item.id for item in anchors} and not assertion_scope(assertion):
                _infer_thread_scope(assertion, issue.extra_work_id)

        # Keep all same-Matter, non-conflicting-EW assertions available to the
        # semantic selector. This is what allows a reply such as "that number
        # works for us" to be found even when it has no pricing keyword.
        semantic_pool = [assertion for assertion in corpus if _thread_scope_candidate(issue, assertion)]
        semantic_ids, semantic_status = _semantic_select(requirement.label, requirement.evidence_queries, semantic_pool)
        semantic_selected = [item for item in semantic_pool if item.id in semantic_ids]
        structural_ids = {item.id for item in direct + thread_candidates}
        for assertion in semantic_selected:
            if not assertion_scope(assertion) and assertion.id not in {item.id for item in thread_candidates}:
                assertion.relationship_status = "UNRESOLVED_SCOPE"
                assertion.relationship_reason = "Semantic retrieval found a possible candidate without a trusted thread scope"
                assertion.scope_confidence = "LOW"
                assertion.scope_candidates = [issue.extra_work_id] if issue.extra_work_id else []
        selected = direct + thread_candidates + semantic_selected
        for assertion in selected:
            found[assertion.id] = assertion

        unresolved = [item for item in selected if item.relationship_status == "UNRESOLVED_SCOPE"]
        searched_document_ids = sorted({item.source_document_id for item in semantic_pool})
        candidate_ids = sorted({item.id for item in selected})
        attempts.append(record_search_attempt(
            tenant_id=issue.tenant_id, matter_id=issue.matter_id, issue_id=issue.id,
            query=" OR ".join(requirement.evidence_queries) or requirement.label,
            scope={"issue_scope": issue.issue_scope, "extra_work_id": issue.extra_work_id},
            filters={"requirement_id": requirement.id, "tenant_id": issue.tenant_id, "matter_id": issue.matter_id},
            corpus_version=corpus_version,
            retrieval_strategy="structured+thread+semantic" if semantic_ids else "structured+thread",
            result_document_ids=sorted({item.source_document_id for item in selected}),
            eligible_document_ids=eligible_document_ids,
            searched_document_ids=searched_document_ids,
            candidate_assertion_ids=candidate_ids,
            unresolved_scope_assertion_ids=sorted(item.id for item in unresolved),
            # A failed or truncated semantic pass did not search the corpus it
            # claims to; report that instead of SEARCHED_CORPUS.
            coverage_status="PARTIAL" if unresolved or semantic_status in {"FAILED", "PARTIAL"} else "SEARCHED_CORPUS",
            semantic_candidate_ids=sorted(item.id for item in semantic_selected if item.id not in structural_ids),
            semantic_status=semantic_status,
            analysis_run_id=analysis_run_id,
        ))
    return list(found.values()), attempts


def _directly_in_issue_scope(issue: Issue, assertion: EvidenceAssertion) -> bool:
    scope = assertion_scope(assertion)
    if issue.extra_work_id:
        return scope == issue.extra_work_id
    if issue.issue_scope:
        return assertion_event_scope(assertion) == issue.issue_scope or assertion.source_document_id == issue.issue_scope
    return True


def _direct_match(assertion: EvidenceAssertion, requirement) -> bool:
    """Keep deterministic type matches even when wording differs."""
    relevant_types = (
        set(requirement.supporting_assertion_types)
        | set(requirement.contrary_assertion_types)
        | set(requirement.price_bearing_assertion_types)
    )
    return assertion.assertion_type in relevant_types or matches_queries(assertion, requirement.evidence_queries)


def _thread_scope_candidate(issue: Issue, assertion: EvidenceAssertion) -> bool:
    scope = assertion_scope(assertion)
    return not issue.extra_work_id or scope in {None, issue.extra_work_id}


def _conversation_id(assertion: EvidenceAssertion) -> str | None:
    if assertion.conversation_id:
        return assertion.conversation_id
    value = assertion.value if isinstance(assertion.value, dict) else {}
    return value.get("conversation_id") or value.get("thread_id")


def _infer_thread_scope(assertion: EvidenceAssertion, extra_work_id: str | None) -> None:
    if not extra_work_id:
        return
    assertion.extra_work_id = extra_work_id
    assertion.relationship_status = "INFERRED"
    assertion.relationship_reason = "Same trusted conversation thread as an explicitly scoped assertion"
    assertion.scope_confidence = "MEDIUM"
    if isinstance(assertion.value, dict):
        assertion.value["extra_work_id"] = extra_work_id


def _semantic_select(label: str, queries: list[str], candidates: list[EvidenceAssertion]) -> tuple[set[str], str]:
    """Ask the model for candidate IDs only; never classify legal meaning here.

    Returns (ids, status). Status is NOT_RUN when AI is off, FAILED on any
    provider/parse error, PARTIAL when the input budget omitted candidates.
    """
    settings = get_settings()
    if not settings.ai_extraction_enabled or not settings.openai_api_key or not candidates:
        return set(), "NOT_RUN"
    lines, omitted = bounded_excerpts(candidates, settings.ai_extraction_max_chars)
    try:
        from openai import OpenAI
        response = OpenAI(api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds).chat.completions.create(
            model=settings.openai_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Select every evidence candidate that could bear on the requirement, including indirect wording (favor recall; a later step classifies meaning). Return JSON only: {\"assertion_ids\": [ids]}. Never invent IDs. Selection is retrieval only, not legal classification."},
                {"role": "user", "content": f"Requirement: {label}\nQueries: {queries}\nCandidates:\n" + "\n".join(lines)},
            ],
        )
        payload = json.loads(response.choices[0].message.content or "{}")
        valid = {item.id for item in candidates} - set(omitted)
        ids = payload.get("assertion_ids", [])
        if not isinstance(ids, list):
            return set(), "FAILED"
        return {item for item in ids if item in valid}, "PARTIAL" if omitted else "COMPLETED"
    except Exception as error:
        logger.warning("semantic retrieval unavailable error_type=%s", type(error).__name__)
        return set(), "FAILED"


__all__ = ["retrieve_requirement_evidence"]
