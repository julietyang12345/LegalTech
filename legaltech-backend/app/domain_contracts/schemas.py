"""Versioned, source-linked domain contracts for the first vertical slice.

These models intentionally separate workflow, evidence, legal assessment, and
review state.  They are transport/domain contracts, not database records.
"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.models.domain import new_id


class ContractModel(BaseModel):
    tenant_id: str
    matter_id: str


class IssueType(str, Enum):
    notice = "NOTICE"
    change_order = "CHANGE_ORDER"


class WorkflowStatus(str, Enum):
    discovered = "DISCOVERED"
    analyzing = "ANALYZING"
    pending_review = "PENDING_REVIEW"
    reviewed = "REVIEWED"
    closed = "CLOSED"


class EvidenceStatus(str, Enum):
    not_found = "NOT_FOUND"
    existence_only = "EXISTENCE_ONLY"
    partial = "PARTIAL"
    reconstructable = "RECONSTRUCTABLE"


class AssessmentStatus(str, Enum):
    satisfied = "REQUIREMENT_SATISFIED"
    not_satisfied = "REQUIREMENT_NOT_SATISFIED"
    disputed = "DISPUTED"
    insufficient_information = "INSUFFICIENT_INFORMATION"
    lawyer_review_required = "LAWYER_REVIEW_REQUIRED"


class ReviewStatus(str, Enum):
    pending = "PENDING"
    approved = "APPROVED"
    corrected = "CORRECTED"
    rejected = "REJECTED"


class RuleApprovalStatus(str, Enum):
    draft = "DRAFT"
    approved = "APPROVED"
    retired = "RETIRED"


class EvaluationMethod(str, Enum):
    deterministic = "DETERMINISTIC"
    deterministic_validated_dates = "DETERMINISTIC_WITH_VALIDATED_DATES"
    ai_semantic = "AI_SEMANTIC"
    ai_and_lawyer = "AI_AND_LAWYER_REVIEW"


class ReviewPolicy(str, Enum):
    optional = "OPTIONAL"
    lawyer_required = "LAWYER_REQUIRED"
    adverse_conclusion = "LAWYER_REQUIRED_FOR_ADVERSE_ENTITLEMENT_CONCLUSION"


class Provenance(ContractModel):
    id: str = Field(default_factory=lambda: new_id("PROV"))
    source_span_ids: list[str] = Field(default_factory=list)
    source_document_ids: list[str] = Field(default_factory=list)
    analysis_run_id: str
    pipeline_version: str
    model_id: str | None = None
    prompt_version: str | None = None
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    review_status: ReviewStatus = ReviewStatus.pending
    method: str = "deterministic"
    rationale: str | None = None


class RuleApplicability(BaseModel):
    jurisdiction: str = "REQUIRES_VERIFICATION"
    contract_review_required: bool = True
    contract_conditions: list[str] = Field(default_factory=list)
    factual_conditions: list[str] = Field(default_factory=list)


class LegalPrinciple(ContractModel):
    id: str = Field(default_factory=lambda: new_id("PRINCIPLE"))
    title: str
    statement: str
    jurisdiction: str
    source_document_ids: list[str] = Field(default_factory=list)
    source_span_ids: list[str] = Field(default_factory=list)
    version: str = "1.0"
    approval_status: RuleApprovalStatus = RuleApprovalStatus.draft
    provenance: Provenance


class RuleRequirement(BaseModel):
    id: str
    label: str
    evaluation: EvaluationMethod
    evidence_queries: list[str] = Field(default_factory=list)
    supporting_assertion_types: list[str] = Field(default_factory=list)
    contrary_assertion_types: list[str] = Field(default_factory=list)
    deterministic_fields: list[str] = Field(default_factory=list)
    lawyer_review_required: bool = False


class ExecutableRuleSpec(ContractModel):
    id: str
    version: str
    title: str
    issue_type: IssueType = IssueType.change_order
    legal_principle_id: str
    approval_status: RuleApprovalStatus = RuleApprovalStatus.draft
    applicability: RuleApplicability
    discovery_triggers: list[str] = Field(default_factory=list)
    assessment_preconditions: list[str] = Field(default_factory=list)
    requirements: list[RuleRequirement] = Field(default_factory=list)
    exceptions_to_check: list[str] = Field(default_factory=list)
    review_policy: ReviewPolicy = ReviewPolicy.lawyer_required
    provenance: Provenance


class RuleActivation(BaseModel):
    id: str = Field(default_factory=lambda: new_id("ACTIVATION"))
    tenant_id: str
    matter_id: str
    rule_id: str
    rule_version: str
    status: str
    trigger_ids: list[str] = Field(default_factory=list)
    applicability_reason: str
    requires_lawyer_review: bool = True


class RequirementCheck(BaseModel):
    id: str = Field(default_factory=lambda: new_id("REQCHECK"))
    requirement_id: str
    result: AssessmentStatus
    evidence_status: EvidenceStatus
    supporting_evidence_ids: list[str] = Field(default_factory=list)
    contrary_evidence_ids: list[str] = Field(default_factory=list)
    search_attempt_ids: list[str] = Field(default_factory=list)
    explanation: str
    requires_lawyer_review: bool = False
    provenance: Provenance


class DependencyEdge(ContractModel):
    id: str = Field(default_factory=lambda: new_id("DEP"))
    upstream_type: str
    upstream_id: str
    downstream_type: str
    downstream_id: str
    relation_type: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CaseRuleCandidate(ContractModel):
    id: str = Field(default_factory=lambda: new_id("CASE_RULE"))
    case_document_id: str
    title: str
    extracted_facts: list[str] = Field(default_factory=list)
    court_findings: list[str] = Field(default_factory=list)
    candidate_principle: str
    applicability_limits: list[str] = Field(default_factory=list)
    source_span_ids: list[str] = Field(default_factory=list)
    review_status: ReviewStatus = ReviewStatus.pending
    requires_lawyer_review: bool = True


class Obligation(ContractModel):
    id: str = Field(default_factory=lambda: new_id("OBL"))
    clause_id: str
    obligation_type: str
    trigger_event: str | None = None
    deadline_value: int | None = None
    deadline_unit: str | None = None
    required_form: str | None = None
    recipient: str | None = None
    source_span_id: str
    version: str = "1.0"
    ambiguity_notes: str | None = None
    provenance: Provenance

    @model_validator(mode="after")
    def validate_deadline_pair(self) -> "Obligation":
        if (self.deadline_value is None) != (self.deadline_unit is None):
            raise ValueError("deadline_value and deadline_unit must be provided together")
        return self


class EvidenceAssertion(ContractModel):
    id: str = Field(default_factory=lambda: new_id("ASSERT"))
    source_document_id: str
    source_span_id: str | None = None
    assertion_type: str
    statement: str
    value: Any = None
    actor: str | None = None
    asserted_at: datetime | None = None
    verified: bool = False
    provenance: Provenance


class Issue(ContractModel):
    id: str = Field(default_factory=lambda: new_id("ISSUE"))
    type: IssueType
    obligation_ids: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    rule_version_ids: list[str] = Field(default_factory=list)
    rule_ids: list[str] = Field(default_factory=list)
    issue_scope: str | None = None
    extra_work_id: str | None = None
    workflow_status: WorkflowStatus = WorkflowStatus.discovered
    evidence_status: EvidenceStatus = EvidenceStatus.not_found
    current_assessment_id: str | None = None
    title: str
    summary: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Assessment(ContractModel):
    id: str = Field(default_factory=lambda: new_id("ASSESS"))
    issue_id: str
    status: AssessmentStatus
    evidence_status: EvidenceStatus
    conclusion: str
    evidence_ids: list[str] = Field(default_factory=list)
    obligation_ids: list[str] = Field(default_factory=list)
    rule_version_ids: list[str] = Field(default_factory=list)
    rule_ids: list[str] = Field(default_factory=list)
    requirement_checks: list[RequirementCheck] = Field(default_factory=list)
    provenance: Provenance
    supersedes_assessment_id: str | None = None
    is_current: bool = True
    stale_reason: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SearchAttempt(ContractModel):
    id: str = Field(default_factory=lambda: new_id("SEARCH"))
    issue_id: str | None = None
    query: str
    scope: dict[str, Any] = Field(default_factory=dict)
    filters: dict[str, Any] = Field(default_factory=dict)
    corpus_version: str
    retrieval_strategy: str
    result_document_ids: list[str] = Field(default_factory=list)
    result_count: int = 0
    completed_at: datetime = Field(default_factory=datetime.utcnow)
    analysis_run_id: str

