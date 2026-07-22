from app.decision_engine.node_results import make_node_state
from app.models import DecisionNodeState, ExtractedSignal
from app.repositories.memory import store
from app.validation.contradiction_detector import detect_contradictions

TREE_VERSION = "1.0"


def recompute_nodes(change_event_id: str | None, node_ids: list[str]) -> list[DecisionNodeState]:
    if not change_event_id:
        return []

    signals = [
        signal for signal in store.signals.values() if signal.change_event_id == change_event_id
    ]
    states: list[DecisionNodeState] = []
    for node_id in node_ids:
        if node_id == "authorization_gate":
            states.append(_evaluate_authorization(change_event_id, signals))
        elif node_id == "pricing_gate":
            states.append(_evaluate_pricing(change_event_id, signals))
        elif node_id == "amount_consistency_gate":
            states.append(_evaluate_amount_consistency(change_event_id, signals))

    for state in states:
        store.node_states[f"{change_event_id}:{state.node_id}:{state.tree_version}"] = state
    return states


def _evaluate_authorization(change_event_id: str, signals: list[ExtractedSignal]) -> DecisionNodeState:
    proceed = [signal for signal in signals if signal.signal_type == "instruction_to_proceed"]
    signed = [signal for signal in signals if signal.signal_type == "signed_change_order"]
    contradictions = detect_contradictions(signals)

    if contradictions:
        supporting = [pair[0] for pair in contradictions]
        contrary = [pair[1] for pair in contradictions]
        return make_node_state(change_event_id, TREE_VERSION, "authorization_gate", "disputed", supporting, contrary)
    if proceed and not signed:
        return make_node_state(
            change_event_id,
            TREE_VERSION,
            "authorization_gate",
            "incomplete",
            proceed,
            missing_factors=["signed_change_order", "authorized representative confirmation"],
        )
    if signed:
        return make_node_state(change_event_id, TREE_VERSION, "authorization_gate", "supported", signed)
    return make_node_state(
        change_event_id,
        TREE_VERSION,
        "authorization_gate",
        "unknown",
        [],
        missing_factors=["instruction_to_proceed", "signed_change_order"],
    )


def _evaluate_pricing(change_event_id: str, signals: list[ExtractedSignal]) -> DecisionNodeState:
    invoice = [signal for signal in signals if signal.signal_type == "invoice_submitted"]
    if invoice:
        return make_node_state(
            change_event_id,
            TREE_VERSION,
            "pricing_gate",
            "incomplete",
            invoice,
            missing_factors=["approved_amount", "pricing_method"],
        )
    return make_node_state(change_event_id, TREE_VERSION, "pricing_gate", "unknown", [])


def _evaluate_amount_consistency(change_event_id: str, signals: list[ExtractedSignal]) -> DecisionNodeState:
    amount_signals = [
        signal
        for signal in signals
        if signal.signal_type in {"estimate_amount", "approved_amount", "invoice_amount"}
    ]
    status = "unknown" if not amount_signals else "needs_review"
    return make_node_state(change_event_id, TREE_VERSION, "amount_consistency_gate", status, amount_signals)
