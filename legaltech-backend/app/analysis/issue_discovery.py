from collections.abc import Iterable

from app.domain_contracts.schemas import (
    EvidenceAssertion,
    EvidenceStatus,
    ExecutableRuleSpec,
    Issue,
    IssueType,
    Obligation,
    RuleActivation,
    WorkflowStatus,
)
from app.repositories.memory import store


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
        scope = _scope_from_assertions(change_assertions)
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
            extra_work_id=scope,
        ))

    for rule in rules:
        matching_activations = [activation for activation in activations if activation.rule_id == rule.id]
        if not matching_activations:
            continue
        trigger_ids = {trigger_id for activation in matching_activations for trigger_id in activation.trigger_ids}
        trigger_assertions = [assertion for assertion in assertions if assertion.id in trigger_ids]
        if not trigger_assertions:
            continue
        by_scope: dict[str | None, list[EvidenceAssertion]] = {}
        for assertion in trigger_assertions:
            by_scope.setdefault(_scope_from_assertions([assertion]), []).append(assertion)
        for scope, scoped_assertions in by_scope.items():
            created.append(_upsert_issue(
                tenant_id=tenant_id,
                matter_id=matter_id,
                issue_type=rule.issue_type,
                title=rule.title,
                summary="Executable rule activated; each requirement must be evaluated separately.",
                obligation_ids=[o.id for o in obligations if o.id],
                evidence_ids=[a.id for a in scoped_assertions],
                rule_ids=[rule.id],
                rule_versions=[rule.version],
                issue_scope=scope,
                extra_work_id=scope,
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
    haystack = f"{assertion.assertion_type} {assertion.statement}".lower()
    return any(term in haystack for term in terms)


def _upsert_issue(**kwargs: object) -> Issue:
    existing = next(
        (issue for issue in store.issues.values()
         if issue.tenant_id == kwargs["tenant_id"]
         and issue.matter_id == kwargs["matter_id"]
         and issue.type == kwargs["issue_type"]
         and issue.issue_scope == kwargs.get("issue_scope")
         and set(issue.rule_version_ids) == set(kwargs.get("rule_versions", []))),
        None,
    )
    if existing:
        existing.obligation_ids = sorted(set(existing.obligation_ids + list(kwargs["obligation_ids"])))
        existing.evidence_ids = sorted(set(existing.evidence_ids + list(kwargs["evidence_ids"])))
        existing.evidence_status = EvidenceStatus.partial if existing.evidence_ids else EvidenceStatus.not_found
        existing.rule_version_ids = sorted(set(existing.rule_version_ids + list(kwargs.get("rule_versions", []))))
        existing.rule_ids = sorted(set(existing.rule_ids + list(kwargs.get("rule_ids", []))))
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
    store.issues[issue.id] = issue
    return issue


def _scope_from_assertions(assertions: list[EvidenceAssertion]) -> str | None:
    for assertion in assertions:
        if isinstance(assertion.value, dict):
            scope = assertion.value.get("extra_work_id") or assertion.value.get("event_id") or assertion.value.get("change_event_id")
            if scope:
                return str(scope)
    return assertions[0].source_document_id if assertions else None
