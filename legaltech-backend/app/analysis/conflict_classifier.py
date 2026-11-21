from datetime import datetime

from app.domain_contracts.schemas import ConflictClassification, EvidenceAssertion
from app.analysis.text_semantics import is_explicit_denial
from app.analysis.event_time import parse_event_date


def validate_ai_relationship(source: EvidenceAssertion, target: EvidenceAssertion, relation: str) -> tuple[ConflictClassification | None, str | None]:
    """Validate an AI-proposed later->earlier relationship.

    The model proposes meaning; this function verifies identity and ordering.
    A missing material fact returns an unresolved reason instead of promoting
    the proposal to a legal conflict.
    """
    if source.tenant_id != target.tenant_id or source.matter_id != target.matter_id:
        return None, "CROSS_MATTER_SCOPE"
    source_scope, target_scope = _scope(source), _scope(target)
    if source_scope and target_scope and source_scope != target_scope:
        return ConflictClassification.different_scope, "DIFFERENT_SCOPE"
    if not source_scope or not target_scope:
        return None, "UNRESOLVED_SCOPE"
    source_date, target_date = _date(source), _date(target)
    if not source_date or not target_date:
        return None, "TEMPORAL_ORDER_UNCERTAIN"
    if source_date <= target_date:
        return None, "INVALID_RELATION_ORDER"
    if relation.upper() in {"MODIFIES", "SUPERSEDES", "REVOKES"}:
        return ConflictClassification.later_modification, None
    return None, "UNSUPPORTED_RELATION"


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
    value = (
        assertion.price_approved_at
        or assertion.price_communicated_at
        or assertion.work_start_at
        or assertion.work_planned_at
        or assertion.work_completed_at
        or assertion.event_at
        or assertion.document_sent_at
    )
    if not value:
        raw = assertion.value if isinstance(assertion.value, dict) else {}
        value = raw.get("event_at") or raw.get("communication_at")
    if not value:
        return assertion.asserted_at
    parsed = parse_event_date(str(value), reference_at=assertion.uploaded_at)
    return datetime.combine(parsed, datetime.min.time()) if parsed else None


def _authority_limited(assertion: EvidenceAssertion) -> bool:
    text = assertion.statement.lower()
    return any(term in text for term in ("scheduling only", "not authorized to approve", "without authority"))
