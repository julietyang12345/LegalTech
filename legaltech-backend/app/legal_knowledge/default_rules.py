from app.domain_contracts.schemas import (
    CheckPattern,
    EvaluationMethod,
    IssueType,
    ExecutableRuleSpec,
    LegalPrinciple,
    Provenance,
    ReviewPolicy,
    RuleApplicability,
    RuleApprovalStatus,
    RuleRequirement,
)


def extra_work_cost_communication_rule() -> tuple[LegalPrinciple, ExecutableRuleSpec]:
    provenance = Provenance(
        tenant_id="SYSTEM",
        matter_id="SYSTEM",
        analysis_run_id="RULE-SEED-1",
        pipeline_version="rules-0.1.0",
        method="lawyer_seeded_candidate",
        rationale="Candidate rule contract; jurisdiction and legal effect require lawyer verification.",
    )
    principle = LegalPrinciple(
        id="PRINCIPLE_001",
        tenant_id="SYSTEM",
        matter_id="SYSTEM",
        title="Extra work and cost communication",
        statement="Potential extra work may require separate checks concerning cost communication and approval.",
        jurisdiction="REQUIRES_VERIFICATION",
        version="1.0",
        approval_status=RuleApprovalStatus.approved,
        provenance=provenance,
    )
    spec = ExecutableRuleSpec(
        id="EXTRA_WORK_COST_COMMUNICATION",
        version="1.3",
        tenant_id="SYSTEM",
        matter_id="SYSTEM",
        title="Extra Work Cost Communication",
        legal_principle_id=principle.id,
        approval_status=RuleApprovalStatus.approved,
        applicability=RuleApplicability(
            jurisdiction="REQUIRES_VERIFICATION",
            contract_review_required=True,
            factual_conditions=["extra_work_detected"],
        ),
        discovery_triggers=["extra_work_detected"],
        assessment_preconditions=["potential_additional_compensation"],
        requirements=[
            RuleRequirement(
                id="extra_work_occurred",
                label="Extra work identified",
                evaluation=EvaluationMethod.ai_semantic,
                evidence_queries=["extra work", "additional work", "changed scope"],
                # A daily report or CO recital of completed work proves occurrence.
                supporting_assertion_types=["extra_work_detected", "instruction_to_proceed", "change_order", "work_performed"],
            ),
            RuleRequirement(
                id="cost_impact_communicated",
                label="Cost impact communicated",
                evaluation=EvaluationMethod.ai_semantic,
                evidence_queries=["additional cost", "additional costs", "extra compensation", "revised price"],
                # Extractors label a stated estimate as estimate_amount, not cost_communication.
                supporting_assertion_types=["cost_communication", "additional_costs", "price_notice", "estimate_amount"],
                contrary_assertion_types=["no_extra_cost", "cost_not_discussed"],
                patterns=[CheckPattern.communication_act, CheckPattern.before_work_start],
            ),
            RuleRequirement(
                id="owner_approved_additional_cost",
                label="Owner approved additional cost",
                evaluation=EvaluationMethod.ai_and_lawyer,
                evidence_queries=["approved additional cost", "signed change order", "approved price"],
                # The extractor labels the same owner signature line signed_change_order,
                # express_authorization or written_authorization from run to run.
                supporting_assertion_types=["signed_change_order", "approved_amount", "price_approval", "express_authorization", "written_authorization"],
                contrary_assertion_types=["approval_denied", "scheduling_only"],
                lawyer_review_required=True,
                patterns=[CheckPattern.approval, CheckPattern.before_work_start],
            ),
        ],
        exceptions_to_check=["waiver", "alternative_entitlement_basis"],
        review_policy=ReviewPolicy.adverse_conclusion,
        impact_categories=["A_SCOPE_CHANGE", "B_PRICE_ADJUSTMENT"],
        provenance=provenance,
    )
    return principle, spec


def notice_timeliness_rule() -> tuple[LegalPrinciple, ExecutableRuleSpec]:
    provenance = Provenance(
        tenant_id="SYSTEM", matter_id="SYSTEM", analysis_run_id="RULE-SEED-2",
        pipeline_version="rules-0.1.0", method="lawyer_seeded_candidate",
        rationale="Engineering rule contract; notice law and applicability require lawyer verification.",
    )
    principle = LegalPrinciple(
        id="PRINCIPLE_NOTICE_001", tenant_id="SYSTEM", matter_id="SYSTEM",
        title="Notice timing", statement="A contract notice obligation should be checked against its trigger, deadline, form, and recipient.",
        jurisdiction="REQUIRES_VERIFICATION", approval_status=RuleApprovalStatus.approved, provenance=provenance,
    )
    return principle, ExecutableRuleSpec(
        id="NOTICE_TIMELINESS", version="1.1", tenant_id="SYSTEM", matter_id="SYSTEM",
        title="Notice Timeliness", issue_type="NOTICE", legal_principle_id=principle.id,
        approval_status=RuleApprovalStatus.approved,
        applicability=RuleApplicability(jurisdiction="REQUIRES_VERIFICATION", contract_review_required=True),
        # Events that can require notice, plus notices given or refused. No
        # word triggers: "notice" in an email is not a notice event.
        discovery_triggers=["condition_encountered", "delay_event", "written_notice", "notice_denied"],
        obligation_terms=["notice"],
        trigger_obligation_terms={
            "condition_encountered": ["condition"],
            "delay_event": ["delay", "extension of time", "time extension"],
        },
        assessment_preconditions=["notice_event", "normalized_notice_obligation"],
        requirements=[
            RuleRequirement(id="notice_event_identified", label="Notice event identified", evaluation=EvaluationMethod.ai_semantic, evidence_queries=["written notice", "notice of delay"], supporting_assertion_types=["written_notice", "notice_event"]),
            RuleRequirement(id="notice_timing", label="Notice timing can be reconstructed", evaluation=EvaluationMethod.deterministic_validated_dates, deterministic_fields=["trigger_at", "notice_at"], lawyer_review_required=True),
            RuleRequirement(id="notice_form_and_recipient", label="Form and recipient requirements checked", evaluation=EvaluationMethod.ai_and_lawyer, evidence_queries=["sent to owner", "written notice"], lawyer_review_required=True),
        ],
        exceptions_to_check=["waiver", "accepted_late_notice", "alternative_notice_basis"],
        review_policy=ReviewPolicy.adverse_conclusion, impact_categories=["C_SCHEDULE_TIME"], provenance=provenance,
    )


def change_order_approval_rule() -> tuple[LegalPrinciple, ExecutableRuleSpec]:
    provenance = Provenance(
        tenant_id="SYSTEM", matter_id="SYSTEM", analysis_run_id="RULE-SEED-3",
        pipeline_version="rules-0.1.0", method="lawyer_seeded_candidate",
        rationale="Engineering rule contract; approval effect and authority require lawyer verification.",
    )
    principle = LegalPrinciple(
        id="PRINCIPLE_CHANGE_001", tenant_id="SYSTEM", matter_id="SYSTEM",
        title="Change order approval", statement="Extra work should be checked for required authorization, written form, price, and authority limitations.",
        jurisdiction="REQUIRES_VERIFICATION", approval_status=RuleApprovalStatus.approved, provenance=provenance,
    )
    return principle, ExecutableRuleSpec(
        id="CHANGE_ORDER_APPROVAL", version="1.4", tenant_id="SYSTEM", matter_id="SYSTEM",
        title="Change Order Approval", issue_type="CHANGE_ORDER", legal_principle_id=principle.id,
        approval_status=RuleApprovalStatus.approved,
        applicability=RuleApplicability(jurisdiction="REQUIRES_VERIFICATION", contract_review_required=True),
        discovery_triggers=["extra_work_detected", "change_order", "instruction_to_proceed"],
        # An instruction to proceed, or a contract's change clause, is not a
        # change. Require a fact of an actual or proposed scope/price change.
        requires_fact_types=[
            "extra_work_detected", "signed_change_order", "formal_change_document", "estimate_amount",
            "cost_communication", "approved_amount", "pricing_method", "price_approval",
            "express_authorization", "written_authorization", "pricing_unresolved", "approval_denied",
        ],
        assessment_preconditions=["extra_work_detected"],
        requirements=[
            RuleRequirement(id="extra_work_occurred", label="Extra work identified", evaluation=EvaluationMethod.ai_semantic, evidence_queries=["extra work", "additional work"], supporting_assertion_types=["extra_work_detected", "instruction_to_proceed", "change_order", "work_performed"]),
            RuleRequirement(id="approval_documented", label="Approval or equivalent authority documented", evaluation=EvaluationMethod.ai_and_lawyer, evidence_queries=["signed change order", "approved change"], supporting_assertion_types=["signed_change_order", "express_authorization", "written_authorization"], contrary_assertion_types=["approval_denied", "scheduling_only"], lawyer_review_required=True, patterns=[CheckPattern.approval, CheckPattern.before_work_start]),
            RuleRequirement(id="price_basis_identified", label="Price basis identified", evaluation=EvaluationMethod.ai_semantic, evidence_queries=["approved amount", "unit price", "time and materials", "adjustment to contract price", "lump sum"], supporting_assertion_types=["approved_amount", "pricing_method", "formal_change_document"], price_bearing_assertion_types=["signed_change_order", "change_order"]),
        ],
        exceptions_to_check=["waiver", "owner_awareness", "alternative_entitlement_basis"],
        review_policy=ReviewPolicy.adverse_conclusion, impact_categories=["A_SCOPE_CHANGE", "B_PRICE_ADJUSTMENT"], provenance=provenance,
    )


def required_precondition_rule() -> tuple[LegalPrinciple, ExecutableRuleSpec]:
    """General: required work, deliverable or signoff vs its actual state
    before a dependent milestone. Not specific to any trade or document set;
    the same checks cover test holes, inspections, tests and submittals."""
    provenance = Provenance(
        tenant_id="SYSTEM", matter_id="SYSTEM", analysis_run_id="RULE-SEED-4",
        pipeline_version="rules-0.1.0", method="lawyer_seeded_candidate",
        rationale="Engineering rule contract; contractual effect of an unmet precondition requires lawyer verification.",
    )
    principle = LegalPrinciple(
        id="PRINCIPLE_PRECONDITION_001", tenant_id="SYSTEM", matter_id="SYSTEM",
        title="Contractual precondition before milestone",
        statement="Where the contract requires work, a deliverable, or a signoff before a dependent milestone, its actual state should be compared with the requirement before that milestone.",
        jurisdiction="REQUIRES_VERIFICATION", approval_status=RuleApprovalStatus.approved, provenance=provenance,
    )
    return principle, ExecutableRuleSpec(
        id="REQUIRED_PRECONDITION", version="1.0", tenant_id="SYSTEM", matter_id="SYSTEM",
        title="Required Precondition Before Milestone", issue_type=IssueType.precondition, legal_principle_id=principle.id,
        approval_status=RuleApprovalStatus.approved,
        applicability=RuleApplicability(jurisdiction="REQUIRES_VERIFICATION", contract_review_required=True),
        # A record list can show coverage without any stated count; it is an
        # observation to reconcile, not proof of completed work.
        discovery_triggers=["completed_quantity", "deliverable_status", "record_coverage"],
        requirements=[
            RuleRequirement(id="required_scope_completed", label="Required scope completed", evaluation=EvaluationMethod.deterministic, patterns=[CheckPattern.quantity_completeness]),
            RuleRequirement(id="required_deliverable_final", label="Required deliverable in final form", evaluation=EvaluationMethod.deterministic, patterns=[CheckPattern.required_document_final]),
            RuleRequirement(id="prerequisites_before_milestone", label="Prerequisites met before milestone", evaluation=EvaluationMethod.deterministic, patterns=[CheckPattern.prerequisite_before_milestone], lawyer_review_required=True),
        ],
        exceptions_to_check=["approved_scope_revision", "waiver"],
        review_policy=ReviewPolicy.adverse_conclusion, impact_categories=["C_SCHEDULE_TIME"], provenance=provenance,
    )


def default_rule_set() -> list[tuple[LegalPrinciple, ExecutableRuleSpec]]:
    return [extra_work_cost_communication_rule(), notice_timeliness_rule(), change_order_approval_rule(), required_precondition_rule()]
