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
        elif node_id == "invoice_support_gate":
            states.append(_evaluate_invoice_support(change_event_id, signals))
        elif node_id in {"amount_consistency_gate", "quantum_gate"}:
            states.append(_evaluate_quantum(change_event_id, signals))
        elif node_id == "document_consistency_gate":
            states.append(_evaluate_document_consistency(change_event_id, signals))
        elif node_id == "process_compliance_gate":
            states.append(_evaluate_process_compliance(change_event_id, signals))
        elif node_id == "acceleration_gate":
            states.append(_evaluate_acceleration(change_event_id, signals))

    for state in states:
        store.node_states[f"{change_event_id}:{state.node_id}:{state.tree_version}"] = state
    return states


def _evaluate_authorization(change_event_id: str, signals: list[ExtractedSignal]) -> DecisionNodeState:
    proceed = _signals(signals, {"instruction_to_proceed", "operational_direction"})
    express = _signals(signals, {"express_authorization", "written_authorization", "actor_authority"})
    signed = _signals(signals, {"signed_change_order"})
    contradictions = detect_contradictions(signals)

    if contradictions:
        supporting = [pair[0] for pair in contradictions]
        contrary = [pair[1] for pair in contradictions]
        return make_node_state(change_event_id, TREE_VERSION, "authorization_gate", "disputed", supporting, contrary)
    if signed or express:
        return make_node_state(change_event_id, TREE_VERSION, "authorization_gate", "supported", signed + express)
    if proceed:
        return make_node_state(
            change_event_id,
            TREE_VERSION,
            "authorization_gate",
            "incomplete",
            proceed,
            missing_factors=["signed_change_order", "authorized representative confirmation"],
        )
    return make_node_state(
        change_event_id,
        TREE_VERSION,
        "authorization_gate",
        "unknown",
        [],
        missing_factors=["instruction_to_proceed", "signed_change_order"],
    )


def _evaluate_pricing(change_event_id: str, signals: list[ExtractedSignal]) -> DecisionNodeState:
    invoice = _signals(signals, {"invoice_submitted", "invoice_amount"})
    approved = _signals(signals, {"approved_amount", "price_approval"})
    pricing_method = _signals(signals, {"pricing_method"})
    signed = _signals(signals, {"signed_change_order"})
    if approved and pricing_method:
        return make_node_state(change_event_id, TREE_VERSION, "pricing_gate", "supported", approved + pricing_method)
    if invoice or approved:
        return make_node_state(
            change_event_id,
            TREE_VERSION,
            "pricing_gate",
            "incomplete",
            invoice + approved + pricing_method,
            missing_factors=_missing(
                [("approved_amount", approved), ("pricing_method", pricing_method)]
            ),
        )
    if signed:
        return make_node_state(
            change_event_id,
            TREE_VERSION,
            "pricing_gate",
            "needs_review",
            signed,
            missing_factors=["approved_amount", "pricing_method"],
        )
    return make_node_state(change_event_id, TREE_VERSION, "pricing_gate", "unknown", [])


def _evaluate_invoice_support(change_event_id: str, signals: list[ExtractedSignal]) -> DecisionNodeState:
    invoice = _signals(signals, {"invoice_submitted", "invoice_amount"})
    support = _signals(signals, {"invoice_support"})
    contrary = _signals(signals, {"attachment_missing", "attachment_unsigned"})
    if contrary:
        return make_node_state(change_event_id, TREE_VERSION, "invoice_support_gate", "contradicted", invoice, contrary)
    if invoice and support:
        return make_node_state(change_event_id, TREE_VERSION, "invoice_support_gate", "supported", invoice + support)
    if invoice:
        return make_node_state(
            change_event_id,
            TREE_VERSION,
            "invoice_support_gate",
            "incomplete",
            invoice,
            missing_factors=["invoice_support"],
        )
    return make_node_state(change_event_id, TREE_VERSION, "invoice_support_gate", "unknown", [])


def _evaluate_quantum(change_event_id: str, signals: list[ExtractedSignal]) -> DecisionNodeState:
    amount_signals = _signals(signals, {"estimate_amount", "approved_amount", "invoice_amount"})
    invoice_amounts = _numeric_values(_signals(signals, {"invoice_amount"}))
    approved_amounts = _numeric_values(_signals(signals, {"approved_amount", "estimate_amount"}))
    if invoice_amounts and approved_amounts and max(invoice_amounts) > max(approved_amounts):
        return make_node_state(change_event_id, TREE_VERSION, "quantum_gate", "disputed", amount_signals)
    status = "unknown" if not amount_signals else "needs_review"
    return make_node_state(change_event_id, TREE_VERSION, "quantum_gate", status, amount_signals)


def _evaluate_document_consistency(change_event_id: str, signals: list[ExtractedSignal]) -> DecisionNodeState:
    support = _signals(signals, {"project_number", "po_number", "approved_amount", "invoice_amount"})
    contrary = _signals(
        signals,
        {
            "attachment_missing",
            "attachment_unsigned",
            "project_mismatch",
            "amount_mismatch",
            "invoice_before_authorization",
        },
    )
    if contrary:
        return make_node_state(change_event_id, TREE_VERSION, "document_consistency_gate", "contradicted", support, contrary)
    if support:
        return make_node_state(change_event_id, TREE_VERSION, "document_consistency_gate", "needs_review", support)
    return make_node_state(change_event_id, TREE_VERSION, "document_consistency_gate", "unknown", [])


def _evaluate_process_compliance(change_event_id: str, signals: list[ExtractedSignal]) -> DecisionNodeState:
    documents = _signals(signals, {"written_notice", "formal_change_document", "signed_change_order"})
    authorization = _signals(signals, {"express_authorization"})
    signed = _signals(signals, {"signed_change_order"})
    contrary = _signals(signals, {"delegated_authority_limited"})
    if contrary:
        return make_node_state(change_event_id, TREE_VERSION, "process_compliance_gate", "contradicted", documents + authorization, contrary)
    if signed:
        return make_node_state(change_event_id, TREE_VERSION, "process_compliance_gate", "supported", documents + authorization)
    if documents and authorization:
        return make_node_state(change_event_id, TREE_VERSION, "process_compliance_gate", "supported", documents + authorization)
    if documents or authorization:
        return make_node_state(
            change_event_id,
            TREE_VERSION,
            "process_compliance_gate",
            "incomplete",
            documents + authorization,
            missing_factors=_missing(
                [("written_notice_or_formal_change_document", documents), ("express_authorization", authorization)]
            ),
        )
    return make_node_state(change_event_id, TREE_VERSION, "process_compliance_gate", "unknown", [])


def _evaluate_acceleration(change_event_id: str, signals: list[ExtractedSignal]) -> DecisionNodeState:
    pressure = _signals(signals, {"schedule_pressure"})
    direction = _signals(signals, {"operational_direction", "instruction_to_proceed"})
    if pressure and direction:
        return make_node_state(change_event_id, TREE_VERSION, "acceleration_gate", "needs_review", pressure + direction)
    return make_node_state(change_event_id, TREE_VERSION, "acceleration_gate", "unknown", pressure + direction)


def _signals(signals: list[ExtractedSignal], signal_types: set[str]) -> list[ExtractedSignal]:
    return [signal for signal in signals if signal.signal_type in signal_types]


def _missing(requirements: list[tuple[str, list[ExtractedSignal]]]) -> list[str]:
    return [label for label, matches in requirements if not matches]


def _numeric_values(signals: list[ExtractedSignal]) -> list[float]:
    values: list[float] = []
    for signal in signals:
        try:
            values.append(float(signal.value))
        except (TypeError, ValueError):
            continue
    return values
