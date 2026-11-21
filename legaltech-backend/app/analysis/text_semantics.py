def is_negative_statement(statement: str) -> bool:
    lowered = statement.lower()
    return any(phrase in lowered for phrase in (
        "not approved", "never approved", "no approval", "without approval",
        "not authorize", "not authorized", "scheduling only", "not additional cost",
        "no notice was sent", "no written notice", "notice was not sent", "never sent notice",
    ))


def is_explicit_denial(statement: str) -> bool:
    """Return true for a project-specific denial, not a missing-record note."""
    lowered = statement.lower()
    return any(phrase in lowered for phrase in (
        "never approved", "did not approve", "didn't approve", "not approved",
        "approval was denied", "we deny", "never authorized", "did not authorize",
        "not authorized", "not additional cost", "scheduling only",
    )) and not any(phrase in lowered for phrase in (
        "no record", "no approval record", "not included", "not found", "not identified",
    ))


_CONDITIONAL_PHRASES = (
    "subject to", "conditional on", "conditioned on", "contingent on", "contingent upon",
    "provided that", "upon signing", "upon receipt of", "once signed", "pending signature",
    "pending approval", "if you sign",
)


def is_conditional_statement(statement: str) -> bool:
    """Deterministic fallback for conditional language; AI output takes precedence."""
    lowered = statement.lower()
    return any(phrase in lowered for phrase in _CONDITIONAL_PHRASES)
