import logging
import re
from pathlib import Path

from app.analysis.evidence_relationships import infer_document_extra_work_id, normalize_extra_work_id
from app.analysis.text_semantics import is_negative_statement, is_normative_statement
from app.extraction.ai_signal_extractor import ALLOWED_SIGNAL_TYPES
from app.models import Document, ExtractedSignal

logger = logging.getLogger(__name__)


def validate_signals(document: Document, signals: list[ExtractedSignal]) -> list[ExtractedSignal]:
    source_text = _read_source(document)
    document_ew = infer_document_extra_work_id(source_text)
    valid: list[ExtractedSignal] = []
    for signal in signals:
        reason = _rejection_reason(document, signal, source_text, document_ew)
        if reason:
            logger.warning(
                "[validation] signal rejected document_id=%s signal_type=%s reason=%s",
                document.id, signal.signal_type, reason,
            )
            continue
        valid.append(signal)
    logger.info(
        "[validation] signals accepted document_id=%s accepted=%d rejected=%d",
        document.id, len(valid), len(signals) - len(valid),
    )
    return valid


def _rejection_reason(document, signal, source_text: str, document_ew: str | None) -> str | None:
    if signal.source_document_id != document.id:
        return "source_document_mismatch"
    if not signal.source_text or signal.source_text not in source_text:
        return "source_excerpt_not_found"
    if signal.confidence < 0.5:
        return "confidence_below_threshold"
    if signal.signal_type not in ALLOWED_SIGNAL_TYPES:
        return "unsupported_signal_type"

    value = signal.value if isinstance(signal.value, dict) else {}
    candidate_ew = value.get("extra_work_id")
    if candidate_ew and document_ew and normalize_extra_work_id(str(candidate_ew)) != document_ew:
        return "extra_work_mismatch"

    _guard_normative(signal, value)
    _guard_unsupported_normative(document, signal, value)
    polarity = str(value.get("polarity", "unknown")).lower()
    temporal_status = str(value.get("temporal_status", "unknown")).lower()
    if temporal_status == "normative":
        # Kept as a contract requirement (normative role), never a project fact.
        return None
    affirmative_types = {"express_authorization", "price_approval", "signed_change_order", "approved_amount"}
    if signal.signal_type in CHANGE_FACT_TYPES and is_negative_statement(signal.source_text):
        # "Owner change to investigation scope | None found" records that no
        # change exists. It must not become extra work or an approval.
        return "negative_statement_for_affirmative_change_signal"
    if signal.signal_type in affirmative_types and polarity == "negative":
        return "negative_polarity_for_affirmative_signal"
    if signal.signal_type in affirmative_types and temporal_status in {"planned", "conditional", "denied"}:
        return "non_completed_temporal_status_for_affirmative_signal"
    if signal.signal_type == "work_performed" and _is_document_transfer_only(signal.source_text):
        # "We sent the field logs" moves documents; it is not the work itself.
        return "document_transfer_is_not_work_performed"
    if signal.signal_type == "written_notice" and not _states_notice_given(signal.source_text):
        return "correspondence_is_not_a_notice"
    if signal.signal_type == "pricing_unresolved" and polarity == "negative":
        return "negative_polarity_for_unresolved_pricing"
    return None


# Types that assert something happened. A modal sentence ("shall be signed",
# "any approved substitution shall be documented") cannot be one of them.
COMPLETED_FACT_TYPES = {
    "signed_change_order", "price_approval", "approved_amount", "express_authorization",
    "written_authorization", "formal_change_document", "work_performed", "completed_quantity",
    "deliverable_status", "scope_substitution",
}
CHANGE_FACT_TYPES = {
    "signed_change_order", "price_approval", "approved_amount", "express_authorization",
    "written_authorization", "formal_change_document", "extra_work_detected", "instruction_to_proceed",
}


def _guard_normative(signal, value: dict) -> None:
    """Reclassify a completed-fact label on normative wording as a requirement."""
    if signal.signal_type not in COMPLETED_FACT_TYPES or not isinstance(signal.value, dict):
        return
    if str(value.get("temporal_status", "")).lower() == "normative":
        return
    if is_normative_statement(signal.source_text):
        signal.value["model_temporal_status"] = value.get("temporal_status")
        signal.value["temporal_status"] = "normative"
        signal.value["normative_reason"] = "modal_wording_for_completed_fact_type"
        logger.warning(
            "[validation] completed-fact label on normative wording reclassified signal_type=%s",
            signal.signal_type,
        )


def _guard_unsupported_normative(document, signal, value: dict) -> None:
    """In a project document, "normative" needs rule wording. A model that
    calls "No substitution has been approved" normative has mislabelled a fact."""
    from app.analysis.evidence_relationships import is_normative_document

    if str(value.get("temporal_status", "")).lower() != "normative" or not isinstance(signal.value, dict):
        return
    if is_normative_document(document) or is_normative_statement(signal.source_text):
        return
    signal.value["model_temporal_status"] = "normative"
    signal.value["temporal_status"] = "denied" if is_negative_statement(signal.source_text) else "unknown"
    if is_negative_statement(signal.source_text):
        signal.value["polarity"] = "negative"


def _read_source(document: Document) -> str:
    try:
        return Path(document.storage_path).read_text(encoding="utf-8", errors="replace")
    except (OSError, TypeError):
        return ""


_TRANSFER = re.compile(r"\b(?:sent|send|forwarded|emailed|transmitted|attached|enclosed|shared|uploaded|submitted)\b", re.IGNORECASE)
_PHYSICAL = re.compile(
    r"\b(?:installed|constructed|built|excavated|drilled|poured|tested|sampled|inspected|replaced|repaired|"
    r"demolished|removed|performed|completed|finished|carried out)\b", re.IGNORECASE,
)
_NOTICE_WORD = re.compile(r"\b(?:notice|notified|notifies|notify|notification)\b", re.IGNORECASE)
_NOTICE_ACT = re.compile(r"\b(?:give|gives|gave|given|giving|issue|issued|serve|served|provide|provided|send|sent|submit|submitted|receive|received|hereby)\b", re.IGNORECASE)


def _is_document_transfer_only(statement: str) -> bool:
    return bool(_TRANSFER.search(statement or "")) and not _PHYSICAL.search(statement or "")


def _states_notice_given(statement: str) -> bool:
    """A notice signal needs notice wording and an act of giving it; an email
    that merely exists, or a request, is not a contractual notice."""
    return bool(_NOTICE_WORD.search(statement or "") and _NOTICE_ACT.search(statement or ""))
