from datetime import datetime

from app.analysis.event_time import normalize_event_time, parse_event_date
from app.api.issues import _serialize_issue
from app.domain_contracts.schemas import ExtraWork, Issue, IssueType
from app.repositories.memory import store


def test_extra_work_lookup_is_scoped_to_tenant_and_matter() -> None:
    store.reset()
    first = store.find_extra_work(tenant_id="T1", matter_id="M1", external_id="EW-201")
    assert first is None


def test_partial_source_date_is_normalized_without_upload_fallback() -> None:
    normalized = normalize_event_time("Feb 3", reference_at=datetime(2026, 4, 8))
    assert normalized.raw_value == "Feb 3"
    assert normalized.iso_value == "2026-02-03"
    assert normalized.confidence == "PARTIAL_DATE_INFERRED"
    assert parse_event_date(None, reference_at=datetime(2026, 4, 8)) is None


def test_issue_extra_work_serialization_does_not_cross_matter() -> None:
    store.reset()
    store.extra_works["one"] = ExtraWork(
        id="one", tenant_id="T1", matter_id="M1", external_id="EW-201", title="Matter one"
    )
    store.extra_works["two"] = ExtraWork(
        id="two", tenant_id="T1", matter_id="M2", external_id="EW-201", title="Matter two"
    )
    issue = Issue(
        tenant_id="T1", matter_id="M2", type=IssueType.notice,
        extra_work_id="EW-201", title="Issue", summary="Summary",
    )
    assert _serialize_issue(issue)["extra_work"].title == "Matter two"
