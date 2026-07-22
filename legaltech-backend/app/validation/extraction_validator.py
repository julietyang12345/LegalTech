from app.models import Document, ExtractedSignal


def validate_signals(document: Document, signals: list[ExtractedSignal]) -> list[ExtractedSignal]:
    return [
        signal
        for signal in signals
        if signal.source_document_id == document.id and signal.source_text and signal.confidence >= 0.5
    ]
