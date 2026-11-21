from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12].upper()}"


class DocumentType(str, Enum):
    email = "email"
    attachment = "attachment"
    invoice = "invoice"
    contract = "contract"
    change_order = "change_order"
    purchase_order = "purchase_order"
    daily_report = "daily_report"
    photo = "photo"
    unknown = "unknown"


class JobStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    waiting_for_review = "waiting_for_review"
    completed = "completed"
    failed = "failed"


class MatchStatus(str, Enum):
    auto_linked = "auto_linked"
    needs_review = "needs_review"
    unlinked = "unlinked"


class Severity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class RiskStatus(str, Enum):
    detected = "Detected"
    under_review = "Under Review"
    supported = "Supported"
    contradicted = "Contradicted"
    escalated = "Escalated"
    mitigated = "Mitigated"
    resolved = "Resolved"
    insufficient_evidence = "Insufficient Evidence"


class Matter(BaseModel):
    id: str = Field(default_factory=lambda: new_id("MATTER"))
    name: str
    organization_id: str | None = None
    tenant_id: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Project(BaseModel):
    id: str = Field(default_factory=lambda: new_id("PROJ"))
    matter_id: str
    name: str
    project_number: str | None = None
    site_address: str | None = None


class ChangeEvent(BaseModel):
    id: str = Field(default_factory=lambda: new_id("CE"))
    project_id: str
    title: str
    status: str = "active"
    first_detected_at: datetime = Field(default_factory=datetime.utcnow)


class Document(BaseModel):
    id: str = Field(default_factory=lambda: new_id("DOC"))
    document_type: DocumentType
    received_at: datetime = Field(default_factory=datetime.utcnow)
    sender: str | None = None
    subject: str | None = None
    file_hash: str
    storage_path: str
    gmail_message_id: str | None = None
    internet_message_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    tenant_id: str | None = None
    matter_id: str | None = None


class Event(BaseModel):
    id: str = Field(default_factory=lambda: new_id("EVT"))
    event_type: str
    matter_id: str | None = None
    document_id: str
    occurred_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)
    tenant_id: str | None = None


class ExtractedSignal(BaseModel):
    id: str = Field(default_factory=lambda: new_id("SIG"))
    change_event_id: str | None = None
    signal_type: str
    value: Any
    actor: str | None = None
    source_document_id: str
    source_text: str
    confidence: float = 0.0
    source_text_hash: str
    tenant_id: str | None = None
    provenance_id: str | None = None


class DecisionNodeState(BaseModel):
    id: str = Field(default_factory=lambda: new_id("NODESTATE"))
    change_event_id: str
    tree_version: str
    node_id: str
    status: str
    supporting_signal_ids: list[str] = Field(default_factory=list)
    contrary_signal_ids: list[str] = Field(default_factory=list)
    missing_factors: list[str] = Field(default_factory=list)
    evaluated_at: datetime = Field(default_factory=datetime.utcnow)


class RiskFactor(BaseModel):
    id: str = Field(default_factory=lambda: new_id("RF"))
    change_event_id: str
    factor_type: str
    status: str = "active"
    strength: str = "medium"
    supporting_signal_ids: list[str] = Field(default_factory=list)
    contrary_signal_ids: list[str] = Field(default_factory=list)
    first_detected_at: datetime = Field(default_factory=datetime.utcnow)
    last_updated_at: datetime = Field(default_factory=datetime.utcnow)
    mitigated_by_document_id: str | None = None
    mitigated_at: datetime | None = None


class RiskTicket(BaseModel):
    id: str = Field(default_factory=lambda: new_id("RT"))
    change_event_id: str
    title: str
    severity: Severity
    status: RiskStatus = RiskStatus.detected
    factor_ids: list[str] = Field(default_factory=list)
    summary: str
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class RiskTicketHistory(BaseModel):
    id: str = Field(default_factory=lambda: new_id("RTH"))
    risk_ticket_id: str
    previous_severity: Severity | None = None
    new_severity: Severity | None = None
    previous_status: str | None = None
    new_status: str | None = None
    reason: str
    supporting_event_id: str | None = None
    supporting_signal_ids: list[str] = Field(default_factory=list)
    contrary_signal_ids: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ProcessingJob(BaseModel):
    id: str = Field(default_factory=lambda: new_id("JOB"))
    document_id: str
    job_type: str = "process_new_document"
    status: JobStatus = JobStatus.pending
    attempt_count: int = 0
    next_attempt_at: datetime = Field(default_factory=datetime.utcnow)
    locked_at: datetime | None = None
    error_message: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
    pipeline_version: str = "0.1.0"
    analysis_status: str = "PENDING"
    analysis_reason: str | None = None


class HumanReview(BaseModel):
    id: str = Field(default_factory=lambda: new_id("REV"))
    review_type: str
    status: str = "open"
    document_id: str | None = None
    matter_id: str | None = None
    project_id: str | None = None
    change_event_id: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: datetime | None = None


class MatchFeedback(BaseModel):
    id: str = Field(default_factory=lambda: new_id("MF"))
    user_id: str
    document_id: str
    selected_project_id: str | None = None
    selected_change_event_id: str | None = None
    features: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
