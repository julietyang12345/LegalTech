import json
import logging
import re
from datetime import date, timedelta
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
    # Required vs actual state, for any domain (investigations, inspections,
    # tests, submittals, signoffs). The value is structured; see the prompt.
    "required_quantity",
    "completed_quantity",
    # Records (logs, sheets, certificates) listed as attached/sent/available:
    # document coverage, never proof that the physical work was done.
    "record_coverage",
    "required_deliverable",
    "deliverable_status",
    "scope_substitution",
    "milestone_planned",
    # A cost actually incurred is a fact; whether it is recoverable is not.
    "cost_incurred",
    "potential_damages_claim",
    # Events that can trigger a contractual notice obligation.
    "condition_encountered",
    "delay_event",
}

TEMPORAL_STATUSES = {"completed", "planned", "conditional", "denied", "normative", "unknown"}


SYSTEM_PROMPT = """You extract audit-ready evidence risk signals.
Return only JSON with a top-level "signals" array. Each signal must include:
signal_type, value, actor, source_text, confidence, extra_work_id, polarity,
temporal_status, event_at. confidence is a number between 0 and 1. event_at is
the date the source states for the fact itself (not the document upload date).
Resolve relative days ("Thursday", "yesterday") against the document's own date
and give the earliest day of a range; if you cannot resolve it, use the
document's date rather than guessing.
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
pricing_unresolved, required_quantity, completed_quantity, record_coverage,
required_deliverable, deliverable_status, scope_substitution, milestone_planned,
cost_incurred, potential_damages_claim, condition_encountered, delay_event.
Contract requirements vs project facts (this distinction matters more than any
single label):
- temporal_status "normative" marks a requirement, definition or rule: what
  must, shall or would happen. A statement that something did or did not
  happen ("No substitution has been approved", "None found") is a fact, not
  normative ("All items shall be completed before release",
  "Any approved substitution shall be documented"). A normative sentence is
  never a signed change order, an approval, or completed work.
- Requirements and observed state use structured values:
  required_quantity (normative): {"item", "quantity", "work_items"}
  completed_quantity: {"item", "completed", "required", "outstanding_items", "work_items"}
    only when the source states how much work was physically done.
  record_coverage: {"record_type", "work_items"} when the source lists records,
    logs or sheets attached, sent or available, naming their items. This is
    document coverage, NOT completed work: never turn a list of records into
    completed_quantity or work_performed. polarity negative when the source
    says records for named items are absent.
  required_deliverable (normative): {"deliverable", "required_status"} e.g. "final signed"
  deliverable_status: {"deliverable", "status"} with status one of final, signed,
    final_signed, interim, draft, unsigned, preliminary, not_received (the
    source says it has not been delivered or issued), not_found (it was not
    found in the records or folder reviewed; that is not proof it does not exist)
  scope_substitution: an approved revision of required scope; polarity negative
    when the source says none was approved.
  milestone_planned: {"milestone"} with event_at the planned date;
    temporal_status completed only when the source says it took place.
- work_items: identifiers of physical items or locations the fact concerns
  (e.g. "P-17", "Room 204", "GL-4": item tags, rooms, grid lines),
  exactly as written, with ranges expanded only when the document states the
  range. Materials, quantities and descriptions are not work items.
- location: the area as written, if stated. root_cause_category, optional: one
  of E_UNEXPECTED_SITE_CONDITIONS when the fact concerns ground, groundwater,
  contamination or other subsurface conditions, or the site or geotechnical
  investigation of them (required test locations, logs, reports).
- condition_encountered: the source says a physical condition was found or
  recognised (ground, groundwater, contamination, existing structure) that may
  differ from what was expected. delay_event: the source says work was delayed,
  suspended or prevented. Not for requests, plans or coordination notes.
  written_notice only for a notice actually given or received, not for an
  ordinary email or a request.
- Sending, attaching or forwarding documents is not work_performed.
- cost_incurred is a cost the source says was actually spent (standby time,
  receipts, records of expense). A price adjustment or amount in a change
  order, approval or quote is approved_amount or estimate_amount, never
  cost_incurred.
  potential_damages_claim is a source asserting someone should bear a loss. Never
  state that damages are recoverable.
- extra_work_id: only an identifier written in the document. Never invent one.
Decisions on price are the most important facts to capture; never skip one:
- approval_denied (polarity negative): a decision-maker explicitly rejects or
  withholds approval of a proposed price, amount or change, in any wording
  (for example "We can't accept that number" or "Pricing declined as
  submitted"). authorization_denial is for refusing permission to do the work.
- pricing_unresolved: a request to revise, justify or resubmit pricing. On its
  own it is NOT a rejection and NOT an instruction to proceed or an approval.
- scheduling_only / operational_direction: site logistics, sequencing or
  staffing requests. They direct how work happens, not what it costs, and are
  never price approval.
- estimate_amount: any price the contractor proposes, including a revised or
  reduced one. It is not approved_amount until the owner accepts it.
source_text must be an exact excerpt from the document. Do not infer facts that
are not supported by an excerpt. Use polarity affirmative, negative, or
uncertain. Use temporal_status completed, planned, conditional, denied,
normative, or unknown. A phrase about signing in the future is planned, not signed. A
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
            temperature=0,
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
    silently removes evidence (every signal of such a document is lost).
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


_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_MONTHS = {name: index for index, name in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august",
     "september", "october", "november", "december"], start=1)}
_DOCUMENT_DATE = re.compile(r"^\s*(?:date(?: sent)?|sent)\s*:\s*([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})", re.IGNORECASE | re.MULTILINE)


_DOCUMENT_ISO_DATE = re.compile(r"^\s*(?:date(?: sent)?|sent)\s*:\s*(\d{4})-(\d{2})-(\d{2})\b", re.IGNORECASE | re.MULTILINE)


def document_date(text: str) -> date | None:
    """The date stated in the document's own header ("Date: April 10, 2026"
    or "DATE: 2026-09-07")."""
    iso = _DOCUMENT_ISO_DATE.search(text[:2000])
    if iso:
        try:
            return date(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
        except ValueError:
            return None
    match = _DOCUMENT_DATE.search(text[:2000])
    if not match or match.group(1).lower() not in _MONTHS:
        return None
    try:
        return date(int(match.group(3)), _MONTHS[match.group(1).lower()], int(match.group(2)))
    except ValueError:
        return None


def resolve_weekday_event_at(source_text: str, text: str, temporal_status: str | None = None) -> str | None:
    """Resolve weekday references against the document date, in code.

    Models routinely miscount weekdays ("Thursday" in a Friday Apr 10 report
    came back as Apr 8). A completed fact refers back: the latest such day on
    or before the document date. A planned or conditional one refers forward:
    the next such day after it. The earliest resolved day wins.
    Returns None when the statement names no weekday or the document is undated.
    """
    named = [day for day in _WEEKDAYS if re.search(rf"\b{day}\b", source_text, re.IGNORECASE)]
    anchor = document_date(text) if named else None
    if not anchor:
        return None
    forward = str(temporal_status or "").lower() in {"planned", "conditional", "future"}
    if forward:
        resolved = [anchor + timedelta(days=(_WEEKDAYS.index(day) - anchor.weekday()) % 7 or 7) for day in named]
    else:
        resolved = [anchor - timedelta(days=(anchor.weekday() - _WEEKDAYS.index(day)) % 7) for day in named]
    return min(resolved).isoformat()


def _stated_identifier(value: Any, text: str) -> str | None:
    """Keep an identifier only if the document itself states it."""
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip() if value.strip().lower() in text.lower() else None


# Identifier-shaped: a short letter prefix and a number ("P-17", "TP01", "ROOM 204", "GL-4A").
_IDENTIFIER = re.compile(r"^[A-Z]{1,6}[- ]?\d{1,4}[A-Z]?$")
_RANGE = re.compile(r"\b([A-Z]{1,6})-(\d{1,4})\s*(?:to|through|–|—|-)\s*(?:\1-)?(\d{1,4})\b")


def stated_work_items(candidates: Any, text: str) -> list[str]:
    """Work items the model named that the document states, directly or in a
    range it writes out ("P-11 to P-14", "P-11-14"). Anything else is dropped."""
    if not isinstance(candidates, list):
        return []
    in_ranges: set[str] = set()
    for match in _RANGE.finditer(text):
        prefix, start, end = match.group(1), int(match.group(2)), int(match.group(3))
        if start <= end and end - start <= 200:
            width = len(match.group(2))
            in_ranges.update(f"{prefix}-{number:0{width}d}" for number in range(start, end + 1))
    lowered = text.lower()
    kept: list[str] = []
    for item in candidates:
        if not isinstance(item, str) or not item.strip():
            continue
        name = item.strip().upper()
        if not _IDENTIFIER.match(name):
            # Materials and descriptions ("TWO VALVES", "18 FEET OF PIPE") are
            # not identities; matching events on them merges unrelated work.
            continue
        if (name.lower() in lowered or name in in_ranges) and name not in kept:
            kept.append(name)
    return kept


def _grounded_value(item: dict, text: str) -> Any:
    value = item.get("value")
    if not isinstance(value, dict):
        extras = {key: item[key] for key in ("work_items", "location", "root_cause_category") if key in item}
        if not extras:
            return value
        value = {"value": value, **extras}
    value = dict(value)
    for key in ("work_items", "outstanding_items"):
        if key in value or (key == "work_items" and "work_items" in item):
            value[key] = stated_work_items(value.get(key, item.get(key)), text)
    if "location" not in value and isinstance(item.get("location"), str):
        value["location"] = item["location"]
    if isinstance(value.get("location"), str) and value["location"].lower() not in text.lower():
        value.pop("location")
    if "root_cause_category" not in value and item.get("root_cause_category"):
        value["root_cause_category"] = item["root_cause_category"]
    return value


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
        if temporal_status not in TEMPORAL_STATUSES:
            return None
        return SignalCandidate(
            signal_type=signal_type,
            value=_grounded_value(item, text),
            actor=item.get("actor"),
            source_text=source_text.strip(),
            confidence=normalized_confidence,
            polarity=polarity,
            temporal_status=temporal_status,
            extra_work_id=_stated_identifier(item.get("extra_work_id"), text),
            event_at=resolve_weekday_event_at(source_text, text, item.get("temporal_status")) or item.get("event_at"),
        )
    except ValidationError:
        return None
