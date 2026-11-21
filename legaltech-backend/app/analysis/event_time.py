"""Normalize source-derived event dates without inventing upload timestamps."""

from dataclasses import dataclass
from datetime import date, datetime
import re


_MONTHS = {
    name.lower(): number
    for number, names in enumerate(
        ("january jan", "february feb", "march mar", "april apr", "may", "june jun", "july jul", "august aug", "september sep sept", "october oct", "november nov", "december dec"),
        start=1,
    )
    for name in names.split()
}


@dataclass(frozen=True)
class NormalizedEventTime:
    raw_value: str | None
    iso_value: str | None
    confidence: str


def normalize_event_time(value: str | None, *, reference_at: datetime | None = None) -> NormalizedEventTime:
    if not isinstance(value, str) or not value.strip():
        return NormalizedEventTime(None, None, "UNKNOWN")
    raw = value.strip()
    parsed = _parse(raw, reference_at.year if reference_at else None)
    if parsed is None:
        return NormalizedEventTime(raw, None, "UNPARSED_SOURCE_TEXT")
    has_year = bool(re.search(r"\b\d{4}\b", raw))
    return NormalizedEventTime(raw, parsed.isoformat(), "EXPLICIT" if has_year else "PARTIAL_DATE_INFERRED")


def parse_event_date(value: str | None, *, reference_at: datetime | None = None) -> date | None:
    normalized = normalize_event_time(value, reference_at=reference_at)
    return date.fromisoformat(normalized.iso_value) if normalized.iso_value else None


def _parse(value: str, reference_year: int | None) -> date | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        pass
    try:
        return date.fromisoformat(value)
    except ValueError:
        pass
    # Ranges and annotated values ("2026-04-09 to 2026-04-10") start on the
    # first stated date.
    iso = re.search(r"\b(\d{4})-(\d{2})-(\d{2})\b", value)
    if iso:
        try:
            return date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
        except ValueError:
            return None
    # "April 9–10, 2026": the year follows the range end.
    match = re.search(r"\b([A-Za-z]{3,9})\s+(\d{1,2})(?:\s*[–-]\s*\d{1,2})?(?:,?\s+(\d{4}))?\b", value)
    if not match:
        return None
    month = _MONTHS.get(match.group(1).lower())
    year = int(match.group(3)) if match.group(3) else reference_year
    if not month or not year:
        return None
    try:
        return date(year, month, int(match.group(2)))
    except ValueError:
        return None


def assertion_event_date(assertion) -> str | None:
    """ISO date the source states for an assertion's fact; never upload time.

    Typed fields are already normalized ISO values. ``uploaded_at`` is only a
    year hint for partial dates like "April 10", never a fallback value.
    """
    for field in (
        "price_approved_at", "approval_at", "price_communicated_at", "communication_at",
        "work_start_at", "work_completed_at", "work_planned_at",
    ):
        parsed = parse_event_date(getattr(assertion, field, None))
        if parsed:
            return parsed.isoformat()
    value = getattr(assertion, "value", None)
    raw = [getattr(assertion, "event_at", None)]
    if isinstance(value, dict):
        raw.append(value.get("event_at"))
    raw.append(getattr(assertion, "document_sent_at", None))
    for candidate in raw:
        parsed = parse_event_date(candidate, reference_at=getattr(assertion, "uploaded_at", None))
        if parsed:
            return parsed.isoformat()
    return None
