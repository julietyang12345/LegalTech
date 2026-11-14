"""Small, explicit relationship helpers for evidence scoping."""

import re
from typing import Any

from app.domain_contracts.schemas import EvidenceRole
from app.models import Document


_EXTRA_WORK_ID = re.compile(r"(?<![A-Z0-9])EW[- ]?[0-9][A-Z0-9]*(?![A-Z0-9])", re.IGNORECASE)


def infer_extra_work_id(value: Any, text: str = "") -> str | None:
    """Extract an EW identifier without inventing one from unrelated text."""
    if isinstance(value, dict):
        for key in ("extra_work_id", "extra_work", "ew_id"):
            candidate = value.get(key)
            if candidate:
                return normalize_extra_work_id(str(candidate))
    identifiers = {
        normalize_extra_work_id(match.group(0))
        for match in _EXTRA_WORK_ID.finditer(text or "")
    }
    # A broad source excerpt can mention several EWs. Do not attach it to the
    # first identifier; paragraph-level/AI extraction must disambiguate it.
    return next(iter(identifiers)) if len(identifiers) == 1 else None


def infer_document_extra_work_id(text: str) -> str | None:
    """Return a document-level EW identity only when the document is unambiguous."""
    identifiers = {
        normalize_extra_work_id(match.group(0))
        for match in _EXTRA_WORK_ID.finditer(text or "")
    }
    return next(iter(identifiers)) if len(identifiers) == 1 else None


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
