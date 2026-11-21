from app.models import Document, ExtractedSignal
from app.models.domain import DocumentType
from app.parsers.base import ParsedContent
from app.repositories.memory import store
from app.services.hashing import stable_text_hash


def reconcile_cross_document_signals(
    document: Document,
    parsed_content: ParsedContent,
    change_event_id: str | None,
) -> list[ExtractedSignal]:
    if not change_event_id:
        return []

    signals = [
        signal for signal in store.signals.values() if signal.change_event_id == change_event_id
    ]
    candidates: list[ExtractedSignal] = []
    candidates.extend(_amount_mismatch_signals(document, change_event_id, signals))
    attachment_signal = _missing_attachment_signal(document, parsed_content, change_event_id)
    if attachment_signal:
        candidates.append(attachment_signal)
    return [signal for signal in candidates if not _already_exists(signal)]


def _amount_mismatch_signals(
    document: Document,
    change_event_id: str,
    signals: list[ExtractedSignal],
) -> list[ExtractedSignal]:
    invoice_amounts = _numeric_signals(signals, "invoice_amount")
    approved_amounts = _numeric_signals(signals, "approved_amount")
    if not invoice_amounts or not approved_amounts:
        return []

    highest_invoice = max(invoice_amounts, key=lambda item: item[0])
    highest_approved = max(approved_amounts, key=lambda item: item[0])
    if highest_invoice[0] <= highest_approved[0]:
        return []

    source_text = highest_invoice[1].source_text
    return [
        ExtractedSignal(
            change_event_id=change_event_id,
            signal_type="amount_mismatch",
            value={
                "invoice_amount": highest_invoice[0],
                "approved_amount": highest_approved[0],
            },
            source_document_id=highest_invoice[1].source_document_id or document.id,
            source_text=source_text,
            confidence=0.82,
            source_text_hash=stable_text_hash(source_text),
        )
    ]


def _missing_attachment_signal(
    document: Document,
    parsed_content: ParsedContent,
    change_event_id: str,
) -> ExtractedSignal | None:
    if document.document_type != DocumentType.email:
        return None
    lowered = parsed_content.text.lower()
    if "attached" not in lowered and "see attached" not in lowered:
        return None
    attachment_count = document.metadata.get("attachment_count", 0)
    if attachment_count:
        return None

    source_text = _snippet(parsed_content.text, ["see attached", "attached"])
    return ExtractedSignal(
        change_event_id=change_event_id,
        signal_type="attachment_missing",
        value=True,
        source_document_id=document.id,
        source_text=source_text,
        confidence=0.78,
        source_text_hash=stable_text_hash(source_text),
    )


def _numeric_signals(signals: list[ExtractedSignal], signal_type: str) -> list[tuple[float, ExtractedSignal]]:
    values: list[tuple[float, ExtractedSignal]] = []
    for signal in signals:
        if signal.signal_type != signal_type:
            continue
        try:
            raw = signal.value.get("value") if isinstance(signal.value, dict) else signal.value
            values.append((float(raw), signal))
        except (TypeError, ValueError):
            continue
    return values


def _already_exists(signal: ExtractedSignal) -> bool:
    key = f"{signal.source_document_id}:{signal.signal_type}:{signal.source_text_hash}"
    return key in store.signals


def _snippet(text: str, phrases: list[str], radius: int = 180) -> str:
    lowered = text.lower()
    index = next((lowered.find(phrase) for phrase in phrases if phrase in lowered), 0)
    start = max(index, 0)
    return text[start : start + radius].strip()
