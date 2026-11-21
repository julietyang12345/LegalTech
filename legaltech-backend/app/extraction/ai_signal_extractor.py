import json
import logging
from typing import Any

from openai import OpenAI, OpenAIError
from pydantic import ValidationError

from app.core.config import get_settings
from app.extraction.schemas import SignalCandidate

logger = logging.getLogger(__name__)


ALLOWED_SIGNAL_TYPES = {
    "operational_direction",
    "instruction_to_proceed",
    "express_authorization",
    "signed_change_order",
    "authorization_denial",
    "delegated_authority_limited",
    "invoice_submitted",
    "invoice_support",
    "estimate_amount",
    "approved_amount",
    "invoice_amount",
    "pricing_method",
    "price_approval",
    "actor_authority",
    "written_authorization",
    "owner_awareness",
    "schedule_pressure",
    "formal_change_document",
    "written_notice",
    "extra_work_detected",
    "cost_communication",
    "approval_denied",
    "scheduling_only",
    "notice_denied",
    "attachment_missing",
    "attachment_unsigned",
    "project_number",
    "po_number",
    "project_mismatch",
    "amount_mismatch",
    "invoice_before_authorization",
    "work_performed",
    "work_planned",
    "pricing_unresolved",
}


SYSTEM_PROMPT = """You extract audit-ready evidence risk signals.
Return only JSON with a top-level "signals" array. Each signal must include:
signal_type, value, actor, source_text, confidence, extra_work_id, polarity,
temporal_status, event_at. confidence is a number between 0 and 1. event_at is
the date the source states for the fact itself (not the document upload date).
Use only these signal_type values:
operational_direction, instruction_to_proceed, express_authorization,
signed_change_order, authorization_denial, delegated_authority_limited,
invoice_submitted, invoice_support, estimate_amount, approved_amount,
invoice_amount, pricing_method, price_approval, actor_authority,
written_authorization, owner_awareness, schedule_pressure,
formal_change_document, written_notice, attachment_missing,
attachment_unsigned, extra_work_detected, cost_communication, approval_denied,
scheduling_only, notice_denied, project_number, po_number, project_mismatch,
amount_mismatch, invoice_before_authorization, work_performed, work_planned,
pricing_unresolved.
source_text must be an exact excerpt from the document. Do not infer facts that
are not supported by an excerpt. Use polarity affirmative, negative, or
uncertain. Use temporal_status completed, planned, conditional, denied, or
unknown. A phrase about signing in the future is planned, not signed. A
contractual rule describing what would count as approval is normative context,
not a project-specific denial. Use pricing_unresolved for language that says
price, cost, numbers, or amount is not yet determined; do not label that as
cost_communication or price_approval. Use work_planned for scheduled or
intended work and work_performed only for work explicitly completed. A go-ahead
or field direction is not price approval without explicit price approval and
authority evidence. Preserve the actor, Extra Work ID, and event date when the
source states them."""


def ai_candidates(text: str) -> list[SignalCandidate]:
    settings = get_settings()
    if not settings.ai_extraction_enabled or not settings.openai_api_key:
        logger.info(
            "[ai-extraction] skipped enabled=%s key_present=%s",
            settings.ai_extraction_enabled, bool(settings.openai_api_key),
        )
        return []

    document_text = text[: settings.ai_extraction_max_chars]
    client = OpenAI(api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds)

    try:
        response = client.chat.completions.create(
            model=settings.openai_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": (
                        "Extract evidence risk signals from this document:\n\n"
                        f"{document_text}"
                    ),
                },
            ],
        )
    except OpenAIError as error:
        logger.warning("[ai-extraction] provider call failed error_type=%s", type(error).__name__)
        return []

    try:
        content = response.choices[0].message.content
    except (AttributeError, IndexError):
        return []
    if not content:
        logger.warning("[ai-extraction] provider returned empty content")
        return []

    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("[ai-extraction] provider returned invalid JSON")
        return []

    signals = payload.get("signals", [])
    if not isinstance(signals, list):
        logger.warning("[ai-extraction] provider returned non-list signals")
        return []

    candidates: list[SignalCandidate] = []
    for item in signals:
        candidate = _candidate_from_item(item, document_text)
        if candidate:
            candidates.append(candidate)
    logger.info("[ai-extraction] candidates accepted=%d returned=%d", len(candidates), len(signals))
    return candidates


_CONFIDENCE_WORDS = {"very high": 0.95, "high": 0.9, "medium": 0.6, "moderate": 0.6, "low": 0.3, "very low": 0.1}


def _confidence(value: Any) -> float | None:
    """Accept numeric or verbal confidence; models often answer "high".

    Dropping an otherwise source-verified fact because confidence was a word
    silently removes evidence (CO-05: every email lost its signals).
    """
    if isinstance(value, str):
        word = value.strip().lower().rstrip("%")
        if word in _CONFIDENCE_WORDS:
            return _CONFIDENCE_WORDS[word]
        value = word
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number > 1 and number <= 100:
        number /= 100
    return max(0.0, min(1.0, number))


def _candidate_from_item(item: Any, text: str) -> SignalCandidate | None:
    if not isinstance(item, dict):
        return None

    signal_type = item.get("signal_type")
    source_text = item.get("source_text")
    confidence = item.get("confidence", 0)
    if signal_type not in ALLOWED_SIGNAL_TYPES or not isinstance(source_text, str):
        return None
    if not source_text.strip() or source_text not in text:
        return None

    normalized_confidence = _confidence(confidence)
    if normalized_confidence is None:
        logger.info("[ai-extraction] dropped signal with unusable confidence=%r", confidence)
        return None

    try:
        polarity = str(item.get("polarity") or "unknown").lower()
        temporal_status = str(item.get("temporal_status") or "unknown").lower()
        if polarity not in {"affirmative", "negative", "uncertain", "unknown"}:
            return None
        if temporal_status not in {"completed", "planned", "conditional", "denied", "unknown"}:
            return None
        return SignalCandidate(
            signal_type=signal_type,
            value=item.get("value"),
            actor=item.get("actor"),
            source_text=source_text.strip(),
            confidence=normalized_confidence,
            polarity=polarity,
            temporal_status=temporal_status,
            extra_work_id=item.get("extra_work_id"),
            event_at=item.get("event_at"),
        )
    except ValidationError:
        return None
