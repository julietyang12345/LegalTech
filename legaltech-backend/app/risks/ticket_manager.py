from app.models import RiskFactor, RiskTicket, RiskTicketHistory
from app.models.domain import Severity
from app.repositories.memory import store
from app.risks.factor_manager import active_risk_factors_for_change_event
from app.risks.severity import severity_for_factor_types


def update_risk_tickets(change_event_id: str, factors: list[RiskFactor] | None = None) -> RiskTicket | None:
    active = active_risk_factors_for_change_event(change_event_id)
    severity = severity_for_factor_types([factor.factor_type for factor in active])
    key = f"{change_event_id}:authorization_and_pricing"
    summary = _summary(active)
    existing = store.risk_tickets.get(key)

    if not active and existing:
        return _resolve_ticket(existing)
    if not active:
        return None

    if existing:
        previous_severity = existing.severity
        previous_status = existing.status
        existing.severity = severity
        existing.status = "open"
        existing.factor_ids = [factor.id for factor in active]
        existing.summary = summary
        if previous_severity != severity or previous_status != existing.status:
            history = RiskTicketHistory(
                risk_ticket_id=existing.id,
                previous_severity=previous_severity,
                new_severity=severity,
                previous_status=previous_status,
                new_status=existing.status,
                reason="Risk factors changed after new evidence was processed.",
            )
            store.risk_ticket_history[history.id] = history
        return existing

    ticket = RiskTicket(
        change_event_id=change_event_id,
        title="Additional work lacks complete contractual support",
        severity=severity,
        factor_ids=[factor.id for factor in active],
        summary=summary,
    )
    store.risk_tickets[key] = ticket
    return ticket


def _resolve_ticket(ticket: RiskTicket) -> RiskTicket:
    previous_severity = ticket.severity
    previous_status = ticket.status
    ticket.severity = Severity.low
    ticket.status = "resolved"
    ticket.factor_ids = []
    ticket.summary = "Previously identified risk factors have been mitigated by later evidence."
    if previous_severity != ticket.severity or previous_status != ticket.status:
        history = RiskTicketHistory(
            risk_ticket_id=ticket.id,
            previous_severity=previous_severity,
            new_severity=ticket.severity,
            previous_status=previous_status,
            new_status=ticket.status,
            reason="All active risk factors for this ticket were mitigated.",
        )
        store.risk_ticket_history[history.id] = history
    return ticket


def _summary(factors: list[RiskFactor]) -> str:
    factor_types = {factor.factor_type for factor in factors}
    if "authorization_disputed" in factor_types:
        return "Operational direction is supported, but authorization of additional compensation is disputed."
    if "missing_signed_change_order" in factor_types:
        return "Work appears to have proceeded, but no signed change order has been identified."
    if "pricing_approval_missing" in factor_types:
        return "An invoice or pricing event exists, but approval support is incomplete."
    return "New risk factors require review."
