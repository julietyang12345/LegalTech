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


@pytest.mark.parametrize("signature_type", ["signed_change_order", "express_authorization", "written_authorization"])
def test_c04_resolves_whichever_type_the_model_gives_the_signature_line(monkeypatch, signature_type) -> None:
    """Live runs labelled the same "Owner signature" line with all three types."""
    outputs = {marker: [dict(item) for item in items] for marker, items in MODEL_OUTPUT.items()}
    for item in outputs["Change Order Number: CO-505"]:
        if item["source_text"].startswith("Owner signature"):
            item["signal_type"] = signature_type
    monkeypatch.setattr(
        "app.extraction.signal_extractor.ai_candidates",
        lambda text: [c for item in next((v for k, v in outputs.items() if k in text), []) if (c := _candidate_from_item(item, text))],
    )
    matter = _new_matter()
    _upload(matter, "2026-04-14T23:59")
    card = _card(matter)

    assert card["current_documentation_status"] == "RESOLVED", card["missing_requirements"]
    assert card["historical_timing_review_required"] is True


def _late_approval(card: dict) -> list[dict]:
    return [item for item in card["timing_concerns"] if item["timing_status"] == "AFTER_WORK_START"]


def test_c04_approval_timing_is_judged_separately_from_approval_existence() -> None:
    matter = _new_matter()
    _upload(matter, "2026-04-14T23:59")
    card = _card(matter)
    checks = _checks(card)

    approval = checks["approval_documented@CHANGE_ORDER_APPROVAL"]
    # The signed CO exists...
    assert approval.result.value == "REQUIREMENT_SATISFIED"
    # ...and was signed after the work, as a separate structured finding.
    assert approval.timing.status.value == "AFTER_WORK_START"
    assert (approval.timing.fact_date, approval.timing.work_start_date) == ("2026-04-14", "2026-04-09")

    cost = checks["cost_impact_communicated@EXTRA_WORK_COST_COMMUNICATION"]
    assert cost.timing.status.value == "BEFORE_WORK_START"
    assert cost.timing.fact_date == "2026-04-07"

    # Late timing is a historical concern, never an evidence gap.
    assert card["missing_requirements"] == []
    late = _late_approval(card)
    assert {item["requirement_id"] for item in late} == {"approval_documented", "owner_approved_additional_cost"}
    assert all("05_later_signed_co.txt" in [d["filename"] for d in item["fact_documents"]] for item in late)
    assert any("03_daily_report.txt" in [d["filename"] for d in item["work_documents"]] for item in late)
    assert not any(item["requirement_id"] == "cost_impact_communicated" for item in card["timing_concerns"])

    conclusion = next(r["assessment"].conclusion for r in card["issues"] if r["issue"].rule_ids[0] == "CHANGE_ORDER_APPROVAL")
    assert "documented April 14, 2026, after work began April 9, 2026" in conclusion
    assert "lack sufficient evidence" not in conclusion
    assert "do not request them again" in card["next_action"]


def test_c04_dates_recited_inside_the_co_do_not_become_its_signing_date(monkeypatch) -> None:
    """Live runs dated the CO's lines April 9 because the scope recites "work
    performed April 9-10". Only the work fact keeps that date."""
    outputs = {marker: [dict(item) for item in items] for marker, items in MODEL_OUTPUT.items()}
    for item in outputs["Change Order Number: CO-505"]:
        if item["signal_type"] != "work_performed":
            item["event_at"] = "April 9, 2026"
    monkeypatch.setattr(
        "app.extraction.signal_extractor.ai_candidates",
        lambda text: [c for item in next((v for k, v in outputs.items() if k in text), []) if (c := _candidate_from_item(item, text))],
    )
    matter = _new_matter()
    _upload(matter, "2026-04-14T23:59")
    approval = _checks(_card(matter))["approval_documented@CHANGE_ORDER_APPROVAL"]

    assert approval.timing.status.value == "AFTER_WORK_START"
    assert approval.timing.fact_date == "2026-04-14"
    co_scope = next(a for a in store.assertions.values() if a.statement.startswith("Scope of Change"))
    assert assertion_event_date(co_scope) == "2026-04-14"
    assert co_scope.value["model_event_at"] == "April 9, 2026"


def test_c04_model_context_label_does_not_erase_the_april_7_cost_notice(monkeypatch) -> None:
    """Live runs reported "Cost notice: Not Found" although the timeline showed
    the April 7 estimate: the model labelled it CONTEXT and it was dropped."""
    from app.analysis.semantic_evaluator import RelationJudgment, SemanticJudgment

    def judge(requirement, candidates):
        if requirement.id != "cost_impact_communicated":
            return None
        return SemanticJudgment(result="uncertain", relations={
            a.id: RelationJudgment(a.id, "CONTEXT", "background estimate") for a in candidates
        })

    monkeypatch.setattr("app.analysis.requirement_evaluator.judge_requirement", judge)
    matter = _new_matter()
    _upload(matter, "2026-04-14T23:59")
    card = _card(matter)
    cost = _checks(card)["cost_impact_communicated@EXTRA_WORK_COST_COMMUNICATION"]

    assert cost.evidence_outcome.value == "SUPPORTED"
    supporting = [store.assertions[item].statement for item in cost.supporting_evidence_ids]
    assert "current estimate is $13,600" in supporting
    # The conditional April 13 offer stays out of the supporting set.
    assert not any("if you can sign today" in text for text in supporting)
    assert cost.timing.status.value == "BEFORE_WORK_START"
    assert "cost_impact_communicated" not in card["missing_requirements"]


def test_deleting_signed_co_reanalyzes_matter_and_reupload_restores_it() -> None:
    from pathlib import Path as _Path

    from app.api.documents import remove_document

    matter = _new_matter()
    _upload(matter, "2026-04-14T23:59")
    assert _card(matter)["current_documentation_status"] == "RESOLVED"
    co = next(doc for doc in store.documents.values() if doc.metadata.get("original_filename") == "05_later_signed_co.txt")
    stored = _Path(co.storage_path)

    result = remove_document(co.id)
    assert result["requeued_document_ids"] and co.id not in result["requeued_document_ids"]
    while run_once():
        pass
    card = _card(matter)

    assert co.id not in store.documents and not stored.exists()
    assert not any(a.source_document_id == co.id for a in store.assertions.values())
    cited = {e["source_document_id"] for record in card["issues"] for e in record["evidence"]}
    assert co.id not in cited
    assert card["current_documentation_status"] == "POTENTIAL_RISK"
    # Every remaining document was re-analysed, none left pending.
    jobs = [job for job in store.jobs.values() if job.document_id in result["requeued_document_ids"]]
    assert len(jobs) == len(result["requeued_document_ids"]) and all(job.status.value != "pending" for job in jobs)

    _upload(matter, "2026-04-14T23:59")  # re-upload the deleted file
    assert _card(matter)["current_documentation_status"] == "RESOLVED"


def test_delete_unknown_document_is_404() -> None:
    from fastapi import HTTPException

    from app.api.documents import remove_document

    with pytest.raises(HTTPException) as error:
        remove_document("DOC-MISSING")
    assert error.value.status_code == 404
