"""Gold case CO-05: late-executed change order, run file-by-file through the pipeline.

The model is replaced by fixed extractor output that mirrors what gpt-4.1-mini
actually returned for these files (including verbal ``"confidence": "high"``,
which previously caused every email signal to be dropped). Each item still goes
through ``_candidate_from_item``, so source-span and confidence validation is
exercised. The semantic evaluator and retrieval run in heuristic mode.
"""

import json
import tempfile
from pathlib import Path

import pytest

from app.analysis.event_time import assertion_event_date
from app.api.issues import list_issue_dashboard
from app.core.config import get_settings
from app.domain_contracts.schemas import UncertaintyReason
from app.extraction.ai_signal_extractor import _candidate_from_item
from app.ingestion import upload_ingestor
from app.ingestion.upload_ingestor import ingest_upload
from app.jobs.worker import run_once
from app.models import ChangeEvent, Matter, Project
from app.models.domain import DocumentType
from app.repositories.memory import store
from app.services import pipeline as pipeline_module

CASE = Path(__file__).parent / "fixtures" / "gold" / "CO05"
MANIFEST = json.loads((CASE / "manifest.json").read_text())
EXPECTED = json.loads((CASE / "expected_results.json").read_text())


def _item(signal_type, source_text, *, value=True, event_at=None, polarity="affirmative",
          temporal_status="completed", actor=None, ew="EW-505", confidence="high"):
    return {
        "signal_type": signal_type, "value": value, "actor": actor, "source_text": source_text,
        "confidence": confidence, "extra_work_id": ew, "polarity": polarity,
        "temporal_status": temporal_status, "event_at": event_at,
    }


# Keyed by a marker line unique to each file.
MODEL_OUTPUT = {
    "Subject: Additional duct reroute near service chase": [
        _item("extra_work_detected", "The service chase needs a duct reroute around the new riser.", temporal_status="planned", event_at="April 7, 2026", actor="Owen Fox"),
        _item("estimate_amount", "current estimate is $13,600", value=13600, temporal_status="unknown", event_at="April 7, 2026 3:00 PM Pacific", actor="Owen Fox"),
        _item("work_planned", "We can start Thursday if released.", polarity="uncertain", temporal_status="planned", event_at="April 7, 2026", actor="Owen Fox"),
    ],
    "Subject: RE: Additional duct reroute": [
        _item("instruction_to_proceed", "Proceed with the reroute so wall framing can close out.", event_at="April 8, 2026", actor="Anika Patel"),
        # The model mislabels a future change form as a formal document; the
        # planned temporal status must keep it from proving a price basis.
        _item("formal_change_document", "We need to finalize the change form once the revised routing is documented.", temporal_status="planned", event_at="April 8, 2026", actor="Anika Patel"),
    ],
    "DAILY FIELD REPORT": [
        # No EW reference in this file: scope must come from matching, not the model.
        _item("work_performed", "Crew completed most of the reroute Thursday and Friday.", event_at="April 10, 2026", ew=None, actor="Stellar Mechanical"),
    ],
    "Subject: Final measure for service chase": [
        _item("estimate_amount", "We can hold the change at $13,600 if you can sign today.", value=13600, temporal_status="conditional", event_at="April 13, 2026", actor="Owen Fox"),
    ],
    "Change Order Number: CO-505": [
        _item("formal_change_document", "Scope of Change: Duct reroute at service chase per routing sketch M-22 Rev B (EW-505), including work performed April 9–10, 2026", event_at="2026-04-14"),
        _item("approved_amount", "Contract Price Adjustment: $13,600.00", value=13600, event_at="2026-04-14"),
        _item("signed_change_order", "Owner signature: /s/ Anika Patel, April 14, 2026", event_at="2026-04-14", actor="Anika Patel"),
        _item("work_performed", "including work performed April 9–10, 2026", event_at="2026-04-09 to 2026-04-10"),
    ],
    "Invoice Number: INV-505": [
        _item("invoice_amount", "Amount: $13,600.00", value=13600, event_at="April 17, 2026"),
        _item("invoice_submitted", "Invoice Number: INV-505", event_at="April 17, 2026"),
    ],
}


def _fake_ai_candidates(text: str):
    items = next((items for marker, items in MODEL_OUTPUT.items() if marker in text), [])
    return [candidate for item in items if (candidate := _candidate_from_item(item, text))]


@pytest.fixture(autouse=True)
def _pipeline(monkeypatch):
    store.reset()
    monkeypatch.setattr("app.extraction.signal_extractor.ai_candidates", _fake_ai_candidates)
    # Extraction is "enabled" (the fake stands in for the model); semantic
    # evaluation and retrieval stay off because their own settings lookup is
    # untouched, so no network call can happen.
    enabled = get_settings().model_copy(update={"ai_extraction_enabled": True, "openai_api_key": "test"})
    monkeypatch.setattr(pipeline_module, "get_settings", lambda: enabled)
    disabled = get_settings().model_copy(update={"ai_extraction_enabled": False, "ai_rule_discovery_enabled": False})
    for module in ("app.legal_knowledge.ai_rule_discovery", "app.analysis.targeted_retrieval"):
        monkeypatch.setattr(f"{module}.get_settings", lambda: disabled)
    monkeypatch.setattr("app.core.config.get_settings", lambda: disabled)
    storage = tempfile.mkdtemp(prefix="co05-")
    monkeypatch.setattr(upload_ingestor, "STORAGE_ROOT", Path(storage))
    yield
    store.reset()


def _new_matter() -> Matter:
    matter = Matter(name="CO-05", tenant_id="GOLD")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name=MANIFEST["project"], project_number=MANIFEST["project_number"])
    store.projects[project.id] = project
    event = ChangeEvent(project_id=project.id, title="Extra Work Cost Communication")
    store.change_events[event.id] = event
    return matter


def _upload(matter: Matter, through: str) -> None:
    """Upload, in manifest order, every document available by ``through``."""
    already = {doc.metadata.get("original_filename") for doc in store.documents.values() if doc.matter_id == matter.id}
    for doc in MANIFEST["documents"]:
        if doc["available_at"] > through or doc["filename"] in already:
            continue
        path = CASE / "UPLOAD" / doc["filename"]
        ingest_upload(
            path.read_bytes(), doc["filename"], DocumentType(doc["document_type"]), matter.id,
            sender=doc["sender"], subject=doc["subject"], tenant_id="GOLD",
        )
        while run_once():
            pass
    jobs = [job for job in store.jobs.values() if store.documents[job.document_id].matter_id == matter.id]
    assert jobs and all(job.status.value in {"completed", "waiting_for_review"} for job in jobs), [
        (job.document_id, job.status.value, job.error_message) for job in jobs
    ]


def _card(matter: Matter) -> dict:
    cards = list_issue_dashboard(tenant_id="GOLD", matter_id=matter.id)
    assert [card["extra_work_id"] for card in cards] == EXPECTED["expected"]["extra_work_ids"]
    return cards[0]


def _checks(card: dict) -> dict:
    return {
        check.requirement_id + "@" + record["issue"].rule_ids[0]: check
        for record in card["issues"]
        for check in (record["assessment"].requirement_checks if record["assessment"] else [])
    }


def _timepoint(as_of: str) -> dict:
    return next(item for item in EXPECTED["timepoints"] if item["as_of"] == as_of)


def test_c03_as_of_april_8_is_potential_risk() -> None:
    expected = _timepoint("2026-04-08T23:59")
    matter = _new_matter()
    _upload(matter, expected["as_of"])
    card = _card(matter)
    checks = _checks(card)

    assert card["current_documentation_status"] == expected["expected_state"]
    assert card["analysis_incomplete"] is False
    assert "approval_documented" in card["missing_requirements"] or "owner_approved_additional_cost" in card["missing_requirements"]
    assert checks["cost_impact_communicated@EXTRA_WORK_COST_COMMUNICATION"].result.value == "REQUIREMENT_SATISFIED"
    # A planned change form is not a price-basis document.
    assert checks["price_basis_identified@CHANGE_ORDER_APPROVAL"].result.value != "REQUIREMENT_SATISFIED"


def test_c04_as_of_april_14_resolves_gap_but_keeps_timing_review() -> None:
    expected = _timepoint("2026-04-14T23:59")
    matter = _new_matter()
    _upload(matter, expected["as_of"])
    card = _card(matter)
    checks = _checks(card)

    assert card["current_documentation_status"] == expected["expected_state"]
    assert card["missing_requirements"] == []
    assert card["historical_timing_review_required"] is expected["residual_timing_review_required"]
    assert card["claimed_amount"] == 13600
    assert not card["title"].upper().startswith("PROJECT CORRESPONDENCE")

    for key in (
        "extra_work_occurred@EXTRA_WORK_COST_COMMUNICATION",
        "cost_impact_communicated@EXTRA_WORK_COST_COMMUNICATION",
        "owner_approved_additional_cost@EXTRA_WORK_COST_COMMUNICATION",
        "approval_documented@CHANGE_ORDER_APPROVAL",
        "price_basis_identified@CHANGE_ORDER_APPROVAL",
    ):
        assert checks[key].result.value == "REQUIREMENT_SATISFIED", key

    approval = checks["owner_approved_additional_cost@EXTRA_WORK_COST_COMMUNICATION"]
    # Must not: treat the April 14 signature as pre-work authorization.
    assert UncertaintyReason.approval_after_work_start in approval.uncertainty_reasons
    assert approval.requires_lawyer_review
    approval_docs = {store.assertions[item].statement for item in approval.supporting_evidence_ids}
    assert any("April 14, 2026" in text or "13,600" in text for text in approval_docs)
    # Cost was communicated before work: no late-notice flag.
    cost = checks["cost_impact_communicated@EXTRA_WORK_COST_COMMUNICATION"]
    assert UncertaintyReason.cost_communication_after_work_start not in cost.uncertainty_reasons


def test_incremental_same_matter_moves_from_risk_to_resolved() -> None:
    matter = _new_matter()
    _upload(matter, "2026-04-08T23:59")
    before = _card(matter)
    _upload(matter, "2026-04-14T23:59")
    after = _card(matter)

    assert before["current_documentation_status"] == "POTENTIAL_RISK"
    assert after["current_documentation_status"] == "RESOLVED"
    assert before["missing_requirements"] and not after["missing_requirements"]
    assert after["historical_timing_review_required"] is True
    # The earlier assessment is retained as history, not overwritten.
    histories = [record["assessment_history"] for record in after["issues"]]
    assert any(len(history) > 1 for history in histories)


def test_evidence_dates_come_from_source_text_not_upload_time() -> None:
    matter = _new_matter()
    _upload(matter, "2026-04-14T23:59")
    dated = [a for a in store.assertions.values() if a.matter_id == matter.id and a.assertion_type != "project_number"]

    assert dated
    for assertion in dated:
        event_date = assertion_event_date(assertion)
        assert event_date is not None and event_date.startswith("2026-04"), (assertion.assertion_type, event_date)
