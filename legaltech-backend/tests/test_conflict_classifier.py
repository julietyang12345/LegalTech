from datetime import datetime

from app.analysis.conflict_classifier import validate_ai_relationship
from app.domain_contracts.schemas import EvidenceAssertion, Provenance


def _assertion(assertion_id: str, ew: str | None, date: str, matter: str = "M1") -> EvidenceAssertion:
    return EvidenceAssertion(
        id=assertion_id, tenant_id="T1", matter_id=matter,
        source_document_id=assertion_id, extra_work_id=ew,
        assertion_type="price_approval", statement=assertion_id,
        event_at=date, uploaded_at=datetime(2026, 1, 1),
        provenance=Provenance(tenant_id="T1", matter_id=matter, analysis_run_id="R", pipeline_version="P"),
    )


def test_ai_revocation_is_confirmed_only_for_same_scope_and_later_date() -> None:
    earlier = _assertion("A1", "EW-501", "2026-04-08")
    later = _assertion("A2", "EW-501", "2026-04-09")
    classification, reason = validate_ai_relationship(later, earlier, "REVOKES")
    assert classification.value == "LATER_MODIFICATION"
    assert reason is None


def test_ai_relation_across_extra_works_is_not_a_conflict() -> None:
    earlier = _assertion("A1", "EW-501", "2026-04-08")
    later = _assertion("A2", "EW-502", "2026-04-09")
    classification, reason = validate_ai_relationship(later, earlier, "REVOKES")
    assert classification.value == "DIFFERENT_SCOPE"
    assert reason == "DIFFERENT_SCOPE"


def test_ai_relation_without_scope_requires_review() -> None:
    earlier = _assertion("A1", None, "2026-04-08")
    later = _assertion("A2", None, "2026-04-09")
    classification, reason = validate_ai_relationship(later, earlier, "MODIFIES")
    assert classification is None
    assert reason == "UNRESOLVED_SCOPE"
