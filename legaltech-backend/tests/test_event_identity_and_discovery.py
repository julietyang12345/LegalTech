"""Event matching, rule-vs-fact guards, and bounded AI discovery."""

from types import SimpleNamespace

import pytest

from app.analysis.event_identity import resolve_event_identity
from app.analysis.risk_discovery import discover_candidate_risks, validate_candidates
from app.analysis.text_semantics import is_negative_statement, is_normative_statement
from app.domain_contracts.schemas import (
    Assessment,
    AssessmentStatus,
    EvidenceAssertion,
    EvidenceRole,
    EvidenceStatus,
    Provenance,
    RequirementCheck,
)
from app.extraction.ai_signal_extractor import _candidate_from_item, stated_work_items
from app.repositories.memory import store


@pytest.fixture(autouse=True)
def _clean():
    store.reset()
    yield
    store.reset()


def _resolve(items, ew=None, doc="D1"):
    return resolve_event_identity(
        tenant_id="T", matter_id="M", extra_work_id=ew,
        value={"work_items": items}, document=SimpleNamespace(id=doc),
    )


# --- Event identity -----------------------------------------------------------

def test_overlapping_work_items_join_one_event_across_documents() -> None:
    first = _resolve(["TP-01", "TP-02", "TP-03"], doc="D1")
    second = _resolve(["TP-03"], doc="D2")
    assert first.key == second.key and second.status == "CONFIRMED"
    event = store.find_extra_work(tenant_id="T", matter_id="M", external_id=first.key)
    assert event.document_ids == ["D1", "D2"]


def test_disjoint_work_items_stay_separate_events() -> None:
    assert _resolve(["TP-01"]).key != _resolve(["TP-09"]).key


def test_fact_overlapping_two_events_is_possible_match_and_merges_nothing() -> None:
    a, b = _resolve(["TP-01"]), _resolve(["TP-09"])
    bridge = _resolve(["TP-01", "TP-09"])
    assert bridge.key is None and bridge.status == "POSSIBLE_MATCH"
    assert bridge.possible_keys == sorted([a.key, b.key])
    assert len(store.extra_works) == 2


def test_stated_ew_number_is_the_identity_and_records_work_items() -> None:
    from app.domain_contracts.schemas import ExtraWork

    store.extra_works["x"] = ExtraWork(tenant_id="T", matter_id="M", external_id="EW-700")
    assert _resolve(["GL-4"], ew="EW-700").key == "EW-700"
    # A later fact without the EW number joins through the recorded item.
    assert _resolve(["GL-4"]).key == "EW-700"


def test_no_work_items_and_no_ew_creates_no_event() -> None:
    assert _resolve([]).key is None and not store.extra_works


def test_invented_identifiers_and_work_items_are_dropped() -> None:
    text = "Subject: Test pits TP-01 to TP-03\n\nCrew finished TP-02 today."
    assert stated_work_items(["TP-02", "TP-03", "TP-77", "SITE-AREA-C"], text) == ["TP-02", "TP-03"]
    candidate = _candidate_from_item({
        "signal_type": "completed_quantity", "source_text": "Crew finished TP-02 today.", "confidence": 0.9,
        "extra_work_id": "SITE-AREA-C", "value": {"item": "test pits", "completed": 1, "work_items": ["TP-02", "TP-99"]},
    }, text)
    assert candidate.extra_work_id is None
    assert candidate.value["work_items"] == ["TP-02"]


def test_multi_label_event_dedupes_same_issue_but_keeps_distinct_legal_issues() -> None:
    from app.analysis.issue_discovery import _upsert_issue
    from app.domain_contracts.schemas import IssueType

    common = {
        "tenant_id": "T", "matter_id": "M", "issue_type": IssueType.notice,
        "title": "Notice", "summary": "Review", "obligation_ids": [],
        "rule_ids": ["NOTICE_RULE"], "rule_versions": ["1.0"],
        "issue_scope": "EVT-A", "extra_work_id": "EVT-A",
    }
    first = _upsert_issue(**common, evidence_ids=["A_FACT"])
    repeated = _upsert_issue(**common, evidence_ids=["B_FACT"])
    assert repeated.id == first.id
    assert repeated.evidence_ids == ["A_FACT", "B_FACT"]

    approval = _upsert_issue(
        **{**common, "issue_type": IssueType.change_order, "title": "Approval", "rule_ids": ["APPROVAL_RULE"]},
        evidence_ids=["A_FACT"],
    )
    assert approval.id != first.id


# --- Contract rule vs project fact ---------------------------------------------

@pytest.mark.parametrize("text", [
    "Any approved substitution shall be documented by the Owner and the consultant.",
    "All inspections must be recorded before close-in.",
    "The Contractor is required to submit a signed report.",
])
def test_normative_wording(text) -> None:
    assert is_normative_statement(text)


@pytest.mark.parametrize("text", [
    "The owner signed CO-12 on May 3.",
    "Crew completed 8 of 8 inspections.",
])
def test_project_facts_are_not_normative(text) -> None:
    assert not is_normative_statement(text)


def test_none_found_and_not_received_are_negative() -> None:
    assert is_negative_statement("Owner change to scope | None found")
    assert is_negative_statement("Final signoff | Not received")


def test_validator_reclassifies_signed_co_label_on_a_rule_and_rejects_none_found(tmp_path) -> None:
    from app.models import Document, ExtractedSignal
    from app.models.domain import DocumentType
    from app.validation.extraction_validator import validate_signals

    path = tmp_path / "doc.txt"
    path.write_text("Any approved substitution shall be documented by the Owner.\nOwner change to scope | None found")
    document = Document(document_type=DocumentType.unknown, file_hash="h", storage_path=str(path))

    def signal(kind, text):
        return ExtractedSignal(signal_type=kind, value={"polarity": "affirmative", "temporal_status": "completed"},
                               source_document_id=document.id, source_text=text, confidence=0.9, source_text_hash=kind)

    kept = validate_signals(document, [
        signal("signed_change_order", "Any approved substitution shall be documented by the Owner."),
        signal("extra_work_detected", "Owner change to scope | None found"),
    ])
    assert [s.signal_type for s in kept] == ["signed_change_order"]
    assert kept[0].value["temporal_status"] == "normative"


# --- Bounded AI discovery -------------------------------------------------------

def _assertion(id_, role, statement, scope=None):
    return EvidenceAssertion(
        id=id_, tenant_id="T", matter_id="M", source_document_id="D", evidence_role=role,
        assertion_type="x", statement=statement, value={"extra_work_id": scope} if scope else {},
        provenance=Provenance(tenant_id="T", matter_id="M", analysis_run_id="R", pipeline_version="t", method="test"),
    )


ASSERTIONS = [
    _assertion("REQ", EvidenceRole.normative_rule, "All 8 inspections shall be completed before close-in.", "EVT-A"),
    _assertion("FACT", EvidenceRole.project_fact, "5 of 8 inspections done.", "EVT-A"),
    _assertion("DEP", EvidenceRole.project_fact, "Close-in scheduled May 9.", "EVT-A"),
]


def _validate(candidate):
    return validate_candidates({"candidates": [candidate]}, assertions=ASSERTIONS, tenant_id="T", matter_id="M")


def test_discovery_drops_invented_ids_and_wrong_roles() -> None:
    assert _validate({"evidence_ids": ["NOPE", "REQ"]}) == []  # no valid project-fact evidence
    finding = _validate({"evidence_ids": ["FACT", "NOPE"], "requirement_ids": ["FACT"], "dependency_ids": ["REQ"]})[0]
    assert finding["evidence_ids"] == ["FACT"]
    # A fact cannot be the requirement, nor a rule the dependency: no basis.
    assert finding["requirement_ids"] == [] and finding["dependency_ids"] == []
    assert finding["priority"] == "LOW" and finding["basis_verified"] is False


def test_discovery_basis_must_link_a_requirement_and_a_dependency() -> None:
    finding = _validate({"evidence_ids": ["FACT"], "requirement_ids": ["REQ"], "dependency_ids": ["DEP"],
                         "why_this_matters": "Close-in depends on completed inspections."})[0]
    assert finding["basis_verified"] is True and finding["priority"] == "STANDARD"
    assert finding["event_key"] == "EVT-A"


def test_discovery_caps_damages_and_drops_unknown_categories() -> None:
    finding = _validate({"evidence_ids": ["FACT"], "categories": [
        {"code": "D_DAMAGES", "dimension": "IMPACT", "status": "CONFIRMED"},
        {"code": "RECOVERABLE_DAMAGES", "dimension": "IMPACT", "status": "CONFIRMED"},
        {"code": "E_UNEXPECTED_SITE_CONDITIONS", "dimension": "IMPACT", "status": "POTENTIAL"},  # wrong dimension
    ]})[0]
    assert [(t["code"], t["status"]) for t in finding["categories"]] == [("D_DAMAGES", "POTENTIAL")]


def _assessment(issue, rule, *, evidence_ids=None, complete=True):
    assessment = Assessment(
        tenant_id="T", matter_id="M", issue_id=issue.id,
        status=AssessmentStatus.insufficient_information,
        evidence_status=EvidenceStatus.partial,
        conclusion="Checked",
        evidence_ids=evidence_ids if evidence_ids is not None else ["FACT"],
        rule_ids=[rule.id], rule_version_ids=[rule.version],
        requirement_checks=[RequirementCheck(
            requirement_id="required_scope_completed",
            result=AssessmentStatus.insufficient_information,
            evidence_status=EvidenceStatus.partial,
            explanation="Checked", analysis_complete=complete,
            provenance=Provenance(tenant_id="T", matter_id="M", analysis_run_id="R", pipeline_version="t", method="test"),
        )],
        provenance=Provenance(tenant_id="T", matter_id="M", analysis_run_id="R", pipeline_version="t", method="test"),
    )
    store.assessments[assessment.id] = assessment
    issue.current_assessment_id = assessment.id
    return assessment


def test_discovery_requires_current_complete_assessment_for_assessed() -> None:
    from app.domain_contracts.schemas import Issue, IssueType
    from app.legal_knowledge.default_rules import required_precondition_rule

    candidate = {"evidence_ids": ["FACT"], "proposed_checks": ["QUANTITY_COMPLETENESS", "made_up"]}
    finding = _validate(candidate)[0]
    assert finding["status"] == "UNASSESSED" and finding["proposed_checks"] == ["QUANTITY_COMPLETENESS"]

    _principle, rule = required_precondition_rule()
    store.rule_specs[(rule.id, rule.version)] = rule
    issue = Issue(tenant_id="T", matter_id="M", type=IssueType.precondition, title="t", summary="s",
                  rule_ids=[rule.id], rule_version_ids=[rule.version], evidence_ids=["FACT"], extra_work_id="EVT-A")
    store.issues[issue.id] = issue
    # A matching approved rule without an assessment is only RULE_COVERED.
    assert _validate(candidate)[0]["status"] == "RULE_COVERED"
    _assessment(issue, rule)
    routed = _validate(candidate)[0]
    assert (routed["status"], routed["issue_ids"]) == ("ASSESSED", [issue.id])

    # The issue must reference the exact approved rule version.
    issue.rule_version_ids = ["stale-version"]
    assert _validate(candidate)[0]["status"] == "UNASSESSED"
    issue.rule_version_ids = [rule.version]

    # A completed but superseded assessment is not current coverage.
    assessment = store.assessments[issue.current_assessment_id]
    assessment.is_current = False
    assert _validate(candidate)[0]["status"] == "RULE_COVERED"

    # New issue evidence makes the old assessment stale.
    assessment.is_current = True
    issue.evidence_ids.append("NEW-FACT")
    assert _validate(candidate)[0]["status"] == "RULE_COVERED"

    # Partial candidate coverage is not ASSESSED.
    issue.evidence_ids = ["FACT"]
    _assessment(issue, rule)
    store.assessments[issue.current_assessment_id].requirement_checks[0].analysis_complete = False
    assert _validate(candidate)[0]["status"] == "RULE_COVERED"
    _assessment(issue, rule)
    partial = _validate({"evidence_ids": ["FACT"], "proposed_checks": [
        "QUANTITY_COMPLETENESS", "REQUIRED_DOCUMENT_FINAL",
    ]})[0]
    assert partial["status"] == "RULE_COVERED"
    assert partial["covered_checks"] == ["QUANTITY_COMPLETENESS"]
    assert partial["uncovered_checks"] == ["REQUIRED_DOCUMENT_FINAL"]

    # A check no rule implements stays unassessed even on a covered event.
    assert _validate({"evidence_ids": ["FACT"], "proposed_checks": ["RISK_ALLOCATION"]})[0]["status"] == "UNASSESSED"


def test_discovery_is_off_by_default() -> None:
    store.assertions.update({a.id: a for a in ASSERTIONS})
    assert discover_candidate_risks(tenant_id="T", matter_id="M") == []


# --- Regressions found in the live run (gpt-4.1-mini, 2026-11-24) ---------------

def test_materials_and_descriptions_are_not_work_items() -> None:
    text = "Installed two elbows, added 18 feet of rectangular duct. Room 204 and BH-11 checked."
    assert stated_work_items(["TWO ELBOWS", "18 FEET OF RECTANGULAR DUCT", "ROOM 204", "BH-11"], text) == ["ROOM 204", "BH-11"]


def test_model_normative_label_on_a_project_fact_is_reverted(tmp_path) -> None:
    from app.models import Document, ExtractedSignal
    from app.models.domain import DocumentType
    from app.validation.extraction_validator import validate_signals

    path = tmp_path / "log.txt"
    path.write_text("DOCUMENT TYPE: Geotechnical field investigation\nNo technical substitution has been approved.")
    document = Document(document_type=DocumentType.unknown, file_hash="h", storage_path=str(path), metadata={"declared_kind": "Geotechnical field investigation"})
    signal = ExtractedSignal(signal_type="scope_substitution", value={"polarity": "affirmative", "temporal_status": "normative"},
                             source_document_id=document.id, source_text="No technical substitution has been approved.",
                             confidence=0.9, source_text_hash="h")
    kept = validate_signals(document, [signal])
    assert kept[0].value["temporal_status"] == "denied" and kept[0].value["polarity"] == "negative"


def test_discovery_labels_are_never_confirmed() -> None:
    """Live run: the model called E03's schedule impact CONFIRMED."""
    finding = _validate({"evidence_ids": ["FACT"], "categories": [{"code": "C_SCHEDULE_TIME", "dimension": "IMPACT", "status": "CONFIRMED"}]})[0]
    assert [(t["code"], t["status"]) for t in finding["categories"]] == [("C_SCHEDULE_TIME", "POTENTIAL")]
