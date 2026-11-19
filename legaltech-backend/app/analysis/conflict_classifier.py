from datetime import datetime

from app.domain_contracts.schemas import ConflictClassification, EvidenceAssertion
from app.analysis.text_semantics import is_explicit_denial


def classify_conflict(supporting: EvidenceAssertion, contrary: EvidenceAssertion) -> ConflictClassification:
    """Classify two same-scope assertions without deciding legal effect."""
    if _scope(supporting) and _scope(contrary) and _scope(supporting) != _scope(contrary):
        return ConflictClassification.different_scope
    support_date = _date(supporting)
    contrary_date = _date(contrary)
    contrary_text = contrary.statement.lower()
    if any(term in contrary_text for term in ("revoke", "withdraw", "supersede", "no longer", "changed to")):
        return ConflictClassification.later_modification
    if support_date and contrary_date and contrary_date > support_date and is_explicit_denial(contrary.statement):
        return ConflictClassification.temporal_supersession
    if _authority_limited(supporting) != _authority_limited(contrary) and (
        _authority_limited(supporting) or _authority_limited(contrary)
    ):
        return ConflictClassification.authority_conflict
    return ConflictClassification.direct_conflict


def _scope(assertion: EvidenceAssertion) -> str | None:
    value = assertion.value if isinstance(assertion.value, dict) else {}
    return assertion.extra_work_id or value.get("extra_work_id")


def _date(assertion: EvidenceAssertion) -> datetime | None:
    value = assertion.event_at or assertion.document_sent_at
    if not value:
        raw = assertion.value if isinstance(assertion.value, dict) else {}
        value = raw.get("event_at") or raw.get("communication_at")
    if not value:
        return assertion.asserted_at
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _authority_limited(assertion: EvidenceAssertion) -> bool:
    text = assertion.statement.lower()
    return any(term in text for term in ("scheduling only", "not authorized to approve", "without authority"))
