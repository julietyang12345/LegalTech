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
    return [(support, oppose) for support in supporting for oppose in contrary]
