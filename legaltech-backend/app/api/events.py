from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.analysis.event_identity import confirm_suggestion, reject_suggestion
from app.repositories.memory import store

router = APIRouter()


class ReviewDecision(BaseModel):
    reviewer: str | None = None
    note: str | None = None


@router.get("/suggestions")
def list_match_suggestions(matter_id: str, tenant_id: str | None = None, status: str | None = "PENDING") -> list[dict]:
    """Possible event matches awaiting a reviewer, with the facts behind them.

    Authentication and trusted reviewer identity must be supplied by the
    deployment gateway before this endpoint is used with confidential data.
    """
    suggestions = [
        item for item in store.event_match_suggestions.values()
        if item["matter_id"] == matter_id
        and (not tenant_id or item["tenant_id"] == tenant_id)
        and (not status or item["status"] == status)
    ]
    return [_present(item) for item in sorted(suggestions, key=lambda item: item["created_at"])]


@router.post("/suggestions/{suggestion_id}/confirm")
def confirm(suggestion_id: str, decision: ReviewDecision | None = None) -> dict:
    return _decide(confirm_suggestion, suggestion_id, decision)


@router.post("/suggestions/{suggestion_id}/reject")
def reject(suggestion_id: str, decision: ReviewDecision | None = None) -> dict:
    return _decide(reject_suggestion, suggestion_id, decision)


def _decide(action, suggestion_id: str, decision: ReviewDecision | None) -> dict:
    decision = decision or ReviewDecision()
    try:
        return _present(action(suggestion_id, reviewer=decision.reviewer, note=decision.note))
    except KeyError:
        raise HTTPException(status_code=404, detail="suggestion not found")
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))


def _present(item: dict) -> dict:
    events = []
    for event_id in item["event_ids"]:
        event = store.extra_works.get(event_id)
        if event is not None:
            events.append({
                "id": event.id, "key": event.external_id, "title": event.title, "location": event.location,
                "work_items": event.work_items, "status": event.status,
            })
    facts = []
    for assertion_id in item["assertion_ids"]:
        assertion = store.assertions.get(assertion_id)
        if assertion is None:
            continue
        document = store.documents.get(assertion.source_document_id)
        facts.append({
            "id": assertion.id, "statement": assertion.statement, "type": assertion.assertion_type,
            "filename": document.metadata.get("original_filename", document.id) if document else assertion.source_document_id,
        })
    return {**item, "events": events, "facts": facts}
