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


_NORMATIVE_KINDS = ("contract", "agreement", "exhibit", "specification", "general conditions", "supplementary conditions")


def is_normative_document(document: Document) -> bool:
    """Contract documents: the upload type, or the kind the document states in
    its own header ("DOCUMENT TYPE: Contract exhibit"). A contract exhibit
    uploaded as "other" still describes obligations, not project facts."""
    if document.document_type.value == "contract":
        return True
    declared = str(document.metadata.get("declared_kind") or "").lower()
    return any(kind in declared for kind in _NORMATIVE_KINDS)


def evidence_role_for_document(document: Document, value: Any = None) -> EvidenceRole:
    """Contract text describes obligations; other files describe project facts.

    A single statement flagged normative (``temporal_status == "normative"``)
    is a requirement wherever it appears, and is never a project fact.
    """
    if is_normative_document(document):
        return EvidenceRole.normative_rule
    if isinstance(value, dict) and str(value.get("temporal_status", "")).lower() == "normative":
        return EvidenceRole.normative_rule
    return EvidenceRole.project_fact


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


# Types whose name already says the thing was refused or is missing.
INHERENTLY_NEGATIVE_TYPES = {"approval_denied", "authorization_denial", "notice_denied", "pricing_unresolved"}


def assertion_modality(assertion) -> str:
    """How a statement relates to what it names, for display.

    REQUIREMENT (contract wording), NEGATIVE (the source says it did not
    happen / is absent), CONDITIONAL (only if something else holds),
    PLANNED (not yet happened), or STATED. A signal type alone ("scope
    substitution") must not be read as the thing having happened.
    """
    from app.analysis.text_semantics import is_conditional_statement, is_explicit_denial

    value = assertion.value if isinstance(assertion.value, dict) else {}
    temporal = value.get("temporal_status")
    if assertion.evidence_role == EvidenceRole.normative_rule:
        return "REQUIREMENT"
    if assertion.assertion_type not in INHERENTLY_NEGATIVE_TYPES and (
        value.get("polarity") == "negative" or temporal == "denied" or is_explicit_denial(assertion.statement)
    ):
        return "NEGATIVE"
    if temporal == "conditional" or is_conditional_statement(assertion.statement):
        return "CONDITIONAL"
    if temporal == "planned" or assertion.assertion_type in {"work_planned", "milestone_planned"}:
        return "PLANNED"
    return "STATED"
