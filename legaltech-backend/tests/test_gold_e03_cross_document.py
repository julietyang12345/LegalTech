"""Gold case E03, cross-document version: required items vs listed records.

No document states a completion count. Exhibit G lists fourteen required
locations; a transmittal table and an email list records for ten; a readiness
log says the other four have no log sheets in the transmittal reviewed and
that this "does not, by itself, establish that the field tests were not
performed". So the expected result is *completion unverified* for the four,
not *not met*, and the final report is *not found in the reviewed records*,
not *not delivered*.

The fake model output repeats plausible mistakes: sending log sheets labelled
work performed and a written notice, an access difficulty labelled a delay,
and "Not in the design release folder" labelled not_received. The record
lists in D03 and D04 are left to the deterministic record-inventory parser.
"""

import json
import tempfile
from pathlib import Path

import pytest

from app.api.issues import list_issue_dashboard
from app.core.config import get_settings
from app.extraction.ai_signal_extractor import _candidate_from_item
from app.extraction.signal_extractor import record_inventory_candidates
from app.ingestion import upload_ingestor
from app.ingestion.upload_ingestor import ingest_upload
from app.jobs.worker import run_once
from app.models import ChangeEvent, Matter, Project
from app.models.domain import DocumentType
from app.repositories.memory import store
from app.services import pipeline as pipeline_module

CASE = Path(__file__).parent / "fixtures" / "gold" / "E03_cross_document"
EXPECTED = {item["id"]: item for item in json.loads((CASE / "expected.json").read_text())["criteria"]}
ALL = [f"BH-{n:02d}" for n in range(1, 15)]
LISTED = ALL[:10]
UNLISTED = ALL[10:]

DOCUMENTS = [
    ("E03_D01_prime_construction_agreement_selected_arti.txt", "contract"),
    ("E03_D02_exhibit_g_owner_supplied_geotechnical_inve.txt", "unknown"),
    ("E03_D03_interim_field_log_transmittal.txt", "unknown"),
    ("E03_D04_drilling_completion_follow_up.txt", "email"),
    ("E03_D05_foundation_design_release_readiness_log.txt", "unknown"),
]

D04_SENT = "We sent the draft field log sheets from the east wing and parkade investigation locations to the design team this morning."
HOLD = "Hold requested pending geotechnical sign-off / investigation coverage confirmation"
D05_REPORT = "Geotechnical final signed report | Not in the design release folder | Request final approved issue from geotechnical consultant"
D05_UNLISTED = "West wing borehole log package | No BH-11, BH-12, BH-13 or BH-14 log sheets in the transmittal reviewed | Ask field team whether testing occurred and obtain corresponding signed records"


def _item(signal_type, source_text, *, value=True, event_at=None, polarity="affirmative", temporal_status="completed"):
    return {
        "signal_type": signal_type, "value": value, "actor": None, "source_text": source_text,
        "confidence": 0.9, "extra_work_id": None, "polarity": polarity,
        "temporal_status": temporal_status, "event_at": event_at,
    }


def model_output():
    return {
        "TITLE: Prime Construction Agreement": [
            _item("written_notice", "Contractor shall give written notice within two business days after recognition of a materially differing condition, identify location and potential impacts, preserve evidence, and avoid disturbing suspected contamination except as required for immediate safety.",
                  temporal_status="normative"),
        ],
        "TITLE: Exhibit G": [
            _item("required_quantity", "The investigations in Schedule G-1 shall be documented in a final signed geotechnical report before the related foundation design release.",
                  value={"item": "boreholes", "quantity": 14, "work_items": ALL}, temporal_status="normative"),
            _item("required_deliverable", "The investigations in Schedule G-1 shall be documented in a final signed geotechnical report before the related foundation design release.",
                  value={"deliverable": "geotechnical report", "required_status": "final signed", "work_items": ALL}, temporal_status="normative"),
            _item("scope_substitution", "Any approved change to the investigation locations or technical substitution must be documented by the Owner and geotechnical consultant.",
                  value={"work_items": ALL}, temporal_status="normative"),
        ],
        "TITLE: Interim Geotechnical Field Log Transmittal": [
            _item("deliverable_status", "These working sheets have not been signed off by the geotechnical engineer.",
                  value={"deliverable": "geotechnical report", "status": "unsigned", "work_items": LISTED}),
        ],
        "TITLE: Drilling completion follow-up": [
            # Mistakes: sending documents read as work and as a notice.
            _item("work_performed", D04_SENT, value={"work_items": LISTED}),
            _item("written_notice", D04_SENT, value={"work_items": LISTED}),
            # A coordination difficulty read as a delay. The contract's notice
            # clause is about differing conditions, so it must not start a notice check.
            _item("delay_event", "The temporary laydown area is still creating access coordination difficulties at the west wing."),
            _item("attachment_missing", "I do not have their signed logs in this email package.", polarity="negative"),
            _item("work_planned", "We can send the drill crew back on 10 September if that area is cleared.",
                  temporal_status="conditional", event_at="2026-09-10"),
            _item("milestone_planned", "The structural team requested footing design release for 12 September.",
                  value={"milestone": "foundation design release"}, temporal_status="planned", event_at="2026-09-12"),
        ],
        "TITLE: Foundation Design Release Readiness Log": [
            # Mistake: "not in the folder" labelled as not received.
            _item("deliverable_status", D05_REPORT, value={"deliverable": "geotechnical report", "status": "not_received"}),
            _item("record_coverage", D05_UNLISTED, value={"record_type": "borehole log", "work_items": UNLISTED}, polarity="negative"),
            _item("scope_substitution", "Approved modification to Exhibit G | No approval found in design coordination records | Confirm with Owner's authorized representative and consultant",
                  value={"work_items": ALL}, polarity="negative"),
            # Live run: a requested hold labelled as an instruction to proceed
            # started a Change Order Approval check.
            _item("instruction_to_proceed", HOLD, temporal_status="conditional"),
        ],
    }


def _fake(outputs):
    def ai_candidates(text):
        items = next((items for marker, items in outputs.items() if marker in text), [])
        return [candidate for item in items if (candidate := _candidate_from_item(item, text))]
    return ai_candidates


@pytest.fixture(autouse=True)
def _pipeline(monkeypatch):
    store.reset()
    monkeypatch.setattr("app.extraction.signal_extractor.ai_candidates", _fake(model_output()))
    enabled = get_settings().model_copy(update={"ai_extraction_enabled": True, "openai_api_key": "test"})
    monkeypatch.setattr(pipeline_module, "get_settings", lambda: enabled)
    disabled = get_settings().model_copy(update={"ai_extraction_enabled": False, "ai_rule_discovery_enabled": False, "ai_risk_discovery_enabled": False})
    for module in ("app.legal_knowledge.ai_rule_discovery", "app.analysis.targeted_retrieval"):
        monkeypatch.setattr(f"{module}.get_settings", lambda: disabled)
    monkeypatch.setattr("app.core.config.get_settings", lambda: disabled)
    monkeypatch.setattr(upload_ingestor, "STORAGE_ROOT", Path(tempfile.mkdtemp(prefix="e03x-")))
    yield
    store.reset()


def _run(monkeypatch=None, outputs=None, edits=None):
    """edits: {filename: [(old, new), ...]} applied to the document text."""
    if outputs is not None:
        monkeypatch.setattr("app.extraction.signal_extractor.ai_candidates", _fake(outputs))
    matter = Matter(name="E03-X", tenant_id="GOLD")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name="East Rail Lands - Building C", project_number="ERL-C-26")
    store.projects[project.id] = project
    event = ChangeEvent(project_id=project.id, title="Site investigation")
    store.change_events[event.id] = event
    for filename, document_type in DOCUMENTS:
        text = (CASE / "UPLOAD" / filename).read_text()
        for old, new in (edits or {}).get(filename, []):
            assert old in text
            text = text.replace(old, new)
        ingest_upload(text.encode(), filename, DocumentType(document_type), matter.id, tenant_id="GOLD")
        while run_once():
            pass
    return matter, list_issue_dashboard(tenant_id="GOLD", matter_id=matter.id)


def _checks(card) -> dict:
    return {check.requirement_id: check for record in card["issues"] for check in record["assessment"].requirement_checks}


def _rules(cards) -> list[list[str]]:
    return [record["issue"].rule_ids for card in cards for record in card["issues"]]


def test_c01_c02_one_precondition_issue_and_no_notice_or_change_order() -> None:
    _matter, cards = _run()
    assert _rules(cards) == [["REQUIRED_PRECONDITION"]], _rules(cards)
    card = cards[0]
    assert card["current_documentation_status"] == EXPECTED["E03-C02"]["expected"] == "POTENTIAL_RISK"
    # Nothing is "not met": two prerequisites are unverified, the release is ahead.
    assert card["unmet_requirements"] == []
    assert set(card["missing_requirements"]) == {"required_scope_completed", "required_deliverable_final"}
    assert card["at_risk_requirements"] == ["prerequisites_before_milestone"]


def test_c07_required_items_are_reconciled_against_listed_records() -> None:
    _matter, cards = _run()
    scope = _checks(cards[0])["required_scope_completed"]
    comparison = scope.comparison
    assert comparison.completed is None  # no count is invented from record coverage
    assert comparison.completion_status == "COMPLETION_UNVERIFIED"
    assert comparison.documented_items == LISTED
    assert comparison.unverified_items == UNLISTED
    assert (comparison.required, comparison.documented) == (14, 10)
    assert comparison.absent_record_evidence_ids  # D05's "no log sheets" is cited as absence of records
    assert scope.result.value == "INSUFFICIENT_INFORMATION"
    assert scope.gap_basis.value == "NOT_IDENTIFIED_IN_SEARCHED_RECORDS"


def test_c04_unverified_is_not_proof_of_not_done() -> None:
    matter, cards = _run()
    scope = _checks(cards[0])["required_scope_completed"]
    assert "does not establish it was not done" in scope.explanation
    conclusion = " ".join(record["assessment"].conclusion for record in cards[0]["issues"]).lower()
    for word in ("contaminat", "breach", "not performed", "were not done"):
        assert word not in conclusion
    facts = [a for a in store.assertions.values() if a.matter_id == matter.id]
    # Sending documents is neither work nor a notice.
    assert not any(a.assertion_type in {"work_performed", "written_notice"} and a.statement == D04_SENT for a in facts)
    listed = [a for a in facts if a.assertion_type == "record_coverage" and a.value.get("polarity") != "negative"]
    assert sorted(len(a.value["work_items"]) for a in listed) == [10, 10]


def test_final_report_not_in_folder_is_not_found_not_not_delivered() -> None:
    _matter, cards = _run()
    deliverable = _checks(cards[0])["required_deliverable_final"]
    assert deliverable.comparison.deliverable_state == "NOT_FOUND_IN_REVIEWED_RECORDS"
    assert deliverable.result.value == "INSUFFICIENT_INFORMATION"
    assert deliverable.gap_basis.value == "NOT_IDENTIFIED_IN_SEARCHED_RECORDS"
    assert "does not establish it does not exist" in deliverable.explanation


def test_c06_release_is_planned_and_at_risk() -> None:
    _matter, cards = _run()
    milestone = _checks(cards[0])["prerequisites_before_milestone"].milestone
    assert (milestone.date, milestone.as_of, milestone.readiness) == ("2026-09-12", "2026-09-08", "AT_RISK")


def test_c05_next_action_names_the_unverified_items() -> None:
    _matter, cards = _run()
    action = cards[0]["next_action"]
    assert "verify whether BH-11 to BH-14 were done" in action
    assert "authorized and technically supported revision" in action
    assert "geotechnical report" in action
    assert "September 12, 2026" in action


def test_c03_cites_d02_to_d05() -> None:
    _matter, cards = _run()
    cited = {i for check in _checks(cards[0]).values() for i in [*check.supporting_evidence_ids]}
    names = {store.documents[store.assertions[i].source_document_id].metadata["original_filename"][:7] for i in cited}
    assert names >= {"E03_D02", "E03_D03", "E03_D04", "E03_D05"}


# --- Variants ------------------------------------------------------------------

def _without(outputs, title, source):
    outputs[title] = [item for item in outputs[title] if item["source_text"] != source]
    return outputs


def test_records_for_every_required_item_satisfy_the_scope_check(monkeypatch) -> None:
    outputs = _without(model_output(), "TITLE: Foundation Design Release Readiness Log", D05_UNLISTED)
    edits = {"E03_D04_drilling_completion_follow_up.txt": [("BH-09 and BH-10.", "BH-09, BH-10, BH-11, BH-12, BH-13 and BH-14.")]}
    _matter, cards = _run(monkeypatch, outputs, edits)
    scope = _checks(cards[0])["required_scope_completed"]
    assert scope.comparison.completion_status == "RECORDS_COMPLETE"
    assert scope.result.value == "REQUIREMENT_SATISFIED"
    # The report is still not found, so the release stays at risk.
    assert cards[0]["current_documentation_status"] == "POTENTIAL_RISK"


def test_no_risk_when_all_records_listed_and_final_report_issued(monkeypatch) -> None:
    outputs = _without(model_output(), "TITLE: Foundation Design Release Readiness Log", D05_UNLISTED)
    issued = "Geotechnical final signed report | Final signed issue received 2026-09-08 | Filed for release"
    outputs["TITLE: Foundation Design Release Readiness Log"] = [
        _item("deliverable_status", issued, value={"deliverable": "geotechnical report", "status": "final_signed"}),
    ]
    edits = {
        "E03_D04_drilling_completion_follow_up.txt": [("BH-09 and BH-10.", "BH-09, BH-10, BH-11, BH-12, BH-13 and BH-14.")],
        "E03_D05_foundation_design_release_readiness_log.txt": [(D05_REPORT, issued)],
    }
    _matter, cards = _run(monkeypatch, outputs, edits)
    checks = _checks(cards[0])
    assert checks["required_deliverable_final"].comparison.deliverable_state == "DELIVERED"
    assert checks["prerequisites_before_milestone"].milestone.readiness == "MET"
    assert cards[0]["current_documentation_status"] == "RESOLVED"


def test_report_stated_unsigned_is_not_delivered_as_of(monkeypatch) -> None:
    outputs = model_output()
    unsigned = "Geotechnical final signed report | Draft issued, unsigned | Request final approved issue from geotechnical consultant"
    outputs["TITLE: Foundation Design Release Readiness Log"][0] = _item(
        "deliverable_status", unsigned, value={"deliverable": "geotechnical report", "status": "unsigned"})
    edits = {"E03_D05_foundation_design_release_readiness_log.txt": [(D05_REPORT, unsigned)]}
    _matter, cards = _run(monkeypatch, outputs, edits)
    deliverable = _checks(cards[0])["required_deliverable_final"]
    assert deliverable.comparison.deliverable_state == "NOT_DELIVERED_AS_OF"
    assert deliverable.result.value == "REQUIREMENT_NOT_SATISFIED"
    assert "as of September 8, 2026" in deliverable.explanation


def test_condition_needing_notice_starts_a_notice_check_without_any_notice(monkeypatch) -> None:
    """The risk to catch: a condition the contract says must be notified, and
    no notice in the records. Activation must not wait for a notice."""
    found = "At BH-03 the crew encountered unexpected groundwater at 2.1 m on 2026-09-02."
    outputs = model_output()
    outputs["TITLE: Drilling completion follow-up"].append(
        _item("condition_encountered", found, value={"work_items": ["BH-03"]}, event_at="2026-09-02"))
    edits = {"E03_D04_drilling_completion_follow_up.txt": [("M. Iqbal\n", f"{found}\n\nM. Iqbal\n")]}
    _matter, cards = _run(monkeypatch, outputs, edits)
    assert ["NOTICE_TIMELINESS"] in _rules(cards), _rules(cards)


def test_condition_without_a_matching_notice_clause_starts_no_notice_check(monkeypatch) -> None:
    found = "At BH-03 the crew encountered unexpected groundwater at 2.1 m on 2026-09-02."
    outputs = model_output()
    outputs["TITLE: Drilling completion follow-up"].append(
        _item("condition_encountered", found, value={"work_items": ["BH-03"]}, event_at="2026-09-02"))
    outputs["TITLE: Prime Construction Agreement"] = []
    clause = "Contractor shall give written notice within two business days after recognition of a materially differing condition"
    edits = {
        "E03_D04_drilling_completion_follow_up.txt": [("M. Iqbal\n", f"{found}\n\nM. Iqbal\n")],
        "E03_D01_prime_construction_agreement_selected_arti.txt": [(clause, "Contractor shall keep records after recognition of a materially differing condition")],
    }
    _matter, cards = _run(monkeypatch, outputs, edits)
    assert ["NOTICE_TIMELINESS"] not in _rules(cards)


# --- The record-inventory parser on its own, with non-case identifiers -----------

def test_record_inventory_reads_listed_records_not_requirements_or_requests() -> None:
    table = "Attached inspection record | Date | Status\nTP-01 | 2026-02-01 | Draft\nTP-02 | 2026-02-02 | Draft\n"
    assert [c.value["work_items"] for c in record_inventory_candidates(table)] == [["TP-01", "TP-02"]]
    assert record_inventory_candidates("Required inspection | Location\nTP-01 | Level 2\n") == []
    assert record_inventory_candidates("Missing records | Status\nTP-04 | Not found\n") == []
    assert record_inventory_candidates("Please confirm whether the logs for TP-04 were sent?") == []
    assert record_inventory_candidates("No records for TP-04 were attached.") == []
    sent = record_inventory_candidates("We sent inspection logs for TP-01 to TP-03 this morning.")
    assert sorted(sent[0].value["work_items"]) == ["TP-01", "TP-02", "TP-03"]


def test_notice_clause_counts_even_when_the_model_did_not_extract_it(monkeypatch) -> None:
    found = "At BH-03 the crew encountered unexpected groundwater at 2.1 m on 2026-09-02."
    outputs = model_output()
    outputs["TITLE: Drilling completion follow-up"].append(
        _item("condition_encountered", found, value={"work_items": ["BH-03"]}, event_at="2026-09-02"))
    outputs["TITLE: Prime Construction Agreement"] = []  # the clause is only in the contract text
    edits = {"E03_D04_drilling_completion_follow_up.txt": [("M. Iqbal\n", f"{found}\n\nM. Iqbal\n")]}
    _matter, cards = _run(monkeypatch, outputs, edits)
    assert ["NOTICE_TIMELINESS"] in _rules(cards), _rules(cards)


def test_the_word_notice_in_a_fact_does_not_activate_a_notice_rule() -> None:
    from app.analysis.rule_activation import activate_rules
    from app.domain_contracts.schemas import EvidenceAssertion, Provenance
    from app.legal_knowledge.default_rules import notice_timeliness_rule

    _principle, rule = notice_timeliness_rule()
    provenance = Provenance(tenant_id="T", matter_id="M", method="TEST", rationale="test", analysis_run_id="RUN", pipeline_version="test")
    fact = EvidenceAssertion(
        tenant_id="T", matter_id="M", source_document_id="DOC", assertion_type="work_performed",
        statement="Written notice of delay was discussed on site; crews continued work.", provenance=provenance,
    )
    clause = EvidenceAssertion(
        tenant_id="T", matter_id="M", source_document_id="DOC", assertion_type="written_notice",
        statement="Contractor shall give written notice of any delay within five days.",
        evidence_role="NORMATIVE_RULE", provenance=provenance,
    )
    assert activate_rules(rules=[rule], assertions=[fact, clause]) == []
    delay = fact.model_copy(update={"id": "DELAY", "assertion_type": "delay_event", "statement": "Work stopped for three days."})
    assert [a.rule_id for a in activate_rules(rules=[rule], assertions=[delay, clause])] == ["NOTICE_TIMELINESS"]



# --- Rule applicability: a change clause is not a change --------------------------

def test_instruction_to_proceed_without_any_change_fact_starts_no_change_order_check(monkeypatch) -> None:
    proceed = "Proceed with the remaining investigation locations once access is cleared."
    outputs = model_output()
    outputs["TITLE: Drilling completion follow-up"].append(_item("instruction_to_proceed", proceed))
    edits = {"E03_D04_drilling_completion_follow_up.txt": [("M. Iqbal\n", f"{proceed}\n\nM. Iqbal\n")]}
    _matter, cards = _run(monkeypatch, outputs, edits)
    assert ["CHANGE_ORDER_APPROVAL"] not in _rules(cards), _rules(cards)
    codes = {tag["code"] for card in cards for tag in card["categories"]}
    assert not codes & {"A_SCOPE_CHANGE", "B_PRICE_ADJUSTMENT"}


def test_an_actual_proposed_change_still_starts_the_change_order_check(monkeypatch) -> None:
    extra = "The owner asked us to drill two additional holes, BH-15 and BH-16, outside Exhibit G; our price is CAD 18,400."
    outputs = model_output()
    outputs["TITLE: Drilling completion follow-up"] += [
        _item("extra_work_detected", extra, value={"work_items": ["BH-15", "BH-16"]}),
        _item("estimate_amount", extra, value={"amount": 18400, "currency": "CAD", "work_items": ["BH-15", "BH-16"]}),
    ]
    edits = {"E03_D04_drilling_completion_follow_up.txt": [("M. Iqbal\n", f"{extra}\n\nM. Iqbal\n")]}
    _matter, cards = _run(monkeypatch, outputs, edits)
    assert ["CHANGE_ORDER_APPROVAL"] in _rules(cards), _rules(cards)


def test_a_conditional_event_triggers_no_rule(monkeypatch) -> None:
    maybe = "If groundwater is encountered at the west wing, the crew will stop and call the engineer."
    outputs = model_output()
    outputs["TITLE: Drilling completion follow-up"].append(
        _item("condition_encountered", maybe, value={"work_items": ["BH-11"]}, temporal_status="conditional"))
    edits = {"E03_D04_drilling_completion_follow_up.txt": [("M. Iqbal\n", f"{maybe}\n\nM. Iqbal\n")]}
    _matter, cards = _run(monkeypatch, outputs, edits)
    assert ["NOTICE_TIMELINESS"] not in _rules(cards), _rules(cards)



# --- Live run 2026-11-25: the model marked every report status negative --------

def _live_polarities(outputs):
    for items in outputs.values():
        for item in items:
            if item["signal_type"] == "deliverable_status":
                item["polarity"] = "negative"
    outputs["TITLE: Foundation Design Release Readiness Log"].append(_item(
        "approval_denied",
        "Approved modification to Exhibit G | No approval found in design coordination records",
        polarity="negative"))
    return outputs


def test_negative_status_observations_still_start_the_requirement_check(monkeypatch) -> None:
    """A filter for conditional or negative *events* must not drop negative
    *observations* ("not signed", "not in the folder"); that emptied the dashboard."""
    _matter, cards = _run(monkeypatch, _live_polarities(model_output()))
    assert _rules(cards) == [["REQUIRED_PRECONDITION"]], _rules(cards)
    checks = _checks(cards[0])
    assert checks["required_deliverable_final"].comparison.deliverable_state == "NOT_FOUND_IN_REVIEWED_RECORDS"
    assert checks["required_scope_completed"].comparison.unverified_items == UNLISTED


def test_negative_report_status_alone_starts_the_requirement_check(monkeypatch) -> None:
    """No record list and no count: a stated negative report status is enough."""
    outputs = _live_polarities(model_output())
    for title in outputs:
        outputs[title] = [item for item in outputs[title] if item["signal_type"] != "record_coverage"]
    edits = {"E03_D03_interim_field_log_transmittal.txt": [("Attached log sheet |", "Log sheet |")],
             "E03_D04_drilling_completion_follow_up.txt": [("The files sent cover", "The package refers to")]}
    _matter, cards = _run(monkeypatch, outputs, edits)
    assert ["REQUIRED_PRECONDITION"] in _rules(cards), _rules(cards)


def test_record_list_only_still_activates_precondition_rule(monkeypatch) -> None:
    """Records listed, but no report status at all."""
    outputs = model_output()
    for title in outputs:
        outputs[title] = [item for item in outputs[title] if item["signal_type"] != "deliverable_status"]
    _matter, cards = _run(monkeypatch, outputs)
    assert _rules(cards) == [["REQUIRED_PRECONDITION"]], _rules(cards)
    scope = _checks(cards[0])["required_scope_completed"]
    assert scope.comparison.completion_status == "COMPLETION_UNVERIFIED"
    assert scope.comparison.unverified_items == UNLISTED


def test_no_approval_found_is_not_a_refusal_or_a_change() -> None:
    from app.analysis.rule_activation import _is_affirmative
    from app.domain_contracts.schemas import EvidenceAssertion, Provenance

    provenance = Provenance(tenant_id="T", matter_id="M", method="TEST", rationale="test", analysis_run_id="RUN", pipeline_version="test")
    make = lambda statement: EvidenceAssertion(tenant_id="T", matter_id="M", source_document_id="DOC", assertion_type="approval_denied",
                                               statement=statement, value={"polarity": "negative"}, provenance=provenance)
    assert not _is_affirmative(make("Approved modification | No approval found in coordination records"))
    assert _is_affirmative(make("We can't accept that number for the extra excavation."))
