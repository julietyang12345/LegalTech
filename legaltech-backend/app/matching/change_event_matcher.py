from pydantic import BaseModel, Field

from app.parsers.base import ParsedContent
from app.repositories.memory import store


class ChangeEventMatch(BaseModel):
    change_event_id: str | None
    confidence: float
    reasons: list[str] = Field(default_factory=list)
    status: str


def resolve_change_event(project_id: str | None, parsed_content: ParsedContent) -> ChangeEventMatch:
    if not project_id:
        return ChangeEventMatch(change_event_id=None, confidence=0.0, status="unlinked")

    text = parsed_content.text.lower()
    scored = []
    for change_event in store.change_events.values():
        if change_event.project_id != project_id:
            continue
        score = 0.0
        reasons: list[str] = []
        title_terms = [term for term in change_event.title.lower().split() if len(term) > 3]
        matched_terms = [term for term in title_terms if term in text]
        if matched_terms:
            score += min(0.6, len(matched_terms) * 0.15)
            reasons.append("title keywords")
        feedback_score, feedback_reasons = _feedback_boost(change_event.id, text)
        if feedback_score:
            score += feedback_score
            reasons.extend(feedback_reasons)
        if score > 0:
            scored.append((min(score, 0.99), reasons, change_event.id))

    if not scored:
        candidates = [
            change_event for change_event in store.change_events.values()
            if change_event.project_id == project_id and change_event.status == "active"
        ]
        if len(candidates) == 1:
            return ChangeEventMatch(
                change_event_id=candidates[0].id,
                confidence=0.1,
                reasons=["single active project event candidate"],
                status="needs_review",
            )
        return ChangeEventMatch(change_event_id=None, confidence=0.0, status="unlinked")

    confidence, reasons, change_event_id = sorted(scored, key=lambda item: item[0], reverse=True)[0]
    status = "auto_linked" if confidence >= 0.9 else "needs_review"
    return ChangeEventMatch(change_event_id=change_event_id, confidence=confidence, reasons=reasons, status=status)


def _feedback_boost(change_event_id: str, text: str) -> tuple[float, list[str]]:
    score = 0.0
    reasons: list[str] = []

    for feedback in store.match_feedback.values():
        if feedback.selected_change_event_id != change_event_id:
            continue

        features = feedback.features
        keyword = features.get("keyword")
        if isinstance(keyword, str) and keyword.lower() in text:
            score += 0.35
            reasons.append("feedback keyword")

        for alias in _as_text_list(features.get("aliases")):
            if alias.lower() in text:
                score += 0.35
                reasons.append("feedback alias")
                break

        for phrase in _as_text_list(features.get("phrases")):
            if phrase.lower() in text:
                score += 0.25
                reasons.append("feedback phrase")
                break

    return min(score, 0.5), reasons


def _as_text_list(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []
