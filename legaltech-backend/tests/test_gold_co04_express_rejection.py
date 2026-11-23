"""Gold case CO-04: express price rejection, separate site direction, work, revised quote.

Extraction is replaced by the output gpt-4.1-mini actually returned for these
files (after the rejection guidance was added to the prompt); every item still
passes source-span validation. Semantic evaluation runs in heuristic mode.
Checkpoints use the manifest's available_at, as the case requires.
"""

import json
import tempfile
from pathlib import Path

import pytest

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

CASE = Path(__file__).parent / "fixtures" / "gold" / "CO04"
MANIFEST = json.loads((CASE / "manifest.json").read_text())
EXPECTED = json.loads((CASE / "expected_results.json").read_text())


def _item(signal_type, source_text, *, value=True, polarity="affirmative", temporal_status="completed",
          event_at=None, actor=None, ew="EW-504", confidence=0.9):
    return {"signal_type": signal_type, "value": value, "actor": actor, "source_text": source_text,
            "confidence": confidence, "extra_work_id": ew, "polarity": polarity,
            "temporal_status": temporal_status, "event_at": event_at}


MODEL_OUTPUT = {
    "Subject: Stair landing angle adjustment\n": [
        _item("extra_work_detected", "The latest steel sketch adds a new bent angle at the second-floor landing.", temporal_status="planned", event_at="2026-04-07", actor="Rose Vega"),
        _item("estimate_amount", "We estimate $10,200 of work beyond the original steel package.", value=10200, temporal_status="planned", event_at="2026-04-07", actor="Rose Vega"),
    ],
    "Subject: RE: Stair landing angle adjustment": [
        _item("approval_denied", "The $10,200 is not approved.", polarity="negative", temporal_status="denied", event_at="2026-04-08", actor="Carmen Reyes"),
        _item("pricing_unresolved", "Send an adjusted proposal.", polarity="uncertain", temporal_status="unknown", event_at="2026-04-08", actor="Carmen Reyes"),
    ],
    "Subject: Landing tomorrow": [
        _item("operational_direction", "Please keep the stair landing crew in place for the concrete pour on Friday.", temporal_status="planned", event_at="2026-04-09", actor="Matt Ellison"),
        _item("cost_communication", "The cost discussion is with Carmen.", temporal_status="unknown", event_at="2026-04-09", actor="Matt Ellison"),
    ],
    "DAILY FIELD REPORT": [
        _item("work_performed", "Installed the bent angle at the second-floor landing.", event_at="2026-04-10", ew=None, actor="Vector Ironworks"),
    ],
    "Subject: Revised landing price": [
        _item("estimate_amount", "Revised request is $8,900.", value=8900, temporal_status="planned", event_at="2026-04-13", actor="Rose Vega"),
        _item("pricing_unresolved", "Could you confirm this figure for the change log?", polarity="uncertain", temporal_status="unknown", event_at="2026-04-13", actor="Rose Vega"),
    ],
}


def _fake_ai_candidates(text: str):
    items = next((items for marker, items in MODEL_OUTPUT.items() if marker in text), [])
    return [candidate for item in items if (candidate := _candidate_from_item(item, text))]


@pytest.fixture(autouse=True)
def _pipeline(monkeypatch):
    store.reset()
    monkeypatch.setattr("app.extraction.signal_extractor.ai_candidates", _fake_ai_candidates)
    enabled = get_settings().model_copy(update={"ai_extraction_enabled": True, "openai_api_key": "test"})
    monkeypatch.setattr(pipeline_module, "get_settings", lambda: enabled)
    monkeypatch.setattr(upload_ingestor, "STORAGE_ROOT", Path(tempfile.mkdtemp(prefix="co04-")))
    yield
    store.reset()


def _matter_as_of(as_of: str) -> dict:
    matter = Matter(name="CO-04", tenant_id="GOLD")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name=MANIFEST["project"], project_number=MANIFEST["project_number"])
    store.projects[project.id] = project
    event = ChangeEvent(project_id=project.id, title="Stair landing")
    store.change_events[event.id] = event
    for doc in MANIFEST["documents"]:
        if doc["available_at"] > as_of:
            continue
        ingest_upload((CASE / "UPLOAD" / doc["filename"]).read_bytes(), doc["filename"],
                      DocumentType(doc["document_type"]), matter.id, sender=doc["sender"],
                      subject=doc["subject"], tenant_id="GOLD")
        while run_once():
            pass
    jobs = list(store.jobs.values())
    assert jobs and all(job.status.value in {"completed", "waiting_for_review"} for job in jobs)
    cards = list_issue_dashboard(tenant_id="GOLD", matter_id=matter.id)
    assert [card["extra_work_id"] for card in cards] == EXPECTED["expected"]["extra_work_ids"]
    return cards[0]


def _checks(card: dict) -> dict:
    return {f"{check.requirement_id}@{record['issue'].rule_ids[0]}": check
            for record in card["issues"] for check in record["assessment"].requirement_checks}


def _statements(ids) -> list[str]:
    return [store.assertions[item].statement for item in ids]


@pytest.mark.parametrize("timepoint", EXPECTED["timepoints"], ids=lambda tp: tp["as_of"])
def test_checkpoints_stay_potential_risk(timepoint) -> None:
    card = _matter_as_of(timepoint["as_of"])
    assert card["current_documentation_status"] == timepoint["expected_state"]


def test_express_rejection_is_a_price_dispute_not_missing_approval() -> None:
    card = _matter_as_of("2026-04-13T23:59")
    checks = _checks(card)

    for key in ("owner_approved_additional_cost@EXTRA_WORK_COST_COMMUNICATION", "approval_documented@CHANGE_ORDER_APPROVAL"):
        assert checks[key].result.value == "DISPUTED", key
        assert "The $10,200 is not approved." in _statements(checks[key].contrary_evidence_ids)
        # Must not: treat the revised quote as an accepted amount.
        assert not any("8,900" in text for text in _statements(checks[key].supporting_evidence_ids))
    assert set(card["contrary_requirements"]) >= {"owner_approved_additional_cost", "approval_documented"}


def test_prework_notice_survives_the_revised_quote_and_work_is_recognised() -> None:
    card = _matter_as_of("2026-04-13T23:59")
    checks = _checks(card)
    cost = checks["cost_impact_communicated@EXTRA_WORK_COST_COMMUNICATION"]

    assert cost.result.value == "REQUIREMENT_SATISFIED"
    assert "We estimate $10,200 of work beyond the original steel package." in _statements(cost.supporting_evidence_ids)
    assert UncertaintyReason.cost_communication_after_work_start not in cost.uncertainty_reasons
    # Must not: assume the rejection means no work was performed.
    assert checks["extra_work_occurred@EXTRA_WORK_COST_COMMUNICATION"].result.value == "REQUIREMENT_SATISFIED"


def test_site_direction_is_not_price_approval() -> None:
    card = _matter_as_of("2026-04-09T17:00")
    checks = _checks(card)
    for key in ("owner_approved_additional_cost@EXTRA_WORK_COST_COMMUNICATION", "approval_documented@CHANGE_ORDER_APPROVAL"):
        assert not any("keep the stair landing crew" in text for text in _statements(checks[key].supporting_evidence_ids))
