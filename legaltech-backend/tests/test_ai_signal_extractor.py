from app.extraction.ai_signal_extractor import _candidate_from_item, ai_candidates


def test_ai_candidates_disabled_without_env_key() -> None:
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
