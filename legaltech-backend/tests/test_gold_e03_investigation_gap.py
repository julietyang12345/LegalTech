"""Gold case E03: four required boreholes not completed before foundation release.

Not a change-order case. The target is a contractual precondition gap:
Exhibit G requires 14 boreholes and a final signed report before foundation
design release; 10 are done, the report is interim and unsigned, no revised
scope is approved, and release is requested for September 12.

The model is replaced by fixed output that reproduces what live runs got
wrong: Exhibit G's "Any approved substitution shall be documented" labelled a
signed change order, and "Owner change to investigation scope | None found"
labelled extra work. Exhibit G is uploaded as "unknown", as a user might; its
own header says it is a contract exhibit. No item here names E03: the same
checks apply to any counted requirement (tests, inspections, submittals).
"""

import json
import tempfile
from pathlib import Path

import pytest

from app.api.issues import list_candidate_findings, list_issue_dashboard
from app.core.config import get_settings
from app.domain_contracts.schemas import EvidenceRole
from app.extraction.ai_signal_extractor import _candidate_from_item
from app.ingestion import upload_ingestor
from app.ingestion.upload_ingestor import ingest_upload
from app.jobs.worker import run_once
from app.models import ChangeEvent, Matter, Project
from app.models.domain import DocumentType
from app.repositories.memory import store
from app.services import pipeline as pipeline_module

CASE = Path(__file__).parent / "fixtures" / "gold" / "E03"
EXPECTED = json.loads((CASE / "expected_results.json").read_text())
ALL_HOLES = [f"BH-{n:02d}" for n in range(1, 15)]
WEST = ["BH-11", "BH-12", "BH-13", "BH-14"]

# (file, upload type). Exhibit G deliberately uploaded as "unknown".
DOCUMENTS = [
    ("E03_D01_prime_construction_agreement_selected_arti.txt", "contract"),
    ("E03_D02_exhibit_g_owner_supplied_geotechnical_inve.txt", "unknown"),
    ("E03_D03_interim_borehole_completion_log_10_of_14.txt", "unknown"),
    ("E03_D04_drilling_completion_follow_up.txt", "email"),
    ("E03_D05_foundation_design_release_readiness_log.txt", "unknown"),
]


def _item(signal_type, source_text, *, value=True, event_at=None, polarity="affirmative",
          temporal_status="completed", **extra):
    return {
        "signal_type": signal_type, "value": value, "actor": None, "source_text": source_text,
        "confidence": 0.9, "extra_work_id": extra.pop("ew", None), "polarity": polarity,
        "temporal_status": temporal_status, "event_at": event_at, **extra,
    }


def model_output():
    return {
        "TITLE: Prime Construction Agreement": [
            _item("signed_change_order", "An agreed change in scope and price is recorded by a Change Order identifying the work item, location, cost, time impact, and signatures of the Owner Authorized Representative and Contractor Authorized Representative."),
        ],
        "TITLE: Exhibit G": [
            # The model did not flag these normative; the header must.
            _item("required_quantity", "All fourteen holes shall be completed and recorded in a final signed report before the related foundation design release.",
                  value={"item": "boreholes", "quantity": 14, "work_items": ALL_HOLES}, temporal_status="unknown"),
            _item("required_deliverable", "All fourteen holes shall be completed and recorded in a final signed report before the related foundation design release.",
                  value={"deliverable": "geotechnical report", "required_status": "final signed", "work_items": ALL_HOLES}, temporal_status="unknown"),
            # Live failure: a rule about future substitutions read as a signed CO.
            _item("signed_change_order", "Any approved substitution shall be documented by the Owner and geotechnical consultant.",
                  value={"work_items": ALL_HOLES}, event_at="2026-06-03"),
        ],
        "TITLE: Interim Borehole Completion Log": [
            _item("completed_quantity", "BH-11 to BH-14 | 0 | 4",
                  value={"item": "boreholes", "completed": 10, "required": 14, "outstanding_items": WEST,
                         "work_items": ALL_HOLES, "location": "West wing",
                         "root_cause_category": "E_UNEXPECTED_SITE_CONDITIONS"}),
            _item("deliverable_status", "Preliminary log is unsigned and not a final geotechnical interpretation.",
                  value={"deliverable": "geotechnical report", "status": "unsigned", "work_items": ALL_HOLES}),
            _item("scope_substitution", "No technical substitution has been approved.",
                  value={"work_items": ALL_HOLES}, polarity="negative"),
        ],
        "TITLE: Drilling completion follow-up": [
            _item("completed_quantity", "The drill crew completed 10 of 14 specified holes.",
                  value={"item": "holes", "completed": 10, "required": 14, "work_items": WEST}),
            _item("milestone_planned", "The structural team requested footing release for 12 September.",
                  value={"milestone": "foundation design release"}, temporal_status="planned", event_at="2026-09-12"),
        ],
        "TITLE: Foundation Design Release Readiness Log": [
            _item("deliverable_status", "West wing geotechnical signoff | Not received | Foundation release hold requested",
                  value={"deliverable": "geotechnical signoff", "status": "not_received", "work_items": WEST}),
            # Live failure: "None found" read as an owner change to the scope.
            _item("extra_work_detected", "Owner change to investigation scope | None found | Original Exhibit G governs",
                  value={"work_items": WEST}),
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
    monkeypatch.setattr(upload_ingestor, "STORAGE_ROOT", Path(tempfile.mkdtemp(prefix="e03-")))
    yield
    store.reset()


def _run(monkeypatch=None, outputs=None) -> tuple[Matter, list[dict]]:
    if outputs is not None:
        monkeypatch.setattr("app.extraction.signal_extractor.ai_candidates", _fake(outputs))
    matter = Matter(name="E03", tenant_id="GOLD")
    store.matters[matter.id] = matter
    project = Project(matter_id=matter.id, name="East Rail Lands - Building C", project_number="ERL-C-26")
    store.projects[project.id] = project
    event = ChangeEvent(project_id=project.id, title="Site investigation")
    store.change_events[event.id] = event
    for filename, document_type in DOCUMENTS:
        ingest_upload((CASE / "UPLOAD" / filename).read_bytes(), filename, DocumentType(document_type), matter.id, tenant_id="GOLD")
        while run_once():
            pass
    return matter, list_issue_dashboard(tenant_id="GOLD", matter_id=matter.id)


def _checks(card) -> dict:
    return {check.requirement_id: check for record in card["issues"] for check in record["assessment"].requirement_checks}


def _docs(card, ids) -> set[str]:
    return {store.documents[store.assertions[i].source_document_id].metadata["original_filename"][:7] for i in ids}


def test_c01_c02_detects_precondition_gap_not_change_order_issues() -> None:
    _matter, cards = _run()
    assert len(cards) == 1, [card["title"] for card in cards]
    card = cards[0]
    # C01: the target issue, and only it. No price or approval issue at all.
    assert [record["issue"].rule_ids for record in card["issues"]] == [["REQUIRED_PRECONDITION"]]
    # C02
    assert card["current_documentation_status"] == EXPECTED["proposed_case_label"] == "POTENTIAL_RISK"
    assert set(card["unmet_requirements"]) == {"required_scope_completed", "required_deliverable_final"}
    # The release is still ahead: its open prerequisites are an exposure, not a failure.
    assert card["at_risk_requirements"] == ["prerequisites_before_milestone"]
    assert card["missing_requirements"] == [] and card["contrary_requirements"] == []
    assert card["claimed_amount"] is None


def test_required_vs_observed_comparisons_are_structured() -> None:
    _matter, cards = _run()
    checks = _checks(cards[0])

    scope = checks["required_scope_completed"].comparison
    assert (scope.required, scope.completed, scope.outstanding) == (14, 10, 4)
    assert scope.outstanding_items == WEST
    assert scope.scope_revision == "EXPLICITLY_NONE"

    deliverable = checks["required_deliverable_final"]
    assert deliverable.result.value == "REQUIREMENT_NOT_SATISFIED"
    assert deliverable.comparison.required_status == "final signed"

    # C06: the dependent milestone, compared against the latest document date.
    milestone = checks["prerequisites_before_milestone"].milestone
    assert (milestone.date, milestone.as_of, milestone.status) == ("2026-09-12", "2026-09-08", "UPCOMING")
    assert milestone.prerequisites_met is False
    assert milestone.readiness == "AT_RISK"
    assert checks["prerequisites_before_milestone"].result.value != "REQUIREMENT_NOT_SATISFIED"

    # Both gaps are stated by sources (10 of 14; an unsigned preliminary
    # record), not inferred from something not being found.
    assert checks["required_scope_completed"].gap_basis.value == "EXPLICIT_NEGATIVE_EVIDENCE"
    assert deliverable.gap_basis.value == "EXPLICIT_NEGATIVE_EVIDENCE"


def _milestone_variant(**changes):
    def edit(outputs):
        for item in (item for items in outputs.values() for item in items):
            if item["signal_type"] == "milestone_planned":
                item.update(changes)
    return _variant(edit)


def test_passed_planned_date_is_not_evidence_the_milestone_happened(monkeypatch) -> None:
    _matter, cards = _run(monkeypatch, _milestone_variant(event_at="2026-09-01"))
    check = _checks(cards[0])["prerequisites_before_milestone"]
    assert (check.milestone.status, check.milestone.readiness) == ("PASSED", "REQUIRES_VERIFICATION")
    assert check.result.value != "REQUIREMENT_NOT_SATISFIED"
    assert "Whether it has taken place was not identified" in check.explanation
    assert cards[0]["at_risk_requirements"] == ["prerequisites_before_milestone"]


def test_milestone_stated_to_have_happened_with_open_prerequisites_is_not_met(monkeypatch) -> None:
    _matter, cards = _run(monkeypatch, _milestone_variant(event_at="2026-09-01", temporal_status="completed"))
    check = _checks(cards[0])["prerequisites_before_milestone"]
    assert check.milestone.readiness == "NOT_MET"
    assert check.result.value == "REQUIREMENT_NOT_SATISFIED"
    assert "prerequisites_before_milestone" in cards[0]["unmet_requirements"]


def test_analysis_basis_counts_direct_comparisons_not_only_searches() -> None:
    _matter, cards = _run()
    basis = cards[0]["analysis_basis"]
    # Deterministic checks record no search; the basis still shows what they compared.
    assert basis["compared_checks"] == 3
    assert len(basis["compared_fact_ids"]) >= 4
    assert "EXPLICIT_NEGATIVE_EVIDENCE" in basis["gap_bases"]


def test_c03_cites_d02_to_d05() -> None:
    _matter, cards = _run()
    cited = {i for check in _checks(cards[0]).values() for i in check.supporting_evidence_ids}
    assert _docs(cards[0], cited) >= {"E03_D02", "E03_D03", "E03_D04", "E03_D05"}


def test_c04_contract_wording_and_none_found_never_become_project_facts() -> None:
    matter, cards = _run()
    facts = [a for a in store.assertions.values() if a.matter_id == matter.id and a.evidence_role == EvidenceRole.project_fact]
    # The substitution clause is kept, as a requirement.
    clause = next(a for a in store.assertions.values() if a.statement.startswith("Any approved substitution"))
    assert clause.evidence_role == EvidenceRole.normative_rule
    assert not any(a.assertion_type == "signed_change_order" for a in facts)
    # "None found" was rejected outright: it records the absence of a change.
    assert not any("None found" in a.statement for a in store.assertions.values())
    # The requirement (14) is never read as completion.
    assert all(a.assertion_type != "completed_quantity" or a.value.get("completed") == 10 for a in facts)
    conclusion = " ".join(record["assessment"].conclusion for record in cards[0]["issues"]).lower()
    assert "contaminat" not in conclusion and "breach" not in conclusion


def test_c05_c06_next_action_is_built_from_the_comparison() -> None:
    _matter, cards = _run()
    action = cards[0]["next_action"]
    assert "Complete the outstanding boreholes (BH-11 to BH-14)" in action
    assert "authorized and technically supported revision" in action
    assert "before foundation design release on September 12, 2026" in action
    assert "price" not in action.lower() and "change order" not in action.lower()


def test_one_event_across_four_documents_with_labels_not_conclusions() -> None:
    _matter, cards = _run()
    card = cards[0]
    event = card["event"]
    assert event["key"].startswith("EVT-") and event["display_id"] == "West wing"
    assert event["work_items"] == ALL_HOLES and len(event["document_ids"]) == 4
    tags = {(tag["code"], tag["dimension"], tag["status"]) for tag in card["categories"]}
    assert ("E_UNEXPECTED_SITE_CONDITIONS", "ROOT_CAUSE", "POTENTIAL") in tags
    assert ("C_SCHEDULE_TIME", "IMPACT", "POTENTIAL") in tags
    assert not any(code == "B_PRICE_ADJUSTMENT" for code, _d, _s in tags)


# --- Variants: same checks, different facts -------------------------------------

def _variant(edit):
    outputs = model_output()
    edit(outputs)
    return outputs


def test_no_risk_variant_all_required_work_done_and_final_report_signed(monkeypatch) -> None:
    def complete(outputs):
        log = outputs["TITLE: Interim Borehole Completion Log"]
        log[0]["value"] = {**log[0]["value"], "completed": 14, "outstanding_items": []}
        log[1]["value"] = {**log[1]["value"], "status": "final_signed"}
        outputs["TITLE: Drilling completion follow-up"][0]["value"]["completed"] = 14
        outputs["TITLE: Foundation Design Release Readiness Log"] = []
    _matter, cards = _run(monkeypatch, _variant(complete))
    card = cards[0]
    assert card["current_documentation_status"] == "RESOLVED"
    assert card["unmet_requirements"] == [] and card["missing_requirements"] == []
    assert _checks(card)["prerequisites_before_milestone"].result.value == "REQUIREMENT_SATISFIED"


def test_approved_revision_routes_to_review_instead_of_unmet(monkeypatch) -> None:
    def approve(outputs):
        log = outputs["TITLE: Interim Borehole Completion Log"]
        log[2] = {**log[2], "polarity": "affirmative", "source_text": "BH-01 to BH-05 | 5 | 0", "signal_type": "scope_substitution"}
    _matter, cards = _run(monkeypatch, _variant(approve))
    scope = _checks(cards[0])["required_scope_completed"]
    assert scope.result.value == "LAWYER_REVIEW_REQUIRED"
    assert scope.comparison.scope_revision == "APPROVED"


def test_unassessed_findings_are_empty_when_discovery_is_off() -> None:
    matter, _cards = _run()
    assert list_candidate_findings(tenant_id="GOLD", matter_id=matter.id) == []


# --- Fragmentation: documents arrive before the one that spans them -------------

def _fragmenting(outputs):
    """The completion log arrives first and states its rows separately, so two
    events form (BH-01..10 done, BH-11..14 open) before Exhibit G names all 14."""
    outputs["TITLE: Interim Borehole Completion Log"] = [
        _item("work_performed", "BH-01 to BH-05 | 5 | 0", value={"work_items": ALL_HOLES[:10]}),
        _item("completed_quantity", "BH-11 to BH-14 | 0 | 4",
              value={"item": "boreholes", "completed": 10, "required": 14, "outstanding_items": WEST,
                     "work_items": WEST, "location": "West wing", "root_cause_category": "E_UNEXPECTED_SITE_CONDITIONS"}),
        _item("deliverable_status", "Preliminary log is unsigned and not a final geotechnical interpretation.",
              value={"deliverable": "geotechnical report", "status": "unsigned", "work_items": WEST}),
        _item("scope_substitution", "No technical substitution has been approved.", value={"work_items": WEST}, polarity="negative"),
    ]


def _run_order(monkeypatch, order):
    monkeypatch.setitem(globals(), "DOCUMENTS", [DOCUMENTS[i] for i in order])
    return _run(monkeypatch, _variant(_fragmenting))


def test_spanning_document_does_not_merge_events_silently(monkeypatch) -> None:
    from app.api.events import list_match_suggestions

    matter, cards = _run_order(monkeypatch, [2, 3, 4, 1, 0])
    suggestions = list_match_suggestions(matter_id=matter.id)
    assert [s["kind"] for s in suggestions] == ["MERGE"]
    assert len(suggestions[0]["events"]) == 2
    assert {f["filename"][:7] for f in suggestions[0]["facts"]} == {"E03_D02"}
    # Until a reviewer decides, Exhibit G's requirement is not linked to either event.
    required = next(a for a in store.assertions.values() if a.assertion_type == "required_quantity")
    assert required.extra_work_id is None and required.relationship_status == "UNRESOLVED_SCOPE"
    assert required.value["possible_event_ids"] == sorted(e["key"] for e in suggestions[0]["events"])


def test_confirmed_merge_gives_one_event_and_reassesses(monkeypatch) -> None:
    from app.api.events import confirm, list_match_suggestions

    matter, before = _run_order(monkeypatch, [2, 3, 4, 1, 0])
    suggestion = list_match_suggestions(matter_id=matter.id)[0]
    keys = sorted(e["key"] for e in suggestion["events"])
    result = confirm(suggestion["id"])
    assert result["status"] == "CONFIRMED"

    cards = list_issue_dashboard(tenant_id="GOLD", matter_id=matter.id)
    assert len(cards) == 1
    card = cards[0]
    # One internal identity; the other generated key survives as an alias.
    assert card["event"]["key"] in keys and card["event"]["aliases"] == [k for k in keys if k != card["event"]["key"]]
    assert card["event"]["work_items"] == ALL_HOLES
    # The merged-in requirement now drives the comparison.
    scope = _checks(card)["required_scope_completed"].comparison
    assert (scope.required, scope.completed, scope.outstanding_items) == (14, 10, WEST)
    assert card["current_documentation_status"] == "POTENTIAL_RISK"
    # Old issues are kept for audit, not shown.
    assert any(issue.merged_into_event_id == card["event_id"] for issue in store.issues.values())
    assert list_match_suggestions(matter_id=matter.id) == []


def test_rejected_merge_keeps_events_apart(monkeypatch) -> None:
    from app.api.events import list_match_suggestions, reject

    matter, _cards = _run_order(monkeypatch, [2, 3, 4, 1, 0])
    suggestion = list_match_suggestions(matter_id=matter.id)[0]
    reject(suggestion["id"], None)
    assert list_match_suggestions(matter_id=matter.id) == []
    assert list_match_suggestions(matter_id=matter.id, status="REJECTED")[0]["id"] == suggestion["id"]
    required = next(a for a in store.assertions.values() if a.assertion_type == "required_quantity")
    assert required.relationship_status == "UNRESOLVED_SCOPE"
    assert len([e for e in store.extra_works.values() if e.status != "merged"]) == 2


def test_location_only_fact_gets_an_attach_suggestion_not_a_link(monkeypatch) -> None:
    """ "Four west wing boreholes are pending" names no hole numbers. The model
    returns no work items, and the email has no other scoped fact."""
    from app.api.events import confirm, list_match_suggestions

    def location_only(outputs):
        outputs["TITLE: Drilling completion follow-up"] = [
            _item("completed_quantity", "Four west wing boreholes are pending until the laydown area is cleared.",
                  value={"item": "boreholes", "location": "West wing"}),
        ]
    matter, _cards = _run(monkeypatch, _variant(location_only))
    pending = next(a for a in store.assertions.values() if a.statement.startswith("Four west wing"))
    assert pending.extra_work_id is None
    suggestion = next(s for s in list_match_suggestions(matter_id=matter.id) if s["kind"] == "ATTACH")
    assert suggestion["facts"][0]["id"] == pending.id

    confirm(suggestion["id"])
    assert pending.relationship_status == "CONFIRMED_BY_REVIEW"
    card = list_issue_dashboard(tenant_id="GOLD", matter_id=matter.id)[0]
    assert pending.event_id == card["event_id"] and pending.id in card["issues"][0]["issue"].evidence_ids


def test_a_decided_suggestion_cannot_be_decided_again(monkeypatch) -> None:
    from fastapi import HTTPException

    from app.api.events import confirm, list_match_suggestions, reject

    matter, _cards = _run_order(monkeypatch, [2, 3, 4, 1, 0])
    suggestion = list_match_suggestions(matter_id=matter.id)[0]
    reject(suggestion["id"], None)
    with pytest.raises(HTTPException) as error:
        confirm(suggestion["id"], None)
    assert error.value.status_code == 409


def test_timeline_modality_separates_rules_negatives_and_plans() -> None:
    _matter, cards = _run()
    evidence = {item["statement"]: item for record in cards[0]["issues"] for item in record["evidence"]}
    by_start = lambda text: next(item for statement, item in evidence.items() if statement.startswith(text))
    # The clause about approved substitutions is a requirement, not an approval.
    assert by_start("Any approved substitution")["modality"] == "REQUIREMENT"
    assert by_start("No technical substitution")["modality"] == "NEGATIVE"
    assert by_start("The structural team requested footing release")["modality"] == "PLANNED"
