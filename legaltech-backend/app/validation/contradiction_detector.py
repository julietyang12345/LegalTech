from app.models import ExtractedSignal


def detect_contradictions(signals: list[ExtractedSignal]) -> list[tuple[ExtractedSignal, ExtractedSignal]]:
    by_type: dict[str, list[ExtractedSignal]] = {}
    for signal in signals:
        by_type.setdefault(signal.signal_type, []).append(signal)

    contradictions: list[tuple[ExtractedSignal, ExtractedSignal]] = []
    contradictions.extend(_pairs(by_type, ["instruction_to_proceed", "operational_direction", "express_authorization"], ["authorization_denial"]))
    contradictions.extend(_pairs(by_type, ["actor_authority"], ["delegated_authority_limited"]))
    return contradictions


def _pairs(
    by_type: dict[str, list[ExtractedSignal]],
    supporting_types: list[str],
    contrary_types: list[str],
) -> list[tuple[ExtractedSignal, ExtractedSignal]]:
    supporting = [signal for signal_type in supporting_types for signal in by_type.get(signal_type, [])]
    contrary = [signal for signal_type in contrary_types for signal in by_type.get(signal_type, [])]
    return [
        (support, oppose)
        for support in supporting
        for oppose in contrary
        if _same_scope(support, oppose)
    ]


def _same_scope(left: ExtractedSignal, right: ExtractedSignal) -> bool:
    left_value = left.value if isinstance(left.value, dict) else {}
    right_value = right.value if isinstance(right.value, dict) else {}
    left_scope = left_value.get("extra_work_id") or left_value.get("event_id")
    right_scope = right_value.get("extra_work_id") or right_value.get("event_id")
    # Unscoped signals may still be compared within one change event. Signals
    # carrying different explicit scopes must never create a cross-EW conflict.
    return not left_scope or not right_scope or left_scope == right_scope
