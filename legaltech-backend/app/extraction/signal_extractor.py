from app.extraction.ai_signal_extractor import ai_candidates
from app.analysis.evidence_relationships import infer_document_extra_work_id
from app.extraction.schemas import SignalCandidate
from app.models import Document, ExtractedSignal
from app.parsers.base import ParsedContent
from app.services.hashing import stable_text_hash
import re


def extract_atomic_signals(document: Document, parsed_content: ParsedContent) -> list[ExtractedSignal]:
    candidates = _merge_candidates(ai_candidates(parsed_content.text), _heuristic_candidates(parsed_content.text))
    document_extra_work_id = infer_document_extra_work_id(parsed_content.text)
    filename_extra_work_id = infer_document_extra_work_id(
        str(getattr(document, "metadata", {}).get("original_filename", ""))
    )
    # An explicit EW in a source filename is document metadata, not free text;
    # it can disambiguate a change-order attachment that mentions another EW
    # only in a limiting clause.
    document_extra_work_id = filename_extra_work_id or document_extra_work_id
    for candidate in candidates:
        # A document-level identity is safe only when exactly one EW appears
        # in the document. Explicit AI/heuristic paragraph-level IDs win.
        if not candidate.extra_work_id and document_extra_work_id:
            candidate.extra_work_id = document_extra_work_id
    return [
        ExtractedSignal(
            signal_type=candidate.signal_type,
            value=_candidate_value(candidate, _explicit_date(candidate.source_text) or _explicit_date(parsed_content.text)),
            actor=candidate.actor,
            source_document_id=document.id,
            source_text=candidate.source_text,
            confidence=candidate.confidence,
            source_text_hash=stable_text_hash(candidate.source_text),
        )
        for candidate in candidates
        if _candidate_is_usable(candidate)
    ]


def _heuristic_candidates(text: str) -> list[SignalCandidate]:
    lowered = text.lower()
    candidates: list[SignalCandidate] = []

    if any(phrase in lowered for phrase in ["extra work", "additional work", "changed scope", "change in scope"]):
        candidates.append(
            SignalCandidate(
                signal_type="extra_work_detected",
                value=True,
                source_text=_snippet(text, ["extra work", "additional work", "changed scope", "change in scope"]),
                confidence=0.74,
            )
        )

    if any(phrase in lowered for phrase in ["additional cost", "additional costs", "extra compensation", "revised price"]):
        candidates.append(
            SignalCandidate(
                signal_type="cost_communication",
                value=True,
                source_text=_snippet(text, ["additional cost", "additional costs", "extra compensation", "revised price"]),
                confidence=0.74,
            )
        )

    if any(phrase in lowered for phrase in ["never approved", "not approved", "no approval", "without approval"]):
        candidates.append(
            SignalCandidate(
                signal_type="approval_denied",
                value=True,
                source_text=_snippet(text, ["never approved", "not approved", "no approval", "without approval"]),
                confidence=0.78,
            )
        )

    if "scheduling only" in lowered or "not additional cost" in lowered:
        candidates.append(
            SignalCandidate(
                signal_type="scheduling_only",
                value=True,
                source_text=_snippet(text, ["scheduling only", "not additional cost"]),
                confidence=0.78,
            )
        )

    if any(phrase in lowered for phrase in ["proceed", "keep the crew moving", "continue work"]):
        source_text = _snippet(text, ["proceed", "keep the crew moving", "continue work"])
        candidates.append(
            SignalCandidate(
                signal_type="instruction_to_proceed",
                value=True,
                source_text=source_text,
                confidence=0.72,
            )
        )
        candidates.append(
            SignalCandidate(
                signal_type="operational_direction",
                value=True,
                source_text=source_text,
                confidence=0.72,
            )
        )

    if any(phrase in lowered for phrase in ["schedule is not delayed", "schedule not delayed", "keep the crew moving", "accelerate"]):
        candidates.append(
            SignalCandidate(
                signal_type="schedule_pressure",
                value=True,
                source_text=_snippet(text, ["schedule is not delayed", "schedule not delayed", "keep the crew moving", "accelerate"]),
                confidence=0.7,
            )
        )

    # A future plan such as "after a signed change order" is not evidence
    # that a change order was actually signed. Keep this heuristic limited to
    # explicit execution/status language; the AI extractor handles nuanced
    # temporal and conditional phrasing when enabled.
    signed_document_phrases = [
        "signed change order is attached",
        "status: signed change order",
        "executed change order",
        "both parties signed",
        "owner signature",
        "contractor signature",
        "signed change document is attached",
    ]
    if any(phrase in lowered for phrase in signed_document_phrases):
        source_text = _snippet(text, signed_document_phrases)
        candidates.extend(
            [
                SignalCandidate(
                    signal_type="signed_change_order",
                    value=True,
                    source_text=source_text,
                    confidence=0.7,
                ),
                SignalCandidate(
                    signal_type="formal_change_document",
                    value=True,
                    source_text=source_text,
                    confidence=0.68,
                ),
            ]
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

    if any(phrase in lowered for phrase in ["approve", "approved", "authorization", "authorized"]):
        source_text = _snippet(text, ["approve", "approved", "authorization", "authorized"])
        candidates.append(
            SignalCandidate(
                signal_type="express_authorization",
                value=True,
                source_text=source_text,
                confidence=0.74,
            )
        )
        candidates.append(
            SignalCandidate(
                signal_type="price_approval",
                value="cost" in lowered or "$" in source_text,
                source_text=source_text,
                confidence=0.68,
            )
        )

    if any(phrase in lowered for phrase in ["authorized to approve", "delegated authority", "authorized approver"]):
        candidates.append(
            SignalCandidate(
                signal_type="actor_authority",
                value=True,
                source_text=_snippet(text, ["authorized to approve", "delegated authority", "authorized approver"]),
                confidence=0.72,
            )
        )

    if any(phrase in lowered for phrase in ["scheduling only", "not additional cost", "not extra cost", "not approve extra cost"]):
        candidates.append(
            SignalCandidate(
                signal_type="delegated_authority_limited",
                value=True,
                source_text=_snippet(text, ["scheduling only", "not additional cost", "not extra cost", "not approve extra cost"]),
                confidence=0.76,
            )
        )

    if any(phrase in lowered for phrase in ["not authorize", "unauthorized", "dispute", "never approved extra cost"]):
        candidates.append(
            SignalCandidate(
                signal_type="authorization_denial",
                value=True,
                source_text=_snippet(text, ["not authorize", "unauthorized", "dispute", "never approved extra cost"]),
                confidence=0.74,
            )
        )

    if any(phrase in lowered for phrase in [
        "written notice", "notice of change", "notice was provided",
        "no notice was sent", "no written notice", "notice was not sent", "never sent notice",
    ]):
        if _negative_notice(lowered):
            candidates.append(
                SignalCandidate(
                    signal_type="notice_denied",
                    value=True,
                    source_text=_snippet(text, ["no notice was sent", "no written notice", "notice was not sent", "never sent notice"]),
                    confidence=0.8,
                )
            )
        else:
            candidates.append(
                SignalCandidate(
                    signal_type="written_notice",
                    value=True,
                    source_text=_snippet(text, ["written notice", "notice of change", "notice was provided"]),
                    confidence=0.68,
                )
            )

    if "see attached" in lowered or "attached" in lowered:
        if any(phrase in lowered for phrase in ["no attachment", "missing attachment", "attachment missing"]):
            candidates.append(
                SignalCandidate(
                    signal_type="attachment_missing",
                    value=True,
                    source_text=_snippet(text, ["no attachment", "missing attachment", "attachment missing"]),
                    confidence=0.8,
                )
            )
        if any(phrase in lowered for phrase in ["unsigned", "not signed"]):
            candidates.append(
                SignalCandidate(
                    signal_type="attachment_unsigned",
                    value=True,
                    source_text=_snippet(text, ["unsigned", "not signed"]),
                    confidence=0.78,
                )
            )

    candidates.extend(_amount_candidates(text))
    candidates.extend(_identifier_candidates(text))
    return candidates


def _merge_candidates(*groups: list[SignalCandidate]) -> list[SignalCandidate]:
    merged: list[SignalCandidate] = []
    seen: set[tuple[str, str]] = set()
    for group in groups:
        for candidate in group:
            key = (candidate.signal_type, candidate.source_text.strip().lower())
            if key in seen:
                continue
            seen.add(key)
            merged.append(candidate)
    return merged


def _candidate_value(candidate: SignalCandidate, event_at: str | None = None):
    value = dict(candidate.value) if isinstance(candidate.value, dict) else {"value": candidate.value}
    value["polarity"] = candidate.polarity
    value["temporal_status"] = candidate.temporal_status
    if candidate.extra_work_id:
        value["extra_work_id"] = candidate.extra_work_id
    if event_at:
        value["event_at"] = event_at
    return value


def _explicit_date(text: str) -> str | None:
    """Return a human-readable date only when the source text states one."""
    match = re.search(
        r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
        r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|"
        r"Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{4}-\d{2}-\d{2}\b",
        text,
        re.IGNORECASE,
    )
    return match.group(0) if match else None


def _candidate_is_usable(candidate: SignalCandidate) -> bool:
    """Do not turn future or conditional language into completed actions."""
    action_signals = {
        "signed_change_order", "price_approval", "approved_amount",
        "express_authorization", "written_authorization",
    }
    if candidate.signal_type not in action_signals:
        return True
    if candidate.polarity == "negative":
        return False
    return candidate.temporal_status not in {"planned", "denied", "conditional"}


def _negative_notice(lowered_text: str) -> bool:
    return any(phrase in lowered_text for phrase in (
        "no notice was sent", "no written notice", "notice was not sent", "never sent notice",
    ))


def _amount_candidates(text: str) -> list[SignalCandidate]:
    candidates: list[SignalCandidate] = []
    lowered = text.lower()
    for match in re.finditer(r"\$\s?([0-9][0-9,]*(?:\.\d{2})?)", text):
        source_text = _window(text, match.start(), 100)
        amount = float(match.group(1).replace(",", ""))
        local = source_text.lower()
        if any(word in local for word in ["invoice", "amount due", "payment application"]):
            signal_type = "invoice_amount"
        elif any(word in local for word in ["approve", "approved", "authorized"]):
            signal_type = "approved_amount"
        elif any(word in local for word in ["estimate", "proposal", "quote"]):
            signal_type = "estimate_amount"
        elif any(word in local for word in ["adjustment to contract price", "price adjustment", "lump sum"]):
            signal_type = "approved_amount"
        else:
            continue
        candidates.append(
            SignalCandidate(
                signal_type=signal_type,
                value=amount,
                source_text=source_text,
                confidence=0.72,
            )
        )
    if any(phrase in lowered for phrase in ["time and materials", "t&m", "unit price", "lump sum"]):
        candidates.append(
            SignalCandidate(
                signal_type="pricing_method",
                value=True,
                source_text=_snippet(text, ["time and materials", "t&m", "unit price", "lump sum"]),
                confidence=0.7,
            )
        )
    return candidates


def _identifier_candidates(text: str) -> list[SignalCandidate]:
    candidates: list[SignalCandidate] = []
    for signal_type, pattern in {
        "project_number": r"\b(?:P|PRJ)-\d{2,}\b",
        "po_number": r"\bPO[-\s]?\d{2,}\b",
    }.items():
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            candidates.append(
                SignalCandidate(
                    signal_type=signal_type,
                    value=match.group(0).upper().replace(" ", "-"),
                    source_text=_window(text, match.start(), 80),
                    confidence=0.68,
                )
            )
    return candidates


def _snippet(text: str, phrases: list[str], radius: int = 180) -> str:
    lowered = text.lower()
    index = next((lowered.find(phrase) for phrase in phrases if phrase in lowered), 0)
    start = max(index, 0)
    return text[start : start + radius].strip()


def _window(text: str, index: int, radius: int) -> str:
    start = max(index - radius, 0)
    end = min(index + radius, len(text))
    return text[start:end].strip()
