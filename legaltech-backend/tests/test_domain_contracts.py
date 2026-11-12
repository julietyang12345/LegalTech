import pytest

from app.domain_contracts import InvalidTransition, Issue, IssueType, WorkflowStatus, transition
from app.domain_contracts.recording import record_search_attempt
from app.repositories.memory import store


def test_issue_has_independent_workflow_and_evidence_dimensions() -> None:
    issue = Issue(
        tenant_id="TENANT-1",
        matter_id="MATTER-1",
        type=IssueType.notice,
        title="Potential late notice",
        summary="Review notice timing",
    )

    assert issue.workflow_status == WorkflowStatus.discovered
    assert issue.evidence_status.value == "NOT_FOUND"
    assert transition(issue.workflow_status, WorkflowStatus.analyzing) == WorkflowStatus.analyzing


def test_invalid_issue_transition_is_rejected() -> None:
    with pytest.raises(InvalidTransition):
        transition(WorkflowStatus.discovered, WorkflowStatus.reviewed)


def test_search_attempt_records_scope_and_coverage() -> None:
    store.search_attempts.clear()
    attempt = record_search_attempt(
        tenant_id="TENANT-1",
        matter_id="MATTER-1",
        query="written notice",
        corpus_version="matter-documents-v1",
        retrieval_strategy="full_text+semantic",
        analysis_run_id="RUN-1",
        scope={"document_types": ["email", "change_order"]},
        filters={"date_from": "2025-01-01"},
        result_document_ids=["DOC-1", "DOC-2"],
    )

    assert attempt.result_count == 2
    assert attempt.scope["document_types"] == ["email", "change_order"]
    assert store.search_attempts[attempt.id] is attempt
