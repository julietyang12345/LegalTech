from datetime import datetime

from app.models import DecisionNodeState, RiskFactor
from app.models.domain import RiskStatus
from app.repositories.memory import store


def update_risk_factors(change_event_id: str, node_states: list[DecisionNodeState]) -> list[RiskFactor]:
    factors: list[RiskFactor] = []
    for state in node_states:
        mitigated = _mitigated_factor_types_for_state(state)
        for factor_type in mitigated:
            factor = _mitigate_factor(change_event_id, factor_type, state)
            if factor:
                factors.append(factor)

        factor_type = _factor_type_for_state(state)
        if not factor_type:
            continue
        key = f"{change_event_id}:{factor_type}"
        factor = store.risk_factors.get(key)
        if factor:
            factor.status = _risk_status_for_state(state)
            factor.last_updated_at = datetime.utcnow()
            factor.supporting_signal_ids = sorted(set(factor.supporting_signal_ids + state.supporting_signal_ids))
            factor.contrary_signal_ids = sorted(set(factor.contrary_signal_ids + state.contrary_signal_ids))
            factor.strength = _strength_for_state(state)
        else:
            factor = RiskFactor(
                change_event_id=change_event_id,
                factor_type=factor_type,
                status=_risk_status_for_state(state),
                strength=_strength_for_state(state),
                supporting_signal_ids=state.supporting_signal_ids,
                contrary_signal_ids=state.contrary_signal_ids,
            )
            store.risk_factors[key] = factor
        factors.append(factor)
    return factors


def active_risk_factors_for_change_event(change_event_id: str) -> list[RiskFactor]:
    return [
        factor
        for factor in store.risk_factors.values()
        if factor.change_event_id == change_event_id
        and factor.status
        not in {RiskStatus.mitigated, RiskStatus.resolved, "mitigated", "resolved"}
    ]


def _factor_type_for_state(state: DecisionNodeState) -> str | None:
    if state.node_id == "authorization_gate" and state.status == "disputed":
        return "authorization_disputed"
    if state.node_id == "authorization_gate" and state.status == "incomplete":
        return "missing_signed_change_order"
    if state.node_id == "pricing_gate" and state.status == "incomplete":
        return "pricing_approval_missing"
    if state.node_id == "invoice_support_gate" and state.status in {"incomplete", "contradicted"}:
        return "invoice_support_incomplete"
    if state.node_id == "quantum_gate" and state.status == "disputed":
        return "invoice_exceeds_approved_amount"
    if state.node_id == "document_consistency_gate" and state.status == "contradicted":
        return "document_consistency_conflict"
    if state.node_id == "process_compliance_gate" and state.status in {"incomplete", "contradicted"}:
        return "process_compliance_gap"
    if state.node_id == "acceleration_gate" and state.status == "needs_review":
        return "schedule_pressure_direction"
    return None


def _mitigated_factor_types_for_state(state: DecisionNodeState) -> list[str]:
    if state.node_id == "authorization_gate" and state.status == "supported":
        return ["missing_signed_change_order"]
    if state.node_id == "pricing_gate" and state.status == "supported":
        return ["pricing_approval_missing"]
    if state.node_id == "invoice_support_gate" and state.status == "supported":
        return ["invoice_support_incomplete"]
    if state.node_id == "process_compliance_gate" and state.status == "supported":
        return ["process_compliance_gap"]
    return []


def _mitigate_factor(
    change_event_id: str,
    factor_type: str,
    state: DecisionNodeState,
) -> RiskFactor | None:
    factor = store.risk_factors.get(f"{change_event_id}:{factor_type}")
    if not factor or factor.status in {RiskStatus.mitigated, "mitigated"}:
        return factor

    factor.status = RiskStatus.mitigated
    factor.last_updated_at = datetime.utcnow()
    factor.mitigated_at = factor.last_updated_at
    factor.mitigated_by_document_id = _source_document_id_for_state(state)
    return factor


def _source_document_id_for_state(state: DecisionNodeState) -> str | None:
    signal_ids = set(state.supporting_signal_ids)
    for signal in store.signals.values():
        if signal.id in signal_ids:
            return signal.source_document_id
    return None


def _risk_status_for_state(state: DecisionNodeState) -> RiskStatus:
    if state.status == "disputed":
        return RiskStatus.contradicted
    if state.status == "contradicted":
        return RiskStatus.contradicted
    if state.status == "incomplete":
        return RiskStatus.insufficient_evidence
    if state.status == "needs_review":
        return RiskStatus.under_review
    return RiskStatus.detected


def _strength_for_state(state: DecisionNodeState) -> str:
    if state.status in {"disputed", "contradicted"}:
        return "strong contrary"
    if state.status == "incomplete":
        return "strong"
    if state.status == "needs_review":
        return "medium"
    return "medium"
