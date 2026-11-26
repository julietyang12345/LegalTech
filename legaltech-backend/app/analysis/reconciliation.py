from datetime import date, datetime
from typing import Any

from app.domain_contracts.recording import record_provenance
from app.domain_contracts.schemas import (
    Assessment,
    AssessmentStatus,
    EvidenceAssertion,
    EvidenceStatus,
    RequirementReviewStatus,
    ExecutableRuleSpec,
    Issue,
    IssueType,
    Obligation,
    Provenance,
    SearchAttempt,
    TimingStatus,
    WorkflowStatus,
    DETERMINISTIC_PATTERNS,
)
from app.analysis.requirement_evaluator import evaluate_requirements
from app.analysis.evidence_relationships import assertion_scope
from app.analysis.dependency_graph import record_issue_dependencies
from app.analysis.text_semantics import is_negative_statement
from app.analysis.event_time import parse_event_date
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
        extra_work_id=issue.extra_work_id,
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
        extra_work_id=issue.extra_work_id or next((assertion_scope(assertion) for assertion in relevant if assertion_scope(assertion)), None),
        # The assessment inherits review requirements from its child checks.
        # Missing evidence can still require legal review when entitlement,
        # exceptions, or contract applicability remain unresolved.
        review_status=(
            RequirementReviewStatus.required
            if (
                status == AssessmentStatus.lawyer_review_required
                or any(check.review_status == RequirementReviewStatus.required for check in requirement_checks)
                or (rule is not None and rule.review_policy.value != "OPTIONAL")
            )
            else RequirementReviewStatus.not_required
        ),
        legal_applicability=(
            rule.applicability.jurisdiction
            if rule else "UNVERIFIED"
        ),
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
        uncertainty_reasons=_unique_uncertainty_reasons(requirement_checks, rule),
        next_action=_next_action(requirement_checks, rule),
        conflict_classifications=_unique_conflict_classifications(requirement_checks),
    )
    store.assessments[assessment.id] = assessment
    issue.current_assessment_id = assessment.id
    issue.workflow_status = WorkflowStatus.pending_review
    issue.evidence_status = evidence_status
    record_issue_dependencies(issue, assessment, rule)
    return assessment


def _unique_uncertainty_reasons(checks: list, rule: ExecutableRuleSpec | None):
    values = [reason for check in checks for reason in (check.uncertainty_reasons or ([check.uncertainty_reason] if check.uncertainty_reason else []))]
    if rule and (rule.applicability.jurisdiction in {"REQUIRES_VERIFICATION", "UNKNOWN"} or rule.applicability.contract_review_required):
        from app.domain_contracts.schemas import UncertaintyReason
        values.append(UncertaintyReason.legal_applicability_unverified)
    return list(dict.fromkeys(values))


def _unique_conflict_classifications(checks: list):
    values = [check.conflict_classification for check in checks if check.conflict_classification]
    return list(dict.fromkeys(values))


def _next_action(checks: list, rule: ExecutableRuleSpec | None) -> str | None:
    for check in checks:
        if check.next_action:
            return check.next_action
    if rule and rule.applicability.contract_review_required:
        return "Confirm contract applicability, exceptions, waiver, and alternative entitlement bases with counsel."
    return None


def _assess(
    issue_type: IssueType, obligation: Obligation | None, assertions: list[EvidenceAssertion],
    searches: list[SearchAttempt], checks: list, rule: ExecutableRuleSpec | None = None,
) -> tuple[AssessmentStatus, EvidenceStatus, str]:
    if checks:
        return _assess_requirement_checks(checks, rule)
    if rule and rule.requirements and all(req.patterns and set(req.patterns) <= DETERMINISTIC_PATTERNS for req in rule.requirements):
        return AssessmentStatus.insufficient_information, EvidenceStatus.not_found, (
            "No requirement and observation of the same item were identified to compare."
        )
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
    elapsed = _elapsed_days(trigger_at, notice_at, obligation.deadline_unit, obligation)
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
    if any(check.comparison or check.milestone for check in checks):
        return _assess_required_vs_observed(checks, rule)
    labels = {requirement.id: requirement.label for requirement in (rule.requirements if rule else [])}
    missing = [labels.get(check.requirement_id, check.requirement_id) for check in checks if check.result == AssessmentStatus.insufficient_information]
    timing = _timing_findings(checks, labels)
    late = any(check.timing and check.timing.status == TimingStatus.after_work_start for check in checks)
    if any(check.result == AssessmentStatus.disputed for check in checks):
        return AssessmentStatus.disputed, EvidenceStatus.reconstructable, _join("One or more rule requirements have contrary evidence.", *timing)
    if any(check.result == AssessmentStatus.lawyer_review_required for check in checks):
        return AssessmentStatus.lawyer_review_required, EvidenceStatus.reconstructable, _join("The executable rule found evidence but requires lawyer review for one or more requirements.", *timing)
    if missing:
        return AssessmentStatus.insufficient_information, EvidenceStatus.partial, _join(f"Not identified in the supplied evidence: {', '.join(missing)}.", *timing)
    if late:
        # Every requirement is documented; what remains is when. That is a
        # historical timing concern for review, not missing evidence.
        return AssessmentStatus.lawyer_review_required, EvidenceStatus.reconstructable, _join(
            *timing, "The legal effect of the late timing (ratification, waiver, or a contractual exception) requires review.",
        )
    if rule and (rule.applicability.jurisdiction in {"REQUIRES_VERIFICATION", "UNKNOWN"} or rule.applicability.contract_review_required):
        return AssessmentStatus.lawyer_review_required, EvidenceStatus.reconstructable, _join(
            "All requirements have supporting evidence.", *timing, "Contract applicability remains subject to review.",
        )
    return AssessmentStatus.satisfied, EvidenceStatus.reconstructable, _join("All executable-rule requirements were supported by the available evidence.", *timing)


def _assess_required_vs_observed(checks: list, rule: ExecutableRuleSpec | None) -> tuple[AssessmentStatus, EvidenceStatus, str]:
    """Conclusion assembled from each check's own comparison sentence."""
    open_checks = [check for check in checks if check.result != AssessmentStatus.satisfied]
    if not open_checks:
        return AssessmentStatus.satisfied, EvidenceStatus.reconstructable, _join(
            *(check.explanation for check in checks), "Contract applicability remains subject to review.",
        )
    order = [AssessmentStatus.not_satisfied, AssessmentStatus.lawyer_review_required, AssessmentStatus.insufficient_information]
    status = next(state for state in order if any(check.result == state for check in open_checks))
    evidence = EvidenceStatus.partial if status == AssessmentStatus.insufficient_information else EvidenceStatus.reconstructable
    return status, evidence, _join(*(check.explanation for check in open_checks))


def _timing_findings(checks: list, labels: dict[str, str]) -> list[str]:
    """One sentence per timed requirement, built from its TimingAssessment."""
    findings = []
    for check in checks:
        timing = check.timing
        if not timing:
            continue
        label = labels.get(check.requirement_id, check.requirement_id.replace("_", " "))
        fact, work = _long_date(timing.fact_date), _long_date(timing.work_start_date)
        if timing.status == TimingStatus.after_work_start:
            findings.append(f"{label}: documented {fact}, after work began {work}.")
        elif timing.status == TimingStatus.before_work_start and work:
            findings.append(f"{label}: {fact}, before work began {work}.")
        elif timing.status == TimingStatus.undetermined and work:
            findings.append(f"{label}: order against work start ({work}) could not be established from the stated dates.")
    return findings


def _long_date(value: str | None) -> str | None:
    if not value:
        return None
    parsed = date.fromisoformat(value)
    return f"{parsed:%B} {parsed.day}, {parsed.year}"


def _join(*parts: str) -> str:
    return " ".join(part for part in parts if part)


def _elapsed_days(start: date, end: date, unit: str | None, obligation: Obligation | None = None) -> int:
    if unit and unit.lower() in {"working_days", "work_days", "business_days"}:
        holidays = set()
        for value in (obligation.holiday_dates if obligation else []):
            try:
                holidays.add(date.fromisoformat(value))
            except ValueError:
                continue
        current = start
        count = 0
        if obligation and obligation.counting_rule == "INCLUDING_EVENT" and current.weekday() < 5 and current not in holidays:
            count = 1
        while current < end:
            current = current.fromordinal(current.toordinal() + 1)
            if current.weekday() < 5 and current not in holidays:
                count += 1
        return count
    return (end - start).days


def _deadline_label(unit: str | None) -> str:
    return "working days" if unit and unit.lower() in {"working_days", "work_days", "business_days"} else "calendar days"


def _notice_dates(assertions: list[EvidenceAssertion]) -> tuple[date, date] | None:
    triggers: list[date] = []
    notices: list[date] = []
    for assertion in assertions:
        value: Any = assertion.value
        if isinstance(value, dict):
            trigger = parse_event_date(value.get("trigger_at") or value.get("event_at"), reference_at=assertion.uploaded_at)
            notice = parse_event_date(value.get("notice_at") or value.get("communication_at"), reference_at=assertion.uploaded_at)
            if trigger:
                triggers.append(trigger)
            if notice:
                notices.append(notice)
        if assertion.event_at:
            event_date = parse_event_date(assertion.event_at, reference_at=assertion.uploaded_at)
            if event_date:
                triggers.append(event_date)
        if assertion.document_sent_at:
            sent_date = parse_event_date(assertion.document_sent_at, reference_at=assertion.uploaded_at)
            if sent_date:
                notices.append(sent_date)
        if "notice" in assertion.assertion_type.lower() or "notice" in assertion.statement.lower():
            if is_negative_statement(assertion.statement):
                continue
            if assertion.price_communicated_at:
                notice_date = parse_event_date(assertion.price_communicated_at, reference_at=assertion.uploaded_at)
                if notice_date:
                    notices.append(notice_date)
        if "delay" in assertion.assertion_type.lower() or "trigger" in assertion.assertion_type.lower():
            if assertion.work_start_at:
                trigger_date = parse_event_date(assertion.work_start_at, reference_at=assertion.uploaded_at)
                if trigger_date:
                    triggers.append(trigger_date)
    # A forwarded or corrected document can be encountered before the source
    # event in iteration order. Select the earliest explicit trigger and the
    # earliest communication date rather than the first assertion seen.
    trigger = min(triggers) if triggers else None
    notice = min(notices) if notices else None
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
