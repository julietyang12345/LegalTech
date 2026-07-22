from fastapi import APIRouter

from app.models import RiskFactor, RiskTicket, RiskTicketHistory
from app.repositories.memory import store

router = APIRouter()


@router.get("/factors")
def list_risk_factors(change_event_id: str | None = None) -> list[RiskFactor]:
    factors = list(store.risk_factors.values())
    if change_event_id:
        return [factor for factor in factors if factor.change_event_id == change_event_id]
    return factors


@router.get("/tickets")
def list_risk_tickets(change_event_id: str | None = None) -> list[RiskTicket]:
    tickets = list(store.risk_tickets.values())
    if change_event_id:
        return [ticket for ticket in tickets if ticket.change_event_id == change_event_id]
    return tickets


@router.get("/tickets/{ticket_id}/history")
def get_ticket_history(ticket_id: str) -> list[RiskTicketHistory]:
    return [
        item for item in store.risk_ticket_history.values() if item.risk_ticket_id == ticket_id
    ]
