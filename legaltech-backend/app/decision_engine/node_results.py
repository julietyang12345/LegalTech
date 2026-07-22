from app.models import DecisionNodeState, ExtractedSignal


def make_node_state(
    change_event_id: str,
    tree_version: str,
    node_id: str,
    status: str,
    signals: list[ExtractedSignal],
    contrary_signals: list[ExtractedSignal] | None = None,
    missing_factors: list[str] | None = None,
) -> DecisionNodeState:
    contrary_signals = contrary_signals or []
    missing_factors = missing_factors or []
    return DecisionNodeState(
        change_event_id=change_event_id,
        tree_version=tree_version,
        node_id=node_id,
        status=status,
        supporting_signal_ids=[signal.id for signal in signals],
        contrary_signal_ids=[signal.id for signal in contrary_signals],
        missing_factors=missing_factors,
    )
