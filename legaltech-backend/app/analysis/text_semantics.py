import re


def is_negative_statement(statement: str) -> bool:
    lowered = statement.lower()
    return any(phrase in lowered for phrase in (
        "not approved", "never approved", "no approval", "without approval",
        "not authorize", "not authorized", "scheduling only", "not additional cost",
        "no notice was sent", "no written notice", "notice was not sent", "never sent notice",
        "none found", "none identified", "not received", "has not been approved", "have not been approved",
        "no technical substitution", "no substitution", "no change has been approved", "not on file",
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


_NORMATIVE = re.compile(
    r"\b(shall|must|is required to|are required to|will be required to|is to be|are to be)\b"
    r"|^\s*(any|each|every|all)\b[^.]*\b(shall|must)\b",
    re.IGNORECASE,
)


def is_normative_statement(statement: str) -> bool:
    """Wording that states what must or would happen, not what did happen.

    Used only as a guard against an affirmative project-fact label ("a CO was
    signed", "the work was completed") on a sentence such as "Any approved
    substitution shall be documented". It does not reclassify ordinary
    correspondence on its own.
    """
    return bool(_NORMATIVE.search(statement or ""))


_NOT_FOUND = re.compile(
    r"\bnot (?:found|located|identified|present|on file|included)\b"
    r"|\bnot in (?:the|our|this|that) [\w /-]{0,40}\b(?:folder|file|files|package|records?|register|set|transmittal|system|log)\b"
    r"|\bno [\w ,/-]{0,60}\b(?:found|identified|located)\b|\bnone (?:found|identified|located)\b",
    re.IGNORECASE,
)


def is_not_found_statement(statement: str) -> bool:
    """The source says something was not found in what was reviewed. That is
    absence from the records, not proof the thing does not exist."""
    return bool(_NOT_FOUND.search(statement or ""))
