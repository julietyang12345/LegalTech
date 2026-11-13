from datetime import datetime

from app.models import (
    ChangeEvent,
    DecisionNodeState,
    Document,
    Event,
    ExtractedSignal,
    HumanReview,
    Matter,
    MatchFeedback,
    ProcessingJob,
    Project,
    RiskFactor,
    RiskTicket,
    RiskTicketHistory,
)
from app.domain_contracts.schemas import (
    Assessment,
    DependencyEdge,
    EvidenceLink,
    EvidenceAssertion,
    ExecutableRuleSpec,
    ExtraWork,
    Issue,
    LegalPrinciple,
    Obligation,
    Provenance,
    RuleActivation,
    SearchAttempt,
)
from app.models.domain import JobStatus


class InMemoryStore:
    def __init__(self) -> None:
        self.matters: dict[str, Matter] = {}
        self.projects: dict[str, Project] = {}
        self.change_events: dict[str, ChangeEvent] = {}
        self.documents: dict[str, Document] = {}
        self.events: dict[str, Event] = {}
        self.signals: dict[str, ExtractedSignal] = {}
        self.node_states: dict[str, DecisionNodeState] = {}
        self.risk_factors: dict[str, RiskFactor] = {}
        self.risk_tickets: dict[str, RiskTicket] = {}
        self.risk_ticket_history: dict[str, RiskTicketHistory] = {}
        self.jobs: dict[str, ProcessingJob] = {}
        self.reviews: dict[str, HumanReview] = {}
        self.match_feedback: dict[str, MatchFeedback] = {}
        self.processed_documents: set[tuple[str, str]] = set()
        self.obligations: dict[str, Obligation] = {}
        self.extra_works: dict[str, ExtraWork] = {}
        self.assertions: dict[str, EvidenceAssertion] = {}
        self.evidence_links: dict[str, EvidenceLink] = {}
        self.issues: dict[str, Issue] = {}
        self.assessments: dict[str, Assessment] = {}
        self.provenance: dict[str, Provenance] = {}
        self.search_attempts: dict[str, SearchAttempt] = {}
        self.legal_principles: dict[str, LegalPrinciple] = {}
        self.rule_specs: dict[tuple[str, str], ExecutableRuleSpec] = {}
        self.rule_activations: dict[str, RuleActivation] = {}
        self.dependency_edges: dict[str, DependencyEdge] = {}

    def find_document_duplicate(
        self,
        file_hash: str,
        gmail_message_id: str | None = None,
        internet_message_id: str | None = None,
        tenant_id: str | None = None,
        matter_id: str | None = None,
    ) -> Document | None:
        for document in self.documents.values():
            if tenant_id is not None and document.tenant_id != tenant_id:
                continue
            if matter_id is not None and document.matter_id != matter_id:
                continue
            if document.file_hash == file_hash:
                return document
            if gmail_message_id and document.gmail_message_id == gmail_message_id:
                return document
            if internet_message_id and document.internet_message_id == internet_message_id:
                return document
        return None

    def save_document(self, document: Document) -> Document:
        self.documents[document.id] = document
        return document

    def save_event(self, event: Event) -> Event:
        self.events[event.id] = event
        return event

    def enqueue_job(self, job: ProcessingJob) -> ProcessingJob:
        existing = [
            item
            for item in self.jobs.values()
            if item.document_id == job.document_id
            and item.pipeline_version == job.pipeline_version
            and item.status
            in {
                JobStatus.pending,
                JobStatus.processing,
                JobStatus.waiting_for_review,
                JobStatus.completed,
            }
        ]
        if existing:
            return existing[0]
        self.jobs[job.id] = job
        return job

    def claim_next_job(self) -> ProcessingJob | None:
        now = datetime.utcnow()
        candidates = sorted(
            [
                job
                for job in self.jobs.values()
                if job.status == JobStatus.pending and job.next_attempt_at <= now
            ],
            key=lambda item: item.created_at,
        )
        if not candidates:
            return None
        job = candidates[0]
        job.status = JobStatus.processing
        job.locked_at = now
        job.attempt_count += 1
        return job

    def mark_job_completed(self, job: ProcessingJob) -> None:
        job.status = JobStatus.completed
        job.completed_at = datetime.utcnow()
        self.processed_documents.add((job.document_id, job.pipeline_version))

    def mark_job_failed(self, job: ProcessingJob, error: Exception) -> None:
        job.status = JobStatus.failed
        job.error_message = str(error)


store = InMemoryStore()
