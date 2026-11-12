from datetime import date, datetime
from typing import Any

from app.domain_contracts.recording import record_provenance
from app.domain_contracts.schemas import (
    Assessment,
    AssessmentStatus,
    EvidenceAssertion,
    EvidenceStatus,
    ExecutableRuleSpec,
    Issue,
    IssueType,
    Obligation,
    Provenance,
    SearchAttempt,
    WorkflowStatus,
)
from app.analysis.requirement_evaluator import evaluate_requirements
from app.analysis.dependency_graph import record_issue_dependencies
from app.analysis.text_semantics import is_negative_statement
from app.repositories.memory import store


def reconcile_issue(
    *, issue: Issue, obligations: list[Obligation], assertions: list[EvidenceAssertion],
    search_attempts: list[SearchAttempt] | None = None, analysis_run_id: str,
    pipeline_version: str = "0.1.0",
    rule: ExecutableRuleSpec | None = None,
) -> Assessment:
    """Perform deterministic checks and return a versioned assessment.

    Missing evidence remains an evidence state, never proof that the event did
    not occur. The resulting assessment is therefore reviewable by default.
    """
    relevant = [a for a in assertions if a.id in issue.evidence_ids]
    obligation = next((o for o in obligations if o.id in issue.obligation_ids), None)
    requirement_checks = evaluate_requirements(
        rule=rule,
        assertions=relevant,
        search_attempts=search_attempts or [],
        tenant_id=issue.tenant_id,
        matter_id=issue.matter_id,
        analysis_run_id=analysis_run_id,
        pipeline_version=pipeline_version,
    ) if rule else []
    status, evidence_status, conclusion = _assess(issue.type, obligation, relevant, search_attempts or [], requirement_checks, rule)
    provenance = record_provenance(Provenance(
        tenant_id=issue.tenant_id,
        matter_id=issue.matter_id,
        source_document_ids=sorted({a.source_document_id for a in relevant}),
        source_span_ids=sorted({a.source_span_id for a in relevant if a.source_span_id}),
        analysis_run_id=analysis_run_id,
        pipeline_version=pipeline_version,
        method="deterministic_reconciliation",
        rationale="Dates and presence checks are deterministic; legal sufficiency remains reviewable.",
    ))
    prior = issue.current_assessment_id
    if prior and prior in store.assessments:
        store.assessments[prior].is_current = False
        store.assessments[prior].stale_reason = "superseded_by_new_analysis"
    assessment = Assessment(
        tenant_id=issue.tenant_id,
        matter_id=issue.matter_id,
        issue_id=issue.id,
        status=status,
        evidence_status=evidence_status,
        conclusion=conclusion,
        evidence_ids=[a.id for a in relevant],
        obligation_ids=issue.obligation_ids,
        rule_version_ids=issue.rule_version_ids,
        rule_ids=issue.rule_ids,
        requirement_checks=requirement_checks,
        provenance=provenance,
        supersedes_assessment_id=prior,
    )
    store.assessments[assessment.id] = assessment
    issue.current_assessment_id = assessment.id
    issue.workflow_status = WorkflowStatus.pending_review
    issue.evidence_status = evidence_status
    record_issue_dependencies(issue, assessment, rule)
    return assessment


def _assess(
    issue_type: IssueType, obligation: Obligation | None, assertions: list[EvidenceAssertion],
    searches: list[SearchAttempt], checks: list, rule: ExecutableRuleSpec | None = None,
) -> tuple[AssessmentStatus, EvidenceStatus, str]:
    if checks:
        return _assess_requirement_checks(checks, rule)
    if not assertions:
        coverage = EvidenceStatus.existence_only if searches else EvidenceStatus.not_found
        return AssessmentStatus.insufficient_information, coverage, (
            "No qualifying evidence was identified in the recorded search scope; this does not establish that the event did not occur."
        )
    if issue_type == IssueType.notice:
        return _assess_notice(obligation, assertions)
    return _assess_change_order(assertions)


def _assess_notice(obligation: Obligation | None, assertions: list[EvidenceAssertion]) -> tuple[AssessmentStatus, EvidenceStatus, str]:
    dates = _notice_dates(assertions)
    if not obligation or obligation.deadline_value is None:
        return AssessmentStatus.insufficient_information, EvidenceStatus.partial, "Notice evidence exists, but the obligation deadline or trigger is not sufficiently normalized."
    if not dates:
        return AssessmentStatus.insufficient_information, EvidenceStatus.partial, "Notice evidence exists, but the trigger and notice dates could not be reconstructed."
    trigger_at, notice_at = dates
    elapsed = _elapsed_days(trigger_at, notice_at, obligation.deadline_unit)
    if elapsed < 0:
        return AssessmentStatus.disputed, EvidenceStatus.reconstructable, "The notice date precedes the identified trigger date; dates require lawyer review."
    if elapsed <= obligation.deadline_value:
        unit = _deadline_label(obligation.deadline_unit)
        return AssessmentStatus.satisfied, EvidenceStatus.reconstructable, f"The identified notice was within {obligation.deadline_value} {unit} of the trigger. Contractual sufficiency remains reviewable."
    unit = _deadline_label(obligation.deadline_unit)
    return AssessmentStatus.not_satisfied, EvidenceStatus.reconstructable, f"The identified notice was {elapsed} {unit} after the trigger, beyond the normalized deadline. Exceptions and waiver require review."


def _assess_change_order(assertions: list[EvidenceAssertion]) -> tuple[AssessmentStatus, EvidenceStatus, str]:
    signed = any(
        any(term in f"{a.assertion_type} {a.statement}".lower() for term in ("signed", "executed", "approved"))
        and not is_negative_statement(a.statement)
        for a in assertions
    )
    limited = any("scheduling only" in a.statement.lower() or "not additional cost" in a.statement.lower() for a in assertions)
    if limited:
        return AssessmentStatus.disputed, EvidenceStatus.reconstructable, "Authority or approval evidence contains an express limitation."
    if signed:
        return AssessmentStatus.satisfied, EvidenceStatus.reconstructable, "A signed, executed, or approval-related change-order assertion was identified."
    return AssessmentStatus.insufficient_information, EvidenceStatus.partial, "Change-related evidence exists, but signed approval or equivalent authority evidence was not established."


def _assess_requirement_checks(checks: list, rule: ExecutableRuleSpec | None) -> tuple[AssessmentStatus, EvidenceStatus, str]:
    if any(check.result == AssessmentStatus.disputed for check in checks):
        return AssessmentStatus.disputed, EvidenceStatus.reconstructable, "One or more rule requirements have contrary evidence."
    if any(check.result == AssessmentStatus.lawyer_review_required for check in checks):
        return AssessmentStatus.lawyer_review_required, EvidenceStatus.reconstructable, "The executable rule found evidence but requires lawyer review for one or more requirements."
    if any(check.result == AssessmentStatus.insufficient_information for check in checks):
        return AssessmentStatus.insufficient_information, EvidenceStatus.partial, "One or more executable-rule requirements lack sufficient evidence."
    if rule and (rule.applicability.jurisdiction in {"REQUIRES_VERIFICATION", "UNKNOWN"} or rule.applicability.contract_review_required):
        return AssessmentStatus.lawyer_review_required, EvidenceStatus.reconstructable, "The requirements have supporting evidence, but rule applicability requires lawyer review."
    return AssessmentStatus.satisfied, EvidenceStatus.reconstructable, "All executable-rule requirements were supported by the available evidence."


def _elapsed_days(start: date, end: date, unit: str | None) -> int:
    if unit and unit.lower() in {"working_days", "work_days", "business_days"}:
        current = start
        count = 0
        while current < end:
            current = current.fromordinal(current.toordinal() + 1)
            if current.weekday() < 5:
                count += 1
        return count
    return (end - start).days


def _deadline_label(unit: str | None) -> str:
    return "working days" if unit and unit.lower() in {"working_days", "work_days", "business_days"} else "calendar days"


def _notice_dates(assertions: list[EvidenceAssertion]) -> tuple[date, date] | None:
    trigger: date | None = None
    notice: date | None = None
    for assertion in assertions:
        value: Any = assertion.value
        if isinstance(value, dict):
            trigger = trigger or _as_date(value.get("trigger_at") or value.get("event_at"))
            notice = notice or _as_date(value.get("notice_at"))
        if "notice" in assertion.assertion_type.lower() or "notice" in assertion.statement.lower():
            if is_negative_statement(assertion.statement):
                continue
            notice = notice or (assertion.asserted_at.date() if assertion.asserted_at else None)
        if "delay" in assertion.assertion_type.lower() or "trigger" in assertion.assertion_type.lower():
            trigger = trigger or (assertion.asserted_at.date() if assertion.asserted_at else None)
    return (trigger, notice) if trigger and notice else None


def _as_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(str(value))
        except ValueError:
            return None
