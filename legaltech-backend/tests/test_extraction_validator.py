from pathlib import Path

from app.models import Document, ExtractedSignal
from app.models.domain import DocumentType
from app.validation.extraction_validator import validate_signals
from app.services.hashing import stable_text_hash


def _document(tmp_path: Path, text: str) -> Document:
    source = tmp_path / "evidence.txt"
    source.write_text(text, encoding="utf-8")
    return Document(
        document_type=DocumentType.email,
        file_hash="fixture",
        storage_path=str(source),
        metadata={"original_filename": source.name},
        matter_id="M-1",
    )


def _signal(document: Document, source_text: str, signal_type: str = "price_approval", **value) -> ExtractedSignal:
    return ExtractedSignal(
        signal_type=signal_type,
        value=value,
        source_document_id=document.id,
        source_text=source_text,
        confidence=0.9,
        source_text_hash=stable_text_hash(source_text),
    )


def test_validator_rejects_real_quote_with_inconsistent_semantics(tmp_path: Path) -> None:
    document = _document(tmp_path, "We have not approved the revised price for EW-502.")
    signal = _signal(
        document,
        "We have not approved the revised price for EW-502.",
        polarity="negative",
        temporal_status="completed",
        extra_work_id="EW-502",
    )
    assert validate_signals(document, [signal]) == []


def test_validator_rejects_cross_extra_work_signal(tmp_path: Path) -> None:
    document = _document(tmp_path, "I approve the price for EW-502.")
    signal = _signal(
        document,
        "I approve the price for EW-502.",
        polarity="affirmative",
        temporal_status="completed",
        extra_work_id="EW-999",
    )
    assert validate_signals(document, [signal]) == []


def test_validator_requires_exact_source_excerpt(tmp_path: Path) -> None:
    document = _document(tmp_path, "I approve the price for EW-502.")
    signal = _signal(
        document,
        "I approve the price for EW-502 and the adjacent scope.",
        polarity="affirmative",
        temporal_status="completed",
    )
    assert validate_signals(document, [signal]) == []
