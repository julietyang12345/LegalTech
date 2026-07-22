from datetime import datetime

from app.models import DecisionNodeState, RiskFactor
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
            factor.status = "active"
            factor.last_updated_at = datetime.utcnow()
            factor.supporting_signal_ids = sorted(set(factor.supporting_signal_ids + state.supporting_signal_ids))
        else:
            factor = RiskFactor(
                change_event_id=change_event_id,
                factor_type=factor_type,
                strength="strong" if state.status in {"disputed", "incomplete"} else "medium",
                supporting_signal_ids=state.supporting_signal_ids,
            )
            store.risk_factors[key] = factor
        factors.append(factor)
    return factors


def active_risk_factors_for_change_event(change_event_id: str) -> list[RiskFactor]:
    return [
        factor
        for factor in store.risk_factors.values()
        if factor.change_event_id == change_event_id and factor.status == "active"
    ]


def _factor_type_for_state(state: DecisionNodeState) -> str | None:
    if state.node_id == "authorization_gate" and state.status == "disputed":
        return "authorization_disputed"
    if state.node_id == "authorization_gate" and state.status == "incomplete":
        return "missing_signed_change_order"
    if state.node_id == "pricing_gate" and state.status == "incomplete":
        return "pricing_approval_missing"
    return None


def _mitigated_factor_types_for_state(state: DecisionNodeState) -> list[str]:
    if state.node_id == "authorization_gate" and state.status == "supported":
        return ["missing_signed_change_order"]
    if state.node_id == "pricing_gate" and state.status == "supported":
        return ["pricing_approval_missing"]
    return []


def _mitigate_factor(
    change_event_id: str,
    factor_type: str,
    state: DecisionNodeState,
) -> RiskFactor | None:
    factor = store.risk_factors.get(f"{change_event_id}:{factor_type}")
    if not factor or factor.status == "mitigated":
        return factor

    factor.status = "mitigated"
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
