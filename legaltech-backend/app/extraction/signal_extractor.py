from app.extraction.schemas import SignalCandidate
from app.models import Document, ExtractedSignal
from app.parsers.base import ParsedContent
from app.services.hashing import stable_text_hash


def extract_atomic_signals(document: Document, parsed_content: ParsedContent) -> list[ExtractedSignal]:
    candidates = _heuristic_candidates(parsed_content.text)
    return [
        ExtractedSignal(
            signal_type=candidate.signal_type,
            value=candidate.value,
            actor=candidate.actor,
            source_document_id=document.id,
            source_text=candidate.source_text,
            confidence=candidate.confidence,
            source_text_hash=stable_text_hash(candidate.source_text),
        )
        for candidate in candidates
    ]


def _heuristic_candidates(text: str) -> list[SignalCandidate]:
    lowered = text.lower()
    candidates: list[SignalCandidate] = []

    if any(phrase in lowered for phrase in ["proceed", "keep the crew moving", "continue work"]):
        candidates.append(
            SignalCandidate(
                signal_type="instruction_to_proceed",
                value=True,
                source_text=_snippet(text, ["proceed", "keep the crew moving", "continue work"]),
                confidence=0.72,
            )
        )

    if any(phrase in lowered for phrase in ["signed change order", "executed change order"]):
        candidates.append(
            SignalCandidate(
                signal_type="signed_change_order",
                value=True,
                source_text=_snippet(text, ["signed change order", "executed change order"]),
                confidence=0.7,
            )
        )

    if any(phrase in lowered for phrase in ["invoice", "amount due", "payment application"]):
        candidates.append(
            SignalCandidate(
                signal_type="invoice_submitted",
                value=True,
                source_text=_snippet(text, ["invoice", "amount due", "payment application"]),
                confidence=0.68,
            )
        )

    if any(phrase in lowered for phrase in ["not authorize", "unauthorized", "dispute"]):
        candidates.append(
            SignalCandidate(
                signal_type="authorization_denial",
                value=True,
                source_text=_snippet(text, ["not authorize", "unauthorized", "dispute"]),
                confidence=0.74,
            )
        )

    return candidates


def _snippet(text: str, phrases: list[str], radius: int = 180) -> str:
    lowered = text.lower()
    index = next((lowered.find(phrase) for phrase in phrases if phrase in lowered), 0)
    start = max(index, 0)
    return text[start : start + radius].strip()
