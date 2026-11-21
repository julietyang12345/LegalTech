from app.extraction.ai_signal_extractor import _candidate_from_item, ai_candidates
from app.extraction.schemas import SignalCandidate
from app.extraction.signal_extractor import extract_atomic_signals
from app.parsers.base import ParsedContent


def test_ai_candidates_disabled_when_feature_flag_is_off(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.extraction.ai_signal_extractor.get_settings",
        lambda: type("Settings", (), {"ai_extraction_enabled": False, "openai_api_key": None})(),
    )
    assert ai_candidates("Please proceed with the work.") == []


def test_candidate_requires_source_excerpt_from_document() -> None:
    text = "Please proceed with the east slope work."

    candidate = _candidate_from_item(
        {
            "signal_type": "instruction_to_proceed",
            "value": True,
            "actor": "PM",
            "source_text": "Please proceed with the east slope work.",
            "confidence": 0.91,
        },
        text,
    )

    assert candidate is not None
    assert candidate.signal_type == "instruction_to_proceed"
    assert candidate.confidence == 0.91

    unsupported = _candidate_from_item(
        {
            "signal_type": "instruction_to_proceed",
            "value": True,
            "source_text": "Unsupported paraphrase.",
            "confidence": 0.91,
        },
        text,
    )

    assert unsupported is None


def test_ai_candidate_requires_bounded_semantic_fields() -> None:
    candidate = _candidate_from_item(
        {
            "signal_type": "price_approval",
            "value": 25000,
            "source_text": "I approve the additional cost of $25,000 for EW-101.",
            "confidence": 0.9,
            "extra_work_id": "EW-101",
            "polarity": "affirmative",
            "temporal_status": "completed",
        },
        "I approve the additional cost of $25,000 for EW-101.",
    )
    assert candidate is not None
    assert candidate.extra_work_id == "EW-101"
    assert candidate.temporal_status == "completed"


def test_explicit_source_date_is_preserved_for_dashboard_timeline(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.extraction.signal_extractor.ai_candidates",
        lambda _text: [SignalCandidate(signal_type="instruction_to_proceed", value=True, source_text="Please proceed with the extra work.", confidence=0.9)],
    )
    document = type("Document", (), {"id": "DOC-DATE", "metadata": {"original_filename": "02_owner_proceed_only.txt"}})()
    signals = extract_atomic_signals(
        document,
        ParsedContent(document_id="DOC-DATE", text="Feb 3: Please proceed with the extra work."),
    )

    proceed = next(signal for signal in signals if signal.signal_type == "instruction_to_proceed")
    assert proceed.value["event_at"] == "Feb 3"


def test_ai_disabled_keeps_only_deterministic_identifiers(monkeypatch) -> None:
    monkeypatch.setattr("app.extraction.signal_extractor.ai_candidates", lambda _text: [])
    document = type("Document", (), {"id": "DOC-ID", "metadata": {}})()
    signals = extract_atomic_signals(
        document,
        ParsedContent(document_id="DOC-ID", text="PRJ-502 Go ahead with the additional framing."),
    )
    assert {signal.signal_type for signal in signals} == {"project_number"}


def test_event_date_comes_from_signal_excerpt_not_later_document_date(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.extraction.signal_extractor.ai_candidates",
        lambda _text: [SignalCandidate(
            signal_type="instruction_to_proceed", value=True,
            source_text="April 8: Go ahead with the framing.", confidence=0.9,
        )],
    )
    document = type("Document", (), {"id": "DOC-TIME", "metadata": {}})()
    signals = extract_atomic_signals(
        document,
        ParsedContent(document_id="DOC-TIME", text="April 8: Go ahead with the framing. Planned start April 10."),
    )
    assert signals[0].value["event_at"] == "April 8"


def test_extractor_preserves_semantic_candidate_for_central_validator(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.extraction.signal_extractor.ai_candidates",
        lambda _text: [SignalCandidate(
            signal_type="price_approval", value=True,
            source_text="We have not approved the revised price.", confidence=0.9,
            polarity="negative", temporal_status="completed",
        )],
    )
    document = type("Document", (), {"id": "DOC-VALIDATE", "metadata": {}})()
    signals = extract_atomic_signals(
        document,
        ParsedContent(document_id="DOC-VALIDATE", text="We have not approved the revised price."),
    )
    assert signals[0].value["polarity"] == "negative"
