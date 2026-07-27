from datetime import datetime

from app.models import RiskFactor, RiskTicket, RiskTicketHistory
from app.models.domain import RiskStatus, Severity
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
        existing.status = _status_for_active_factors(active, previous_severity, severity)
        existing.factor_ids = [factor.id for factor in active]
        existing.summary = summary
        existing.updated_at = datetime.utcnow()
        if previous_severity != severity or previous_status != existing.status:
            history = RiskTicketHistory(
                risk_ticket_id=existing.id,
                previous_severity=previous_severity,
                new_severity=severity,
                previous_status=previous_status,
                new_status=existing.status,
                reason=_history_reason(active, previous_severity, severity),
                supporting_event_id=_supporting_event_id(active),
                supporting_signal_ids=sorted({signal_id for factor in active for signal_id in factor.supporting_signal_ids}),
                contrary_signal_ids=sorted({signal_id for factor in active for signal_id in factor.contrary_signal_ids}),
            )
            store.risk_ticket_history[history.id] = history
        return existing

    ticket = RiskTicket(
        change_event_id=change_event_id,
        title="Change event lacks complete supporting evidence",
        severity=severity,
        status=RiskStatus.detected,
        factor_ids=[factor.id for factor in active],
        summary=summary,
    )
    store.risk_tickets[key] = ticket
    return ticket


def _resolve_ticket(ticket: RiskTicket) -> RiskTicket:
    previous_severity = ticket.severity
    previous_status = ticket.status
    ticket.severity = Severity.low
    ticket.status = RiskStatus.resolved
    ticket.factor_ids = []
    ticket.summary = "Previously identified risk factors have been mitigated by later evidence."
    ticket.updated_at = datetime.utcnow()
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
        return "Operational direction is supported, but authorization remains disputed."
    if "missing_signed_change_order" in factor_types:
        return "The change appears to have proceeded, but no signed authorization document has been identified."
    if "pricing_approval_missing" in factor_types:
        return "A pricing or billing event exists, but approval support is incomplete."
    if "invoice_exceeds_approved_amount" in factor_types:
        return "Invoice quantum exceeds the current approved or estimated amount."
    if "document_consistency_conflict" in factor_types:
        return "Email, invoice, or attachment evidence conflicts and requires reconciliation."
    if "invoice_support_incomplete" in factor_types:
        return "Invoice support is missing, unsigned, or incomplete."
    if "process_compliance_gap" in factor_types:
        return "Process compliance evidence is incomplete or contradicted."
    if "schedule_pressure_direction" in factor_types:
        return "Operational direction appears tied to schedule pressure and may affect acceleration analysis."
    return "New risk factors require review."


def _status_for_active_factors(
    active: list[RiskFactor],
    previous_severity: Severity,
    new_severity: Severity,
) -> RiskStatus:
    if any(factor.contrary_signal_ids for factor in active):
        return RiskStatus.contradicted
    if new_severity == Severity.high and previous_severity != Severity.high:
        return RiskStatus.escalated
    if any(factor.status == RiskStatus.insufficient_evidence for factor in active):
        return RiskStatus.insufficient_evidence
    if any(factor.status == RiskStatus.under_review for factor in active):
        return RiskStatus.under_review
    return RiskStatus.supported


def _history_reason(
    active: list[RiskFactor],
    previous_severity: Severity,
    new_severity: Severity,
) -> str:
    if any(factor.contrary_signal_ids for factor in active):
        return "New contrary evidence changed the risk posture."
    if new_severity.value != previous_severity.value:
        return "Risk level changed after dependency-based recomputation."
    return "Risk status changed after new evidence was processed."


def _supporting_event_id(active: list[RiskFactor]) -> str | None:
    signal_ids = {signal_id for factor in active for signal_id in factor.supporting_signal_ids + factor.contrary_signal_ids}
    document_ids = {
        signal.source_document_id
        for signal in store.signals.values()
        if signal.id in signal_ids
    }
    events = sorted(
        [event for event in store.events.values() if event.document_id in document_ids],
        key=lambda event: event.occurred_at,
        reverse=True,
    )
    return events[0].id if events else None
