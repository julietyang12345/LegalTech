"""Convert AI evidence candidates into source-linked extracted signals.

Semantic facts come from the AI extractor. This module only adds deterministic
metadata that can be verified without interpreting legal language: explicit
dates, project/PO identifiers, and an unambiguous Extra Work identity.
"""

import logging
import re

from app.analysis.evidence_relationships import infer_document_extra_work_id, normalize_extra_work_id
from app.extraction.ai_signal_extractor import ai_candidates
from app.extraction.schemas import SignalCandidate
from app.models import Document, ExtractedSignal
from app.parsers.base import ParsedContent
from app.services.hashing import stable_text_hash

logger = logging.getLogger(__name__)


def extract_atomic_signals(document: Document, parsed_content: ParsedContent) -> list[ExtractedSignal]:
    ai = ai_candidates(parsed_content.text)
    candidates = _merge_candidates(ai, _identifier_candidates(parsed_content.text))
    if not ai:
        logger.warning(
            "[extraction] no semantic AI signals document_id=%s filename=%s; deterministic metadata only",
            document.id, getattr(document, "metadata", {}).get("original_filename"),
        )

    document_ew_id = infer_document_extra_work_id(parsed_content.text)
    filename_ew_id = infer_document_extra_work_id(str(getattr(document, "metadata", {}).get("original_filename", "")))
    document_ew_id = filename_ew_id or document_ew_id
    for candidate in candidates:
        if not candidate.extra_work_id and document_ew_id:
            candidate.extra_work_id = document_ew_id

    return [
        ExtractedSignal(
            signal_type=candidate.signal_type,
            value=_candidate_value(
                candidate,
                candidate.event_at or _explicit_date(candidate.source_text)
                or _explicit_date_for_candidate(parsed_content.text, candidate.source_text),
            ),
            actor=candidate.actor,
            source_document_id=document.id,
            source_text=candidate.source_text,
            confidence=candidate.confidence,
            source_text_hash=stable_text_hash(candidate.source_text),
        )
        for candidate in candidates
        # Semantic validity is enforced once, centrally, by extraction_validator.
    ]


def _merge_candidates(*groups: list[SignalCandidate]) -> list[SignalCandidate]:
    merged: list[SignalCandidate] = []
    seen: set[tuple[str, str]] = set()
    for group in groups:
        for candidate in group:
            key = (candidate.signal_type, candidate.source_text.strip().lower())
            if key not in seen:
                seen.add(key)
                merged.append(candidate)
    return merged


def _candidate_value(candidate: SignalCandidate, event_at: str | None = None):
    value = dict(candidate.value) if isinstance(candidate.value, dict) else {"value": candidate.value}
    value["polarity"] = candidate.polarity
    value["temporal_status"] = candidate.temporal_status
    if candidate.extra_work_id:
        value["extra_work_id"] = normalize_extra_work_id(candidate.extra_work_id)
    if event_at:
        value["event_at"] = event_at
    return value


def _explicit_date(text: str) -> str | None:
    match = re.search(
        r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
        r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|"
        r"Dec(?:ember)?)\s+\d{1,2}(?:,?\s+\d{4})?\b|\b\d{4}-\d{2}-\d{2}\b",
        text,
        re.IGNORECASE,
    )
    return match.group(0) if match else None


def _explicit_date_for_candidate(document_text: str, source_text: str) -> str | None:
    """Find a date in the source sentence immediately introducing an excerpt.

    AI source spans are intentionally required to be exact excerpts, but a
    model may omit a leading date such as ``Feb 3:`` from the span. Only the
    local sentence/line prefix is considered, so a later date elsewhere in the
    document cannot be assigned to the signal.
    """
    start = document_text.find(source_text)
    if start < 0:
        return None
    prefix = document_text[:start]
    boundary = max(prefix.rfind("\n"), prefix.rfind("."), prefix.rfind("!"), prefix.rfind("?"))
    local_prefix = prefix[boundary + 1:]
    return _explicit_date(local_prefix)


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
                    source_text=text[max(0, match.start() - 40): min(len(text), match.end() + 40)],
                    confidence=0.68,
                )
            )
    return candidates
