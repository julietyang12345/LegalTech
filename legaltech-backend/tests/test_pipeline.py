from app.ingestion.upload_ingestor import ingest_upload
from app.jobs.worker import run_once
from app.matching.change_event_matcher import resolve_change_event
from app.models import ChangeEvent, MatchFeedback, Matter, ProcessingJob, Project
from app.models.domain import DocumentType, JobStatus, Severity
from app.domain_contracts.schemas import Obligation, Provenance
from app.parsers.base import ParsedContent
from app.repositories.memory import store


def clear_store() -> None:
    store.matters.clear()
    store.projects.clear()
    store.change_events.clear()
    store.documents.clear()
    store.events.clear()
    store.signals.clear()
    store.node_states.clear()
    store.risk_factors.clear()
    store.risk_tickets.clear()
    store.risk_ticket_history.clear()
    store.jobs.clear()
    store.reviews.clear()
    store.match_feedback.clear()
    store.processed_documents.clear()
    store.obligations.clear()
    store.assertions.clear()
    store.issues.clear()
    store.assessments.clear()
    store.provenance.clear()
    store.search_attempts.clear()
    store.legal_principles.clear()
    store.rule_specs.clear()
    store.rule_activations.clear()
    store.dependency_edges.clear()


def test_pipeline_creates_authorization_risk_ticket() -> None:
    clear_store()
    matter = Matter(name="Demo Matter")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name="East Slope Project", project_number="P-100")
    store.projects[project.id] = project
    change_event = ChangeEvent(project_id=project.id, title="East slope unsuitable soil removal")
    store.change_events[change_event.id] = change_event

    document, job = ingest_upload(
        content=b"P-100 east slope: Please proceed and keep the crew moving.",
        filename="message.txt",
        document_type=DocumentType.email,
        matter_id=matter.id,
        sender="pm@owner.com",
    )

    assert job is not None
    assert document.id in store.documents
    assert run_once() is True
    assert any(ticket.change_event_id == change_event.id for ticket in store.risk_tickets.values())


def test_change_event_matcher_uses_human_feedback_features() -> None:
    clear_store()
    matter = Matter(name="Demo Matter")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name="Panel Project", project_number="P-200")
    store.projects[project.id] = project
    change_event = ChangeEvent(project_id=project.id, title="Curtain system acceleration")
    store.change_events[change_event.id] = change_event
    feedback = MatchFeedback(
        user_id="USER-1",
        document_id="DOC-OLD",
        selected_project_id=project.id,
        selected_change_event_id=change_event.id,
        features={"keyword": "wall panel", "aliases": ["panel resequence"]},
    )
    store.match_feedback[feedback.id] = feedback

    match = resolve_change_event(
        project_id=project.id,
        parsed_content=ParsedContent(
            document_id="DOC-NEW",
            text="Please keep moving on the wall panel work and send pricing backup.",
        ),
    )

    assert match.change_event_id == change_event.id
    assert match.confidence == 0.35
    assert "feedback keyword" in match.reasons
    assert match.status == "needs_review"


def test_signed_change_order_mitigates_missing_signed_change_order_risk() -> None:
    clear_store()
    matter = Matter(name="Demo Matter")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name="East Slope Project", project_number="P-100")
    store.projects[project.id] = project
    change_event = ChangeEvent(project_id=project.id, title="East slope unsuitable soil removal")
    store.change_events[change_event.id] = change_event

    first_document, first_job = ingest_upload(
        content=b"P-100 east slope: Please proceed and keep the crew moving.",
        filename="day-1.txt",
        document_type=DocumentType.email,
        matter_id=matter.id,
        sender="pm@owner.com",
    )

    assert first_job is not None
    assert run_once() is True
    factor_key = f"{change_event.id}:missing_signed_change_order"
    assert store.risk_factors[factor_key].status == "Insufficient Evidence"
    ticket = store.risk_tickets[f"{change_event.id}:authorization_and_pricing"]
    assert ticket.severity == Severity.high
    assert ticket.status == "Detected"

    second_document, second_job = ingest_upload(
        content=b"P-100 east slope: The signed change order is attached for the extra work.",
        filename="day-2.txt",
        document_type=DocumentType.change_order,
        matter_id=matter.id,
        sender="pm@owner.com",
    )

    assert second_job is not None
    assert run_once() is True
    node_state = store.node_states[f"{change_event.id}:authorization_gate:1.0"]
    assert node_state.status == "supported"
    factor = store.risk_factors[factor_key]
    assert factor.status == "Mitigated"
    assert factor.mitigated_by_document_id == second_document.id
    assert factor.mitigated_at is not None
    updated_ticket = store.risk_tickets[f"{change_event.id}:authorization_and_pricing"]
    assert updated_ticket.severity == Severity.medium
    assert updated_ticket.status == "Under Review"
    assert any(history.risk_ticket_id == updated_ticket.id for history in store.risk_ticket_history.values())


def test_invoice_recomputes_invoice_pricing_quantum_and_consistency_nodes_only() -> None:
    clear_store()
    matter = Matter(name="Demo Matter")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name="East Slope Project", project_number="P-100")
    store.projects[project.id] = project
    change_event = ChangeEvent(project_id=project.id, title="East slope unsuitable soil removal")
    store.change_events[change_event.id] = change_event

    document, job = ingest_upload(
        content=b"P-100 east slope invoice amount due $48,500 for unsuitable soil removal.",
        filename="invoice.txt",
        document_type=DocumentType.invoice,
        matter_id=matter.id,
        sender="billing@contractor.com",
    )

    assert job is not None
    assert run_once() is True
    assert document.id in store.documents
    node_ids = {state.node_id for state in store.node_states.values()}
    assert "authorization_gate" not in node_ids
    assert {
        "pricing_gate",
        "invoice_support_gate",
        "quantum_gate",
        "document_consistency_gate",
    }.issubset(node_ids)


def test_risk_ticket_evolves_with_authority_support_and_later_limitation() -> None:
    clear_store()
    matter = Matter(name="Demo Matter")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name="East Slope Project", project_number="P-100")
    store.projects[project.id] = project
    change_event = ChangeEvent(project_id=project.id, title="East slope unsuitable soil removal")
    store.change_events[change_event.id] = change_event

    _first_document, first_job = ingest_upload(
        content=b"P-100 east slope: Please proceed and keep the crew moving.",
        filename="direction.txt",
        document_type=DocumentType.email,
        matter_id=matter.id,
        sender="superintendent@owner.com",
    )
    assert first_job is not None
    assert run_once() is True
    ticket = store.risk_tickets[f"{change_event.id}:authorization_and_pricing"]
    assert ticket.severity == Severity.high
    assert ticket.status == "Detected"

    _second_document, second_job = ingest_upload(
        content=b"P-100 east slope: Mark is authorized to approve the field changes for $42,000.",
        filename="authority.txt",
        document_type=DocumentType.email,
        matter_id=matter.id,
        sender="owner@owner.com",
    )
    assert second_job is not None
    assert run_once() is True
    ticket = store.risk_tickets[f"{change_event.id}:authorization_and_pricing"]
    assert ticket.severity == Severity.medium
    assert ticket.status == "Insufficient Evidence"

    _third_document, third_job = ingest_upload(
        content=b"P-100 east slope: Authorization was limited to scheduling only, not additional cost.",
        filename="limitation.txt",
        document_type=DocumentType.email,
        matter_id=matter.id,
        sender="owner@owner.com",
    )
    assert third_job is not None
    assert run_once() is True
    ticket = store.risk_tickets[f"{change_event.id}:authorization_and_pricing"]
    assert ticket.severity == Severity.high
    assert ticket.status == "Contradicted"
    factor = store.risk_factors[f"{change_event.id}:authorization_disputed"]
    assert factor.contrary_signal_ids
    assert len([history for history in store.risk_ticket_history.values() if history.risk_ticket_id == ticket.id]) >= 2


def test_worker_marks_review_jobs_waiting_for_review() -> None:
    clear_store()
    matter = Matter(name="Demo Matter")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name="Project With Weak Match", project_number="P-300")
    store.projects[project.id] = project

    _document, job = ingest_upload(
        content=b"P-300 Please proceed with the field instruction.",
        filename="weak-match.txt",
        document_type=DocumentType.email,
        matter_id=matter.id,
        sender="pm@owner.com",
    )

    assert job is not None
    assert run_once() is True
    assert job.status == JobStatus.waiting_for_review
    assert store.reviews


def test_waiting_for_review_job_and_review_creation_are_idempotent() -> None:
    clear_store()
    matter = Matter(name="Demo Matter")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name="Project With Weak Match", project_number="P-300")
    store.projects[project.id] = project

    document, job = ingest_upload(
        content=b"P-300 Please proceed with the field instruction.",
        filename="weak-match.txt",
        document_type=DocumentType.email,
        matter_id=matter.id,
        sender="pm@owner.com",
    )

    assert job is not None
    assert run_once() is True
    assert job.status == JobStatus.waiting_for_review
    assert len(store.reviews) == 1

    duplicate_job = store.enqueue_job(ProcessingJob(document_id=document.id))

    assert duplicate_job.id == job.id
    assert run_once() is False
    assert len(store.reviews) == 1


def test_extra_work_rule_pipeline_searches_cost_evidence_and_requires_review() -> None:
    clear_store()
    matter = Matter(name="Rule Matter", organization_id="TENANT-1", tenant_id="TENANT-1")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name="Rule Project", project_number="P-910")
    store.projects[project.id] = project
    change_event = ChangeEvent(project_id=project.id, title="Steel support extra work")
    store.change_events[change_event.id] = change_event
    provenance = Provenance(tenant_id="TENANT-1", matter_id=matter.id, analysis_run_id="SEED", pipeline_version="test")
    store.obligations["OBL-RULE"] = Obligation(
        tenant_id="TENANT-1", matter_id=matter.id, clause_id="CLAUSE-RULE",
        obligation_type="change_order_approval", source_span_id="SPAN-RULE", provenance=provenance,
    )

    for content, filename in [
        (b"P-910 additional work is required for steel supports.", "extra.txt"),
        (b"P-910 Please proceed with the additional work.", "proceed.txt"),
        (b"P-910 Additional cost: $25,000.", "invoice.txt"),
    ]:
        _document, job = ingest_upload(content, filename, DocumentType.email, matter.id, tenant_id="TENANT-1")
        assert job is not None
        assert run_once() is True

    issues = [issue for issue in store.issues.values() if "EXTRA_WORK_COST_COMMUNICATION" in issue.rule_ids]
    assert issues
    assessment = store.assessments[issues[0].current_assessment_id]
    checks = {check.requirement_id: check for check in assessment.requirement_checks}
    assert checks["cost_impact_communicated"].supporting_evidence_ids
    assert checks["owner_approved_additional_cost"].result.value == "INSUFFICIENT_INFORMATION"
    assert any(attempt.issue_id == issues[0].id for attempt in store.search_attempts.values())
