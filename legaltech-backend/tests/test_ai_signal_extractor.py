from app.extraction.ai_signal_extractor import _candidate_from_item, ai_candidates
from app.extraction.signal_extractor import _heuristic_candidates


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


def test_future_signed_change_order_is_not_extracted_as_executed() -> None:
    planned = _heuristic_candidates(
        "We can start on February 5 after a signed change order."
    )
    assert not any(item.signal_type == "signed_change_order" for item in planned)

    executed = _heuristic_candidates(
        "Status: Signed change order / executed change order."
    )
    assert any(item.signal_type == "signed_change_order" for item in executed)


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
