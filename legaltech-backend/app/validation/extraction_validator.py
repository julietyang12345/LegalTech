import logging
from pathlib import Path

from app.analysis.evidence_relationships import infer_document_extra_work_id, normalize_extra_work_id
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

    polarity = str(value.get("polarity", "unknown")).lower()
    temporal_status = str(value.get("temporal_status", "unknown")).lower()
    affirmative_types = {"express_authorization", "price_approval", "signed_change_order", "approved_amount"}
    if signal.signal_type in affirmative_types and polarity == "negative":
        return "negative_polarity_for_affirmative_signal"
    if signal.signal_type in affirmative_types and temporal_status in {"planned", "conditional", "denied"}:
        return "non_completed_temporal_status_for_affirmative_signal"
    if signal.signal_type == "pricing_unresolved" and polarity == "negative":
        return "negative_polarity_for_unresolved_pricing"
    return None


def _read_source(document: Document) -> str:
    try:
        return Path(document.storage_path).read_text(encoding="utf-8", errors="replace")
    except (OSError, TypeError):
        return ""
