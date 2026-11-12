from datetime import datetime

from app.analysis.issue_discovery import discover_issues
from app.analysis.reconciliation import reconcile_issue
from app.domain_contracts.schemas import EvidenceAssertion, Obligation, Provenance
from app.domain_contracts.schemas import AssessmentStatus, EvidenceStatus, IssueType
from app.repositories.memory import store


def _provenance() -> Provenance:
    return Provenance(
        tenant_id="TENANT-1",
        matter_id="MATTER-1",
        analysis_run_id="RUN-1",
        pipeline_version="0.1.0",
    )


def _obligation() -> Obligation:
    return Obligation(
        tenant_id="TENANT-1",
        matter_id="MATTER-1",
        clause_id="CLAUSE-1",
        obligation_type="notice_of_extra_compensation",
        trigger_event="delay_occurrence",
        deadline_value=10,
        deadline_unit="calendar_days",
        required_form="written",
        recipient="owner",
        source_span_id="SPAN-1",
        provenance=_provenance(),
    )


def test_notice_discovery_and_timely_reconciliation() -> None:
    store.issues.clear()
    store.assessments.clear()
    store.provenance.clear()
    obligation = _obligation()
    assertion = EvidenceAssertion(
        tenant_id="TENANT-1",
        matter_id="MATTER-1",
        source_document_id="DOC-1",
        assertion_type="written_notice",
        statement="Written notice of the delay was sent.",
        value={"event_at": "2025-01-01", "notice_at": "2025-01-08"},
        asserted_at=datetime(2025, 1, 8),
        provenance=_provenance(),
    )

    issues = discover_issues(
        tenant_id="TENANT-1",
        matter_id="MATTER-1",
        obligations=[obligation],
        assertions=[assertion],
    )
    assessment = reconcile_issue(
        issue=issues[0],
        obligations=[obligation],
        assertions=[assertion],
        analysis_run_id="RUN-1",
    )

    assert issues[0].type == IssueType.notice
    assert assessment.status == AssessmentStatus.satisfied
    assert assessment.evidence_status == EvidenceStatus.reconstructable
    assert assessment.provenance.source_document_ids == ["DOC-1"]


def test_missing_notice_evidence_is_not_treated_as_proof_of_noncompliance() -> None:
    store.issues.clear()
    store.assessments.clear()
    store.provenance.clear()
    issue = discover_issues(
        tenant_id="TENANT-1",
        matter_id="MATTER-1",
        obligations=[_obligation()],
        assertions=[EvidenceAssertion(
            tenant_id="TENANT-1",
            matter_id="MATTER-1",
            source_document_id="DOC-2",
            assertion_type="delay_event",
            statement="The owner delay occurred.",
            asserted_at=datetime(2025, 1, 1),
            provenance=_provenance(),
        )],
    )[0]

    assessment = reconcile_issue(
        issue=issue,
        obligations=[_obligation()],
        assertions=[],
        analysis_run_id="RUN-2",
    )

    assert assessment.status == AssessmentStatus.insufficient_information
    assert assessment.evidence_status == EvidenceStatus.not_found
    assert "does not establish" in assessment.conclusion
