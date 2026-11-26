from collections.abc import Iterable

from app.domain_contracts.schemas import (
    DETERMINISTIC_PATTERNS,
    EvidenceAssertion,
    EvidenceStatus,
    EvidenceRole,
    ExecutableRuleSpec,
    Issue,
    IssueType,
    Obligation,
    RuleActivation,
    WorkflowStatus,
)
from app.analysis.evidence_relationships import assertion_event_scope, assertion_scope
from app.repositories.memory import store


# Typed events only: a fact that can require notice, or a notice given or
# refused. A word ("notice", "delay", "claim") in an ordinary email is not one.
_NOTICE_TRIGGER_TYPES = {"written_notice", "notice_denied", "notice_event", "delay_event", "condition_encountered"}
_NOTICE_TERMS = {"notice", "delay", "claim", "extra_compensation", "written_notice"}
_CHANGE_ORDER_TERMS = {"change", "change_order", "extra_work", "authorization", "pricing", "approval"}
_INDEPENDENT_TERMS = {"waiver", "repudiation", "termination", "reservation of rights"}


def discover_issues(
    *,
    tenant_id: str,
    matter_id: str,
    obligations: Iterable[Obligation],
    assertions: Iterable[EvidenceAssertion],
    rules: Iterable[ExecutableRuleSpec] = (),
    activations: Iterable[RuleActivation] = (),
) -> list[Issue]:
    """Create bounded Notice / Change Order candidates from neutral evidence.

    Discovery is intentionally permissive: an issue may be created with partial
    evidence. It is not a legal conclusion and does not imply a breach.
    """
    obligations = list(obligations)
    assertions = list(assertions)
    rules = list(rules)
    activations = list(activations)
    created: list[Issue] = []

    if _has_obligation(obligations, "notice") and _matches(assertions, _NOTICE_TERMS):
        created.append(_upsert_issue(
            tenant_id=tenant_id,
            matter_id=matter_id,
            issue_type=IssueType.notice,
            title="Potential notice-compliance issue",
            summary="A notice-related event was identified; timing and legal sufficiency require reconciliation.",
            obligation_ids=[o.id for o in obligations if "notice" in o.obligation_type.lower()],
            evidence_ids=[a.id for a in assertions if _matches_assertion(a, _NOTICE_TERMS)],
        ))

    if _has_obligation(obligations, "change") and _matches(assertions, _CHANGE_ORDER_TERMS) and not activations:
        change_assertions = [a for a in assertions if _matches_assertion(a, _CHANGE_ORDER_TERMS)]
        scope = _issue_scope_from_assertions(change_assertions)
        extra_work_id = _unique_event_extra_work_id(change_assertions, assertions)
        created.append(_upsert_issue(
            tenant_id=tenant_id,
            matter_id=matter_id,
            issue_type=IssueType.change_order,
            title="Potential change-order compliance issue",
            summary="Additional work, direction, pricing, or approval evidence was identified.",
            obligation_ids=[o.id for o in obligations if "change" in o.obligation_type.lower()],
            evidence_ids=[a.id for a in change_assertions],
            rule_ids=[],
            rule_versions=[],
            issue_scope=scope,
            extra_work_id=extra_work_id,
        ))

    for rule in rules:
        matching_activations = [activation for activation in activations if activation.rule_id == rule.id]
        if not matching_activations:
            continue
        trigger_ids = {trigger_id for activation in matching_activations for trigger_id in activation.trigger_ids}
        trigger_assertions = [assertion for assertion in assertions if assertion.id in trigger_ids]
        if not trigger_assertions:
            continue
        by_scope = _group_trigger_assertions(trigger_assertions, assertions)
        for scope, scoped_assertions in by_scope.items():
            extra_work_id = (
                scope if scope and str(scope).upper().startswith("EW-")
                else next((assertion_scope(a) for a in scoped_assertions if assertion_scope(a)), None)
            )
            # Contract requirements stated for this same event (e.g. an exhibit
            # requiring 14 test holes) are evidence of what was required. They
            # are never triggers, so attach them here.
            requirements = [
                a for a in assertions
                if a.evidence_role == EvidenceRole.normative_rule and extra_work_id
                and assertion_scope(a) == extra_work_id
            ]
            # Required-vs-observed checks compare every fact of the event (a
            # scope revision, a milestone), not only the facts that triggered it.
            if extra_work_id and any(set(req.patterns) & DETERMINISTIC_PATTERNS for req in rule.requirements):
                requirements += [
                    a for a in assertions
                    if a.evidence_role == EvidenceRole.project_fact and assertion_scope(a) == extra_work_id
                ]
            created.append(_upsert_issue(
                tenant_id=tenant_id,
                matter_id=matter_id,
                issue_type=rule.issue_type,
                title=rule.title,
                summary="Executable rule activated; each requirement must be evaluated separately.",
                obligation_ids=[o.id for o in obligations if o.id],
                evidence_ids=[a.id for a in [*scoped_assertions, *requirements]],
                rule_ids=[rule.id],
                rule_versions=[rule.version],
                issue_scope=scope,
                extra_work_id=extra_work_id,
            ))

    # Bounded independent check: surface an unexpected legal signal even when
    # the current contract ontology has not mapped an obligation for it.
    if not _has_obligation(obligations, "notice") and _matches(assertions, _INDEPENDENT_TERMS):
        created.append(_upsert_issue(
            tenant_id=tenant_id,
            matter_id=matter_id,
            issue_type=IssueType.notice,
            title="Unmapped notice-related legal signal",
            summary="A waiver, repudiation, termination, or reservation-of-rights signal requires contract mapping and review.",
            obligation_ids=[],
            evidence_ids=[a.id for a in assertions if _matches_assertion(a, _INDEPENDENT_TERMS)],
        ))

    return created


def _has_obligation(obligations: list[Obligation], term: str) -> bool:
    return any(term in o.obligation_type.lower() for o in obligations)


def _matches(assertions: list[EvidenceAssertion], terms: set[str]) -> bool:
    return any(_matches_assertion(a, terms) for a in assertions)


def _matches_assertion(assertion: EvidenceAssertion, terms: set[str]) -> bool:
    if assertion.evidence_role != EvidenceRole.project_fact:
        return False
    if terms is _NOTICE_TERMS:
        return assertion.assertion_type.lower() in _NOTICE_TRIGGER_TYPES
    haystack = f"{assertion.assertion_type} {assertion.statement}".lower()
    return any(term in haystack for term in terms)


def _upsert_issue(**kwargs: object) -> Issue:
    existing = next(
        (issue for issue in store.issues.values()
         if not issue.merged_into_event_id
         and issue.tenant_id == kwargs["tenant_id"]
         and issue.matter_id == kwargs["matter_id"]
         and issue.type == kwargs["issue_type"]
         and issue.issue_scope == kwargs.get("issue_scope")
         and set(issue.rule_ids) == set(kwargs.get("rule_ids", []))
         and set(issue.rule_version_ids) == set(kwargs.get("rule_versions", []))),
        None,
    )
    if existing:
        existing.obligation_ids = sorted(set(existing.obligation_ids + list(kwargs["obligation_ids"])))
        existing.evidence_ids = sorted(set(existing.evidence_ids + list(kwargs["evidence_ids"])))
        existing.evidence_status = EvidenceStatus.partial if existing.evidence_ids else EvidenceStatus.not_found
        existing.rule_version_ids = sorted(set(existing.rule_version_ids + list(kwargs.get("rule_versions", []))))
        existing.rule_ids = sorted(set(existing.rule_ids + list(kwargs.get("rule_ids", []))))
        if not existing.extra_work_id and kwargs.get("extra_work_id"):
            existing.extra_work_id = kwargs["extra_work_id"]
        if existing.extra_work_id and not existing.issue_scope:
            existing.issue_scope = existing.extra_work_id
        _link_event(existing)
        return existing

    issue = Issue(
        tenant_id=kwargs["tenant_id"],
        matter_id=kwargs["matter_id"],
        type=kwargs["issue_type"],
        title=kwargs["title"],
        summary=kwargs["summary"],
        obligation_ids=list(kwargs["obligation_ids"]),
        evidence_ids=list(kwargs["evidence_ids"]),
        workflow_status=WorkflowStatus.discovered,
        evidence_status=EvidenceStatus.partial if kwargs["evidence_ids"] else EvidenceStatus.not_found,
        rule_version_ids=list(kwargs.get("rule_versions", [])),
        rule_ids=list(kwargs.get("rule_ids", [])),
        issue_scope=kwargs.get("issue_scope"),
        extra_work_id=kwargs.get("extra_work_id"),
    )
    _link_event(issue)
    store.issues[issue.id] = issue
    return issue


def _link_event(issue: Issue) -> None:
    """Carry the internal event identity, resolving merged aliases."""
    if not issue.extra_work_id:
        return
    event = store.find_extra_work(tenant_id=issue.tenant_id, matter_id=issue.matter_id, external_id=issue.extra_work_id)
    if event is not None:
        issue.event_id = event.id


def _issue_scope_from_assertions(assertions: list[EvidenceAssertion]) -> str | None:
    return (
        next((assertion_scope(a) for a in assertions if assertion_scope(a)), None)
        or next((assertion_event_scope(a) for a in assertions if assertion_event_scope(a)), None)
        or (assertions[0].source_document_id if assertions else None)
    )


def _group_trigger_assertions(
    assertions: list[EvidenceAssertion],
    all_assertions: list[EvidenceAssertion] | None = None,
) -> dict[str | None, list[EvidenceAssertion]]:
    """Group rule triggers by EW, attaching unscoped facts when unambiguous."""
    groups: dict[str | None, list[EvidenceAssertion]] = {}
    event_to_ews: dict[str, set[str]] = {}
    for assertion in all_assertions or assertions:
        ew_id = assertion_scope(assertion)
        event_id = assertion_event_scope(assertion)
        if ew_id and event_id:
            event_to_ews.setdefault(event_id, set()).add(ew_id)

    for assertion in assertions:
        ew_id = assertion_scope(assertion)
        event_id = assertion_event_scope(assertion)
        groups.setdefault(ew_id or (event_id if event_id else None), []).append(assertion)

    normalized: dict[str | None, list[EvidenceAssertion]] = {}
    for scope, scoped in groups.items():
        for assertion in scoped:
            ew_id = assertion_scope(assertion)
            event_id = assertion_event_scope(assertion)
            target = ew_id
            event_ews = event_to_ews.get(event_id, set()) if event_id else set()
            if not target and event_id and len(event_ews) == 1:
                target = next(iter(event_ews))
            # An unscoped trigger in a multi-EW event cannot safely create a
            # catch-all issue. Wait for an EW-specific assertion instead.
            if not target and event_id and len(event_ews) > 1:
                continue
            if not target:
                target = event_id or scope
            normalized.setdefault(target, []).append(assertion)
    return normalized


def _unique_event_extra_work_id(
    scoped_assertions: list[EvidenceAssertion], all_assertions: list[EvidenceAssertion],
) -> str | None:
    direct = {assertion_scope(assertion) for assertion in scoped_assertions if assertion_scope(assertion)}
    if len(direct) == 1:
        return next(iter(direct))
    events = {assertion_event_scope(assertion) for assertion in scoped_assertions if assertion_event_scope(assertion)}
    related = {
        assertion_scope(assertion)
        for assertion in all_assertions
        if assertion_event_scope(assertion) in events and assertion_scope(assertion)
    }
    return next(iter(related)) if len(related) == 1 else None
