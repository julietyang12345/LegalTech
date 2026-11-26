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
    # A contractual precondition (required work, document, or signoff) that
    # must be met before a dependent milestone. Not a change order.
    precondition = "PRECONDITION"


class CheckPattern(str, Enum):
    """Reusable requirement checks. A requirement declares which apply; the
    evaluator dispatches on the pattern, never on a requirement id."""

    # Compare the requirement's supporting fact date with the work start.
    before_work_start = "BEFORE_WORK_START"
    # The requirement is met by sending a communication to the other party.
    communication_act = "COMMUNICATION_ACT"
    # The requirement is an approval by the other party.
    approval = "APPROVAL"
    # Required quantity (contract) vs completed quantity (project fact).
    quantity_completeness = "QUANTITY_COMPLETENESS"
    # A required deliverable exists in its final / signed form.
    required_document_final = "REQUIRED_DOCUMENT_FINAL"
    # Prerequisites are met before a dependent milestone date.
    prerequisite_before_milestone = "PREREQUISITE_BEFORE_MILESTONE"


DETERMINISTIC_PATTERNS = {
    CheckPattern.quantity_completeness,
    CheckPattern.required_document_final,
    CheckPattern.prerequisite_before_milestone,
}


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


class EvidenceRole(str, Enum):
    """How an assertion participates in factual requirement evaluation."""

    project_fact = "PROJECT_FACT"
    normative_rule = "NORMATIVE_RULE"
    context_only = "CONTEXT_ONLY"


class EvidenceRelationType(str, Enum):
    """How one assertion bears on one requirement (never on the matter as a whole)."""

    supports = "SUPPORTS"
    contradicts = "CONTRADICTS"
    # Affirmative but gated on an unverified condition ("approve, subject to signing").
    conditional = "CONDITIONAL"
    context_only = "CONTEXT_ONLY"
    # The relation could not be determined (model said so, or model and
    # deterministic polarity disagree).
    uncertain = "UNCERTAIN"


class AssertionRelationType(str, Enum):
    """How a later assertion changes an earlier one. Edges point new -> old."""

    modifies = "MODIFIES"
    supersedes = "SUPERSEDES"
    revokes = "REVOKES"


class AssessmentStatus(str, Enum):
    satisfied = "REQUIREMENT_SATISFIED"
    not_satisfied = "REQUIREMENT_NOT_SATISFIED"
    disputed = "DISPUTED"
    insufficient_information = "INSUFFICIENT_INFORMATION"
    lawyer_review_required = "LAWYER_REVIEW_REQUIRED"


class EvidenceOutcome(str, Enum):
    supported = "SUPPORTED"
    contradicted = "CONTRADICTED"
    disputed = "DISPUTED"
    insufficient_information = "INSUFFICIENT_INFORMATION"
    unknown = "UNKNOWN"


class RequirementReviewStatus(str, Enum):
    not_required = "NOT_REQUIRED"
    required = "REQUIRED"


class UncertaintyReason(str, Enum):
    no_explicit_approval_found = "NO_EXPLICIT_APPROVAL_FOUND"
    partial_evidence_set = "PARTIAL_EVIDENCE_SET"
    search_no_match = "SEARCH_NO_MATCH"
    conflicting_evidence = "CONFLICTING_EVIDENCE"
    ambiguous_extra_work_match = "AMBIGUOUS_EXTRA_WORK_MATCH"
    heuristic_only = "HEURISTIC_ONLY"
    legal_applicability_unverified = "LEGAL_APPLICABILITY_UNVERIFIED"
    temporal_order_uncertain = "TEMPORAL_ORDER_UNCERTAIN"
    cost_communication_after_work_start = "COST_COMMUNICATION_AFTER_WORK_START"
    approval_after_work_start = "APPROVAL_AFTER_WORK_START"
    # The model judged the language itself ambiguous for this requirement.
    semantic_uncertain = "SEMANTIC_UNCERTAIN"
    # Approval or support exists but depends on a condition not shown as met.
    condition_unmet = "CONDITION_UNMET"
    # An earlier assertion was modified, superseded, or revoked by a later one.
    later_modification = "LATER_MODIFICATION"
    # The semantic step failed or did not see every candidate (error, invalid
    # output, truncation). Distinct from missing evidence.
    analysis_incomplete = "ANALYSIS_INCOMPLETE"
    # Supporting evidence carries no EW identifier while the check is EW-scoped.
    scope_unverified = "SCOPE_UNVERIFIED"


class ConflictClassification(str, Enum):
    direct_conflict = "DIRECT_CONFLICT"
    later_modification = "LATER_MODIFICATION"
    different_scope = "DIFFERENT_SCOPE"
    missing_evidence = "MISSING_EVIDENCE"
    authority_conflict = "AUTHORITY_CONFLICT"
    temporal_supersession = "TEMPORAL_SUPERSESSION"


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
    # Always retrieved as candidates; may support only when the assertion
    # itself states an amount or pricing method.
    price_bearing_assertion_types: list[str] = Field(default_factory=list)
    deterministic_fields: list[str] = Field(default_factory=list)
    lawyer_review_required: bool = False
    patterns: list[CheckPattern] = Field(default_factory=list)


class ExecutableRuleSpec(ContractModel):
    id: str
    version: str
    title: str
    issue_type: IssueType = IssueType.change_order
    legal_principle_id: str
    approval_status: RuleApprovalStatus = RuleApprovalStatus.draft
    applicability: RuleApplicability
    discovery_triggers: list[str] = Field(default_factory=list)
    # A trigger counts only when the matter's contract states a matching
    # obligation: a sentence containing every ``obligation_terms`` word and, for
    # that trigger type, any of ``trigger_obligation_terms[type]`` (empty: any).
    # This lets an event that should have been notified activate the check even
    # when no notice was given, without a stray word activating it.
    obligation_terms: list[str] = Field(default_factory=list)
    trigger_obligation_terms: dict[str, list[str]] = Field(default_factory=dict)
    # The rule is about something that must have happened or been proposed: at
    # least one affirmative project fact of these types must exist (e.g. an
    # actual or proposed change for a change-order rule). A contract clause
    # describing how changes are approved is not such a fact.
    requires_fact_types: list[str] = Field(default_factory=list)
    assessment_preconditions: list[str] = Field(default_factory=list)
    requirements: list[RuleRequirement] = Field(default_factory=list)
    exceptions_to_check: list[str] = Field(default_factory=list)
    review_policy: ReviewPolicy = ReviewPolicy.lawyer_required
    # Taxonomy codes (app.legal_knowledge.taxonomy) this rule's issues bear on.
    # Always POTENTIAL impacts: a label never establishes an entitlement.
    impact_categories: list[str] = Field(default_factory=list)
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


class ExtraWork(ContractModel):
    id: str = Field(default_factory=lambda: new_id("EW"))
    external_id: str
    title: str | None = None
    description: str | None = None
    proposed_amount: float | None = None
    claimed_amount: float | None = None
    estimated_amount: float | None = None
    approved_amount: float | None = None
    currency: str | None = None
    status: str = "identified"
    # Event identity. ``id`` is internal; ``external_id`` is the canonical key
    # used for scoping (an EW number, or a generated EVT- key when the sources
    # carry no identifier). ``aliases`` are other identifiers for the same event.
    aliases: list[str] = Field(default_factory=list)
    event_type: str | None = None
    location: str | None = None
    work_items: list[str] = Field(default_factory=list)
    root_cause_categories: list[str] = Field(default_factory=list)
    identity_status: str = "CONFIRMED"
    document_ids: list[str] = Field(default_factory=list)
    # Set (with status "merged") when a reviewer merged this event into another.
    merged_into_id: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TimingStatus(str, Enum):
    before_work_start = "BEFORE_WORK_START"
    after_work_start = "AFTER_WORK_START"
    # Missing dates, or the fact and work start fall on the same day.
    undetermined = "UNDETERMINED"


class TimingAssessment(BaseModel):
    """Whether a supported requirement was met before the work began.

    Kept apart from the evidence result: "a signed CO exists" (result) and
    "it was signed before work started" (timing) are separate findings, and a
    late fact is a historical timing concern, not missing evidence.
    """

    status: TimingStatus
    fact_date: str | None = None
    work_start_date: str | None = None
    fact_evidence_ids: list[str] = Field(default_factory=list)
    work_evidence_ids: list[str] = Field(default_factory=list)


class QuantityComparison(BaseModel):
    """Required (contract) vs observed (project fact) state for one item."""

    item: str
    required: float | None = None
    completed: float | None = None
    outstanding: float | None = None
    outstanding_items: list[str] = Field(default_factory=list)
    # Records listed for required items (logs, sheets). Documented is not
    # completed: items without a record are unverified, not proven undone.
    documented: float | None = None
    documented_items: list[str] = Field(default_factory=list)
    unverified_items: list[str] = Field(default_factory=list)
    absent_record_evidence_ids: list[str] = Field(default_factory=list)
    # COMPLETE / SHORTFALL_STATED / COMPLETION_UNVERIFIED / RECORDS_COMPLETE
    completion_status: str | None = None
    # DELIVERED / NOT_DELIVERED_AS_OF / NOT_FOUND_IN_REVIEWED_RECORDS
    deliverable_state: str | None = None
    as_of: str | None = None
    required_status: str | None = None
    observed_status: str | None = None
    # APPROVED / EXPLICITLY_NONE / NONE_IDENTIFIED
    scope_revision: str = "NONE_IDENTIFIED"
    requirement_evidence_ids: list[str] = Field(default_factory=list)
    observed_evidence_ids: list[str] = Field(default_factory=list)
    revision_evidence_ids: list[str] = Field(default_factory=list)


class MilestoneCheck(BaseModel):
    milestone: str
    date: str | None = None
    as_of: str | None = None
    # UPCOMING / PASSED / DATED / UNDATED: the date against the as-of date
    status: str
    prerequisites_met: bool | None = None
    # MET: prerequisites met. AT_RISK: open prerequisites, milestone still
    # ahead. NOT_MET: a source says the milestone took place with prerequisites
    # open. REQUIRES_VERIFICATION: otherwise (a planned date passed, or no
    # as-of date), since a planned date is not evidence that it happened.
    readiness: str = "REQUIRES_VERIFICATION"
    evidence_ids: list[str] = Field(default_factory=list)


class GapBasis(str, Enum):
    """How an open requirement was established."""

    explicit_negative = "EXPLICIT_NEGATIVE_EVIDENCE"  # a source states the shortfall or absence
    not_identified = "NOT_IDENTIFIED_IN_SEARCHED_RECORDS"  # looked for, not found
    search_incomplete = "SEARCH_INCOMPLETE"  # not enough was searched to say


class RequirementCheck(BaseModel):
    id: str = Field(default_factory=lambda: new_id("REQCHECK"))
    requirement_id: str
    extra_work_id: str | None = None
    evidence_outcome: EvidenceOutcome | None = None
    review_status: RequirementReviewStatus = RequirementReviewStatus.not_required
    result: AssessmentStatus
    evidence_status: EvidenceStatus
    supporting_evidence_ids: list[str] = Field(default_factory=list)
    contrary_evidence_ids: list[str] = Field(default_factory=list)
    search_attempt_ids: list[str] = Field(default_factory=list)
    # Set on open checks: whether the gap is stated by a source, not found, or
    # not searched for well enough to say.
    gap_basis: GapBasis | None = None
    explanation: str
    requires_lawyer_review: bool = False
    uncertainty_reason: UncertaintyReason | None = None
    # All applicable reasons; ``uncertainty_reason`` stays the primary one.
    uncertainty_reasons: list[UncertaintyReason] = Field(default_factory=list)
    conditional_evidence_ids: list[str] = Field(default_factory=list)
    uncertain_evidence_ids: list[str] = Field(default_factory=list)
    # Earlier assertions no longer in force because a later one changed them.
    superseded_evidence_ids: list[str] = Field(default_factory=list)
    # Candidates removed by deterministic scope validation (other EW).
    excluded_evidence_ids: list[str] = Field(default_factory=list)
    analysis_complete: bool = True
    next_action: str | None = None
    conflict_classification: ConflictClassification | None = None
    # Set for requirements whose effect depends on ordering against work start.
    timing: TimingAssessment | None = None
    comparison: QuantityComparison | None = None
    milestone: MilestoneCheck | None = None
    provenance: Provenance


class EvidenceLink(ContractModel):
    id: str = Field(default_factory=lambda: new_id("ELINK"))
    extra_work_id: str | None = None
    requirement_check_id: str
    assertion_id: str
    relation_type: EvidenceRelationType
    method: str = "DETERMINISTIC"
    rationale: str | None = None
    condition: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AssertionLink(ContractModel):
    """A validated edge from a later assertion to the earlier one it changes.

    Stored against the specific prior assertion so a correction to either side
    identifies exactly which conclusions must be recomputed.
    """

    id: str = Field(default_factory=lambda: new_id("ALINK"))
    extra_work_id: str | None = None
    source_assertion_id: str
    target_assertion_id: str
    relation_type: AssertionRelationType
    requirement_id: str | None = None
    method: str = "AI_SEMANTIC"
    rationale: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


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
    candidate_triggers: list[str] = Field(default_factory=list)
    candidate_requirements: list[str] = Field(default_factory=list)
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
    holiday_dates: list[str] = Field(default_factory=list)
    counting_rule: str = "AFTER_EVENT"
    provenance: Provenance

    @model_validator(mode="after")
    def validate_deadline_pair(self) -> "Obligation":
        if (self.deadline_value is None) != (self.deadline_unit is None):
            raise ValueError("deadline_value and deadline_unit must be provided together")
        return self


class EvidenceAssertion(ContractModel):
    id: str = Field(default_factory=lambda: new_id("ASSERT"))
    source_document_id: str
    conversation_id: str | None = None
    extra_work_id: str | None = None
    # Internal identity of the event (ExtraWork.id). ``extra_work_id`` is the
    # event's canonical external key; it can change when events are merged,
    # the internal id of the surviving event cannot.
    event_id: str | None = None
    evidence_role: EvidenceRole = EvidenceRole.project_fact
    source_span_id: str | None = None
    assertion_type: str
    statement: str
    value: Any = None
    actor: str | None = None
    event_at: str | None = None
    communication_at: str | None = None
    work_planned_at: str | None = None
    work_start_at: str | None = None
    work_completed_at: str | None = None
    approval_at: str | None = None
    price_communicated_at: str | None = None
    price_approved_at: str | None = None
    document_sent_at: str | None = None
    uploaded_at: datetime | None = None
    time_source: str | None = None
    time_confidence: str = "unknown"
    relationship_status: str = "EXPLICIT"
    relationship_reason: str | None = None
    scope_confidence: str = "UNKNOWN"
    scope_candidates: list[str] = Field(default_factory=list)
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
    event_id: str | None = None
    # Set when a reviewer merged this issue's event into another event. The
    # issue stays for audit but is no longer presented or re-assessed.
    merged_into_event_id: str | None = None
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
    extra_work_id: str | None = None
    review_status: RequirementReviewStatus = RequirementReviewStatus.required
    legal_applicability: str = "UNVERIFIED"
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
    uncertainty_reasons: list[UncertaintyReason] = Field(default_factory=list)
    next_action: str | None = None
    conflict_classifications: list[ConflictClassification] = Field(default_factory=list)
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
    eligible_document_ids: list[str] = Field(default_factory=list)
    searched_document_ids: list[str] = Field(default_factory=list)
    candidate_assertion_ids: list[str] = Field(default_factory=list)
    unresolved_scope_assertion_ids: list[str] = Field(default_factory=list)
    # Candidates contributed only by AI selection (not type/keyword/thread).
    semantic_candidate_ids: list[str] = Field(default_factory=list)
    # NOT_RUN (AI off), COMPLETED, PARTIAL (budget omitted items), FAILED.
    semantic_status: str = "NOT_RUN"
    coverage_status: str = "UNKNOWN"
    result_count: int = 0
    completed_at: datetime = Field(default_factory=datetime.utcnow)
    analysis_run_id: str

