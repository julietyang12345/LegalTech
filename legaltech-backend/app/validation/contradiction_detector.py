from app.models import ExtractedSignal


def detect_contradictions(signals: list[ExtractedSignal]) -> list[tuple[ExtractedSignal, ExtractedSignal]]:
    by_type = {signal.signal_type: signal for signal in signals}
    if "instruction_to_proceed" in by_type and "authorization_denial" in by_type:
        return [(by_type["instruction_to_proceed"], by_type["authorization_denial"])]
    return []
