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
        obligations = _obligation_sentences(assertions) if rule.obligation_terms else []
        if rule.requires_fact_types and not any(
            assertion.evidence_role == EvidenceRole.project_fact and _is_affirmative(assertion)
            and assertion.assertion_type.lower() in {t.lower() for t in rule.requires_fact_types}
            for assertion in assertions
        ):
            continue
        trigger_ids = [
            assertion.id for assertion in assertions
            if assertion.evidence_role == EvidenceRole.project_fact
            and _is_affirmative(assertion)
            and _matches_trigger(assertion, rule.discovery_triggers)
            and (not rule.obligation_terms or _has_obligation(rule, assertion.assertion_type.lower(), obligations))
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
    from app.extraction.ai_signal_extractor import ALLOWED_SIGNAL_TYPES

    assertion_type = assertion.assertion_type.lower()
    statement = assertion.statement.lower()
    for trigger in triggers:
        normalized = trigger.lower()
        if normalized == assertion_type or normalized.replace(" ", "_") == assertion_type:
            return True
        if normalized in ALLOWED_SIGNAL_TYPES:
            # A typed trigger is matched by type only, never by a word in text.
            continue
        # Legacy rules may still contain phrase triggers. Keep this fallback
        # bounded to the source statement rather than mixing fields together.
        if normalized in statement or normalized.replace("_", " ") in statement:
            return True
    return False


def _has_obligation(rule: ExecutableRuleSpec, trigger_type: str, sentences: list[str]) -> bool:
    required = [term.lower() for term in rule.obligation_terms]
    any_of = [term.lower() for term in rule.trigger_obligation_terms.get(trigger_type, [])]
    return any(
        all(term in sentence for term in required) and (not any_of or any(term in sentence for term in any_of))
        for sentence in sentences
    )


def _obligation_sentences(assertions: list[EvidenceAssertion]) -> list[str]:
    """Contract wording of the matter: normative assertions, and the sentences
    of its contract documents (so a clause the model did not extract still counts)."""
    from pathlib import Path
    import re

    from app.analysis.evidence_relationships import is_normative_document

    sentences = [a.statement.lower() for a in assertions if a.evidence_role == EvidenceRole.normative_rule]
    if not assertions:
        return sentences
    tenant_id, matter_id = assertions[0].tenant_id, assertions[0].matter_id
    for document in store.documents.values():
        if document.tenant_id != tenant_id or document.matter_id != matter_id or not is_normative_document(document):
            continue
        try:
            text = Path(document.storage_path).read_text(encoding="utf-8", errors="replace")
        except (OSError, TypeError):
            continue
        sentences += [part.strip().lower() for part in re.split(r"(?<=[.;])\s+|\n", text) if part.strip()]
    return sentences


# Observations of a state: "not signed", "not in the folder", "no logs for X"
# are negative and still exactly what a requirement check must compare.
STATE_OBSERVATION_TYPES = {"deliverable_status", "record_coverage", "completed_quantity"}
# Types that are negative by nature (a refusal, an open price). Their polarity
# is not a reason to ignore them, but "not found" is not a refusal.
INHERENTLY_NEGATIVE_TYPES = {"approval_denied", "authorization_denial", "notice_denied", "pricing_unresolved"}


def _is_affirmative(assertion: EvidenceAssertion) -> bool:
    """Whether a fact can count toward starting a rule.

    Never: a conditional ("hold pending sign-off") or a denied plan. An event
    stated as not having happened cannot start a rule either, but a negative
    *state observation* can, and a refusal is a refusal whatever its polarity.
    """
    from app.analysis.text_semantics import is_explicit_denial, is_not_found_statement

    value = assertion.value if isinstance(assertion.value, dict) else {}
    kind = assertion.assertion_type.lower()
    if str(value.get("temporal_status") or "").lower() in {"conditional", "denied"}:
        return False
    if kind in STATE_OBSERVATION_TYPES:
        return True
    if kind in INHERENTLY_NEGATIVE_TYPES:
        return not is_not_found_statement(assertion.statement)
    if str(value.get("polarity") or "").lower() in {"negative", "uncertain"}:
        return False
    return not is_explicit_denial(assertion.statement)
