"""Cross-document event identity.

An event (an Extra Work item, an incomplete investigation, a design conflict)
is one ``ExtraWork`` record whatever its documents call it:

- ``id`` is the internal identity. Facts and issues carry it as ``event_id``.
- ``external_id`` is the canonical key used for scoping and display: an EW
  number when the sources state one, otherwise a generated ``EVT-`` key.
- ``aliases`` are other identifiers for the same event, e.g. after a merge.

Matching is deliberately conservative, and code never merges on its own doubt:
- A stated EW number is the identity (an alias resolves to its event).
- Without one, a fact joins an event only through work items the documents
  themselves state (``P-17``, ``Room 204``). Overlapping exactly one event
  joins it. Overlapping several is a POSSIBLE_MATCH: the fact joins none and a
  MERGE suggestion is recorded for a reviewer.
- A fact with no work items but a stated location shared by exactly one event
  ("the four remaining north-side items") gets an ATTACH suggestion, never an automatic link.
- A reviewer confirms or rejects suggestions; confirming re-runs the analysis.
"""

from dataclasses import dataclass, field
from datetime import datetime
import hashlib

from app.domain_contracts.schemas import ExtraWork
from app.legal_knowledge.taxonomy import normalize_tag
from app.repositories.memory import store


@dataclass
class EventIdentity:
    key: str | None
    status: str  # CONFIRMED / POSSIBLE_MATCH / NONE
    possible_keys: list[str] = field(default_factory=list)
    event_id: str | None = None


def resolve_event_identity(
    *, tenant_id: str, matter_id: str, extra_work_id: str | None, value, document,
    title: str | None = None, assertion_id: str | None = None,
) -> EventIdentity:
    value = value if isinstance(value, dict) else {}
    work_items = [str(item).upper() for item in value.get("work_items") or [] if item]
    work_items += [str(item).upper() for item in value.get("outstanding_items") or [] if item and str(item).upper() not in work_items]
    if extra_work_id:
        event = store.find_extra_work(tenant_id=tenant_id, matter_id=matter_id, external_id=extra_work_id)
        if event is None:
            return EventIdentity(extra_work_id, "CONFIRMED")
        _enrich(event, value, work_items, document)
        return EventIdentity(event.external_id, "CONFIRMED", event_id=event.id)
    if not work_items:
        return EventIdentity(None, "NONE")
    overlapping = [
        event for event in _events(tenant_id, matter_id)
        if set(event.work_items) & set(work_items)
    ]
    if len(overlapping) > 1:
        keys = sorted(event.external_id for event in overlapping)
        _suggest("MERGE", tenant_id, matter_id, [event.id for event in overlapping], assertion_id,
                 f"A fact names work items of {len(overlapping)} events ({', '.join(keys)}).")
        return EventIdentity(None, "POSSIBLE_MATCH", keys)
    if overlapping:
        event = overlapping[0]
    else:
        event = ExtraWork(
            tenant_id=tenant_id,
            matter_id=matter_id,
            external_id=_event_key(tenant_id, matter_id, work_items),
            title=title or _title(value, work_items),
            identity_status="CONFIRMED",
        )
        store.extra_works[event.id] = event
    _enrich(event, value, work_items, document)
    return EventIdentity(event.external_id, "CONFIRMED", event_id=event.id)


def suggest_location_matches(*, tenant_id: str, matter_id: str, assertion_ids: set[str]) -> None:
    """ATTACH suggestions for unscoped facts that state only a location."""
    for assertion_id in sorted(assertion_ids):
        assertion = store.assertions.get(assertion_id)
        if assertion is None or assertion.extra_work_id or assertion.relationship_status == "UNRESOLVED_SCOPE":
            continue
        location = assertion.value.get("location") if isinstance(assertion.value, dict) else None
        if not isinstance(location, str) or not location.strip():
            continue
        same_place = [
            event for event in _events(tenant_id, matter_id)
            if event.location and event.location.strip().lower() == location.strip().lower()
        ]
        if len(same_place) == 1:
            _suggest("ATTACH", tenant_id, matter_id, [same_place[0].id], assertion_id,
                     f'The fact names the location "{location}" but no identifier; one event has that location.')


def confirm_suggestion(suggestion_id: str, *, reviewer: str | None = None, note: str | None = None) -> dict:
    """Apply a reviewed suggestion, then re-assess the Matter."""
    from app.services.pipeline import analyze_matter

    suggestion = _pending(suggestion_id)
    events = [store.extra_works[event_id] for event_id in suggestion["event_ids"] if event_id in store.extra_works]
    target = merge_events(events) if suggestion["kind"] == "MERGE" else events[0]
    for assertion_id in suggestion["assertion_ids"]:
        assertion = store.assertions.get(assertion_id)
        if assertion is not None:
            _assign(assertion, target, "CONFIRMED_BY_REVIEW", "A reviewer confirmed this fact belongs to the event")
    target.updated_at = datetime.utcnow()
    _close(suggestion, "CONFIRMED", reviewer, note, target.id)
    analyze_matter(
        tenant_id=suggestion["tenant_id"], matter_id=suggestion["matter_id"],
        new_assertion_ids=set(suggestion["assertion_ids"]), new_extra_work_ids={target.external_id},
        analysis_run_id=f"RUN-REVIEW-{suggestion_id}", reconcile_all=True,
    )
    return suggestion


def reject_suggestion(suggestion_id: str, *, reviewer: str | None = None, note: str | None = None) -> dict:
    """Keep the events apart. The facts stay unscoped and routed to review."""
    suggestion = _pending(suggestion_id)
    _close(suggestion, "REJECTED", reviewer, note, None)
    return suggestion


def merge_events(events: list[ExtraWork]) -> ExtraWork:
    """Merge into one event. A stated identifier outranks a generated EVT key;
    otherwise the oldest event survives. History stays: merged events are kept
    (status "merged") and their issues are marked, not deleted."""
    target = sorted(events, key=lambda e: (e.external_id.startswith("EVT-"), e.created_at))[0]
    for event in events:
        if event.id == target.id:
            continue
        target.aliases = sorted({*target.aliases, event.external_id, *event.aliases} - {target.external_id})
        target.work_items = sorted(set(target.work_items) | set(event.work_items))
        target.document_ids = list(dict.fromkeys([*target.document_ids, *event.document_ids]))
        target.root_cause_categories = list(dict.fromkeys([*target.root_cause_categories, *event.root_cause_categories]))
        target.location = target.location or event.location
        target.event_type = target.event_type or event.event_type
        for field_name in ("claimed_amount", "estimated_amount", "approved_amount", "proposed_amount", "currency"):
            if getattr(target, field_name) is None:
                setattr(target, field_name, getattr(event, field_name))
        for assertion in store.assertions.values():
            if assertion.event_id == event.id or (
                assertion.tenant_id == event.tenant_id and assertion.matter_id == event.matter_id
                and assertion.extra_work_id == event.external_id
            ):
                _assign(assertion, target, assertion.relationship_status, f"Event {event.external_id} merged into {target.external_id} by review")
        for issue in store.issues.values():
            if issue.event_id == event.id or (
                issue.tenant_id == event.tenant_id and issue.matter_id == event.matter_id
                and issue.extra_work_id == event.external_id and not issue.merged_into_event_id
            ):
                issue.merged_into_event_id = target.id
        event.status = "merged"
        event.merged_into_id = target.id
    return target


def event_tags(event: ExtraWork) -> list[dict]:
    return [tag for code in event.root_cause_categories if (tag := normalize_tag(code, "ROOT_CAUSE", "POTENTIAL", "extraction"))]


def _events(tenant_id: str, matter_id: str) -> list[ExtraWork]:
    return [
        event for event in store.extra_works.values()
        if event.tenant_id == tenant_id and event.matter_id == matter_id and event.status != "merged"
    ]


def _assign(assertion, event: ExtraWork, status: str, reason: str) -> None:
    assertion.event_id = event.id
    assertion.extra_work_id = event.external_id
    assertion.relationship_status = status
    assertion.relationship_reason = reason
    if isinstance(assertion.value, dict):
        assertion.value["extra_work_id"] = event.external_id
        assertion.value.pop("possible_event_ids", None)


def _suggest(kind: str, tenant_id: str, matter_id: str, event_ids: list[str], assertion_id: str | None, reason: str) -> None:
    event_ids = sorted(set(event_ids))
    existing = next(
        (item for item in store.event_match_suggestions.values()
         if item["status"] == "PENDING" and item["kind"] == kind and item["tenant_id"] == tenant_id
         and item["matter_id"] == matter_id and item["event_ids"] == event_ids),
        None,
    )
    if existing is None:
        suggestion_id = "MATCH-" + hashlib.sha256(f"{kind}|{tenant_id}|{matter_id}|{'|'.join(event_ids)}|{assertion_id}".encode()).hexdigest()[:10].upper()
        existing = {
            "id": suggestion_id, "kind": kind, "tenant_id": tenant_id, "matter_id": matter_id,
            "event_ids": event_ids, "assertion_ids": [], "reason": reason, "status": "PENDING",
            "created_at": datetime.utcnow().isoformat(), "reviewer": None, "note": None, "result_event_id": None,
        }
        store.event_match_suggestions[suggestion_id] = existing
    if assertion_id and assertion_id not in existing["assertion_ids"]:
        existing["assertion_ids"].append(assertion_id)


def _pending(suggestion_id: str) -> dict:
    suggestion = store.event_match_suggestions.get(suggestion_id)
    if suggestion is None:
        raise KeyError(suggestion_id)
    if suggestion["status"] != "PENDING":
        raise ValueError(f"suggestion {suggestion_id} is already {suggestion['status']}")
    return suggestion


def _close(suggestion: dict, status: str, reviewer: str | None, note: str | None, result_event_id: str | None) -> None:
    suggestion.update({
        "status": status, "reviewer": reviewer, "note": note, "result_event_id": result_event_id,
        "reviewed_at": datetime.utcnow().isoformat(),
    })


def _enrich(event: ExtraWork, value: dict, work_items: list[str], document) -> None:
    event.work_items = sorted(set(event.work_items) | set(work_items))
    if not event.location and isinstance(value.get("location"), str):
        event.location = value["location"]
    if not event.event_type and isinstance(value.get("event_type"), str):
        event.event_type = value["event_type"]
    category = value.get("root_cause_category")
    if isinstance(category, str) and normalize_tag(category, "ROOT_CAUSE", "POTENTIAL", "extraction"):
        code = category.strip().upper()
        if code not in event.root_cause_categories:
            event.root_cause_categories.append(code)
    if document is not None and document.id not in event.document_ids:
        event.document_ids.append(document.id)


def _event_key(tenant_id: str, matter_id: str, work_items: list[str]) -> str:
    # Hex only: assertion_scope() normalizes keys and must not rewrite them.
    digest = hashlib.sha256(f"{tenant_id}|{matter_id}|{'|'.join(sorted(work_items))}".encode()).hexdigest()
    return f"EVT-{digest[:10].upper()}"


def _title(value: dict, work_items: list[str]) -> str:
    location = value.get("location") if isinstance(value.get("location"), str) else None
    items = sorted(work_items)
    span = items[0] if len(items) == 1 else f"{items[0]}–{items[-1]}"
    return f"{location} · {span}" if location else f"Work items {span}"


