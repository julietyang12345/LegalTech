"""Small, explicit relationship helpers for evidence scoping."""

import re
from typing import Any

from app.domain_contracts.schemas import EvidenceRole
from app.models import Document


_EXTRA_WORK_ID = re.compile(r"\bEW[- ]?[A-Z0-9]+\b", re.IGNORECASE)


def infer_extra_work_id(value: Any, text: str = "") -> str | None:
    """Extract an EW identifier without inventing one from unrelated text."""
    if isinstance(value, dict):
        for key in ("extra_work_id", "extra_work", "ew_id"):
            candidate = value.get(key)
            if candidate:
                return normalize_extra_work_id(str(candidate))
    match = _EXTRA_WORK_ID.search(text)
    return normalize_extra_work_id(match.group(0)) if match else None


def normalize_extra_work_id(value: str) -> str:
    value = value.strip().upper().replace(" ", "-")
    return value if value.startswith("EW-") else value.replace("EW", "EW-", 1)


def evidence_role_for_document(document: Document) -> EvidenceRole:
    """Contract text describes obligations; other files describe project facts."""
    return (
        EvidenceRole.normative_rule
        if document.document_type.value == "contract"
        else EvidenceRole.project_fact
    )


def assertion_scope(assertion) -> str | None:
    if getattr(assertion, "extra_work_id", None):
        return normalize_extra_work_id(assertion.extra_work_id)
    value = getattr(assertion, "value", None)
    if isinstance(value, dict):
        candidate = value.get("extra_work_id") or value.get("extra_work") or value.get("ew_id")
        if candidate:
            return normalize_extra_work_id(str(candidate))
    return None


def assertion_event_scope(assertion) -> str | None:
    value = getattr(assertion, "value", None)
    if isinstance(value, dict):
        event_id = value.get("change_event_id") or value.get("event_id")
        if event_id:
            return str(event_id)
    return None
