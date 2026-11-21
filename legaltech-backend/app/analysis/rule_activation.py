from collections.abc import Iterable

from app.domain_contracts.schemas import EvidenceAssertion, EvidenceRole, ExecutableRuleSpec, RuleActivation
from app.repositories.memory import store


def activate_rules(
    *, rules: Iterable[ExecutableRuleSpec], assertions: Iterable[EvidenceAssertion],
) -> list[RuleActivation]:
    """Activate a rule when a discovery trigger is present.

    Triggering and applicability are separate. A rule with an unverified
    jurisdiction is still activated as a candidate, but cannot silently become
    a binding legal standard.
    """
    assertions = list(assertions)
    scopes = {(assertion.tenant_id, assertion.matter_id) for assertion in assertions}
    if len(scopes) > 1:
        raise ValueError("rule activation cannot mix tenant or matter evidence")
    activations: list[RuleActivation] = []
    for rule in rules:
        trigger_ids = [
            assertion.id for assertion in assertions
            if assertion.evidence_role == EvidenceRole.project_fact
            and _matches_trigger(assertion, rule.discovery_triggers)
        ]
        if not trigger_ids:
            continue
        applicability_verified = rule.applicability.jurisdiction not in {"REQUIRES_VERIFICATION", "UNKNOWN"}
        activation = RuleActivation(
            tenant_id=assertions[0].tenant_id,
            matter_id=assertions[0].matter_id,
            rule_id=rule.id,
            rule_version=rule.version,
            status="APPLICABLE" if applicability_verified else "CANDIDATE_REQUIRES_APPLICABILITY_REVIEW",
            trigger_ids=trigger_ids,
            applicability_reason=(
                "Applicability metadata is verified for this rule."
                if applicability_verified
                else "Trigger found, but jurisdiction or contract applicability requires review."
            ),
            requires_lawyer_review=not applicability_verified or rule.review_policy.value != "OPTIONAL",
        )
        store.rule_activations[activation.id] = activation
        activations.append(activation)
    return activations


def _matches_trigger(assertion: EvidenceAssertion, triggers: list[str]) -> bool:
    assertion_type = assertion.assertion_type.lower()
    statement = assertion.statement.lower()
    for trigger in triggers:
        normalized = trigger.lower()
        if normalized == assertion_type or normalized.replace(" ", "_") == assertion_type:
            return True
        # Legacy rules may still contain phrase triggers. Keep this fallback
        # bounded to the source statement rather than mixing fields together.
        if normalized in statement or normalized.replace("_", " ") in statement:
            return True
    return False
