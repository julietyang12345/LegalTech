from fastapi import APIRouter
from pydantic import BaseModel

from app.models import ChangeEvent
from app.repositories.memory import store

router = APIRouter()


class CreateChangeEventRequest(BaseModel):
    project_id: str
    title: str


@router.get("")
def list_change_events(project_id: str | None = None) -> list[ChangeEvent]:
    change_events = list(store.change_events.values())
    if project_id:
        return [event for event in change_events if event.project_id == project_id]
    return change_events


@router.post("")
def create_change_event(payload: CreateChangeEventRequest) -> ChangeEvent:
    change_event = ChangeEvent(project_id=payload.project_id, title=payload.title)
    store.change_events[change_event.id] = change_event
    return change_event


@router.get("/{change_event_id}")
def get_change_event(change_event_id: str) -> dict:
    signals = [
        signal for signal in store.signals.values() if signal.change_event_id == change_event_id
    ]
    node_states = [
        state for state in store.node_states.values() if state.change_event_id == change_event_id
    ]
    factors = [
        factor for factor in store.risk_factors.values() if factor.change_event_id == change_event_id
    ]
    tickets = [
        ticket for ticket in store.risk_tickets.values() if ticket.change_event_id == change_event_id
    ]
    return {
        "change_event": store.change_events.get(change_event_id),
        "signals": signals,
        "node_states": node_states,
        "risk_factors": factors,
        "risk_tickets": tickets,
    }
