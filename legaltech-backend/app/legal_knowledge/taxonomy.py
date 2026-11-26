"""Multi-label event taxonomy (the lawyer's A-E categories).

A category describes an event; it never decides a legal result. One event can
carry several categories, each on its own dimension and with its own status:

- ROOT_CAUSE: what gave rise to the event (e.g. an unexpected site condition).
- IMPACT: what the event may affect (scope, price, schedule, damages).

Requirements decide issues, evidence proves them, assessments express risk.
Categories only help a reader understand and filter what was found.
"""

from enum import Enum


class Dimension(str, Enum):
    root_cause = "ROOT_CAUSE"
    impact = "IMPACT"


class TagStatus(str, Enum):
    confirmed = "CONFIRMED"
    potential = "POTENTIAL"
    uncertain = "UNCERTAIN"


CATEGORIES: dict[str, dict] = {
    "A_SCOPE_CHANGE": {"label": "Scope change", "dimensions": {Dimension.impact}},
    "B_PRICE_ADJUSTMENT": {"label": "Price adjustment", "dimensions": {Dimension.impact}},
    "C_SCHEDULE_TIME": {"label": "Schedule / time", "dimensions": {Dimension.impact}},
    # Damages is a legal consequence, not a fact: it can only ever be POTENTIAL
    # here. Whether anything is recoverable is decided in legal review.
    "D_DAMAGES": {"label": "Damages", "dimensions": {Dimension.impact}, "max_status": TagStatus.potential},
    "E_UNEXPECTED_SITE_CONDITIONS": {"label": "Unexpected site conditions", "dimensions": {Dimension.root_cause}},
}


def normalize_tag(code: str, dimension: str | None, status: str | None, source: str) -> dict | None:
    """Return a validated tag, or None when the code or dimension is unknown."""
    code = str(code or "").strip().upper()
    spec = CATEGORIES.get(code)
    if spec is None:
        return None
    dimensions = spec["dimensions"]
    try:
        chosen = Dimension(str(dimension).upper()) if dimension else next(iter(dimensions))
    except ValueError:
        return None
    if chosen not in dimensions:
        return None
    try:
        tag_status = TagStatus(str(status or "POTENTIAL").upper())
    except ValueError:
        tag_status = TagStatus.uncertain
    cap = spec.get("max_status")
    if cap is TagStatus.potential and tag_status is TagStatus.confirmed:
        tag_status = TagStatus.potential
    return {"code": code, "label": spec["label"], "dimension": chosen.value, "status": tag_status.value, "source": source}


def merge_tags(tags: list[dict]) -> list[dict]:
    """One tag per (code, dimension); the strongest status wins."""
    rank = {TagStatus.confirmed.value: 2, TagStatus.potential.value: 1, TagStatus.uncertain.value: 0}
    merged: dict[tuple[str, str], dict] = {}
    for tag in tags:
        key = (tag["code"], tag["dimension"])
        current = merged.get(key)
        if current is None or rank[tag["status"]] > rank[current["status"]]:
            merged[key] = {**tag, "sources": sorted({tag["source"], *(current or {}).get("sources", [])})}
        else:
            current["sources"] = sorted({tag["source"], *current.get("sources", [])})
    return sorted(merged.values(), key=lambda item: (item["dimension"] != Dimension.root_cause.value, item["code"]))
