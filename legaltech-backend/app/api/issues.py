from fastapi import APIRouter, HTTPException

from app.analysis.event_identity import event_tags
from app.analysis.evidence_relationships import assertion_modality
from app.analysis.event_time import assertion_event_date
from app.domain_contracts.schemas import DETERMINISTIC_PATTERNS
from app.legal_knowledge.taxonomy import merge_tags, normalize_tag
from app.repositories.memory import store

router = APIRouter()


@router.get("")
def list_issues(tenant_id: str | None = None, matter_id: str | None = None) -> list[dict]:
    """Return issue detail data for the reviewer view.

    Authentication and trusted tenant identity must be supplied by the
    deployment gateway before this endpoint is used with confidential data.
    """
    issues = list(store.issues.values())
    if tenant_id:
        issues = [issue for issue in issues if issue.tenant_id == tenant_id]
    if matter_id:
        issues = [issue for issue in issues if issue.matter_id == matter_id]
    return [_serialize_issue(issue) for issue in issues]


@router.get("/dashboard")
def list_issue_dashboard(tenant_id: str | None = None, matter_id: str | None = None) -> list[dict]:
    """Return one reviewer-facing card per Extra Work identity.

    Individual issues remain available from ``GET /issues`` for auditability;
    this endpoint is the canonical presentation shape for the Dashboard.
    """
    if not matter_id:
        raise HTTPException(status_code=400, detail="matter_id is required for dashboard issue data")
    issues = list(store.issues.values())
    if tenant_id:
        issues = [issue for issue in issues if issue.tenant_id == tenant_id]
    if matter_id:
        issues = [issue for issue in issues if issue.matter_id == matter_id]
    incomplete_documents = [
        document for document in store.documents.values()
        if document.matter_id == matter_id
        and (not tenant_id or document.tenant_id == tenant_id)
        and document.metadata.get("analysis_status") == "ANALYSIS_INCOMPLETE"
    ]
    grouped: dict[str, list[dict]] = {}
    for issue in issues:
        if issue.merged_into_event_id:
            # Kept for audit; its evidence now belongs to the surviving event.
            continue
        serialized = _serialize_issue(issue)
        if _nothing_to_compare(serialized):
            # A required-vs-observed rule fired but found no requirement or
            # observation to compare: no finding, so no card entry.
            continue
        # Group by internal event identity, so aliases of one event share a card.
        key = issue.event_id or issue.extra_work_id or issue.id
        grouped.setdefault(key, []).append(serialized)
    cards = []
    for _group_key, records in grouped.items():
        extra_work_id = records[0]["issue"].extra_work_id or records[0]["issue"].id
        dashboards = [record["dashboard"] for record in records]
        first = records[0]
        missing_requirements, contrary_requirements, unmet_requirements = _aggregate_requirement_gaps(records)
        timing_concerns = [concern for dashboard in dashboards for concern in dashboard["timing_concerns"]]
        historical_timing_review = bool(timing_concerns) or any(
            reason == "TEMPORAL_ORDER_UNCERTAIN"
            for dashboard in dashboards for reason in dashboard["uncertainty_reasons"]
        )
        at_risk_requirements = sorted({item for dashboard in dashboards for item in dashboard.get("at_risk_requirements", [])})
        current_gap = bool(missing_requirements or contrary_requirements or unmet_requirements or at_risk_requirements)
        event = first["extra_work"]
        cards.append({
            "extra_work_id": extra_work_id,
            "event_id": event.id if event is not None else None,
            "event": _event_identity(event, extra_work_id),
            "categories": _card_categories(event, records, matter_id),
            "title": first["dashboard"]["title"],
            "claimed_amount": first["dashboard"]["claimed_amount"],
            "currency": first["dashboard"]["currency"],
            "risk_label": "Potential documentation risk" if current_gap else "No identified documentation gap",
            "review_status": "RECOMMENDED" if any(item["review_status"] == "RECOMMENDED" for item in dashboards) else "NOT_REQUIRED",
            "missing_requirements": missing_requirements,
            "contrary_requirements": contrary_requirements,
            # Requirements the evidence shows are not met (e.g. 10 of 14 done).
            # Distinct from missing evidence and from contrary evidence.
            "unmet_requirements": unmet_requirements,
            "at_risk_requirements": at_risk_requirements,
            "current_documentation_status": "POTENTIAL_RISK" if current_gap else "RESOLVED",
            "historical_timing_review_required": historical_timing_review,
            # Past timing problems, kept apart from missing_requirements: a CO
            # signed after work started is documented, but late.
            "timing_concerns": timing_concerns,
            "next_action": next(
                (item["next_action"] for item in dashboards if item["risk_label"] == "Potential documentation risk"),
                _timing_next_action(timing_concerns) if historical_timing_review else "No additional documentation action identified.",
            ),
            "search_coverage": sum(item["search_coverage"] for item in dashboards),
            "analysis_basis": _merge_analysis_basis(dashboards),
            "retrieval_coverage": _merge_retrieval_coverage(records),
            "uncertainty_reasons": sorted({item for dashboard in dashboards for item in dashboard["uncertainty_reasons"]}),
            "conflict_classifications": sorted({item for dashboard in dashboards for item in dashboard["conflict_classifications"]}),
            "issues": records,
            "analysis_incomplete": bool(incomplete_documents),
            "analysis_incomplete_documents": [document.metadata.get("original_filename", document.id) for document in incomplete_documents],
        })
    if incomplete_documents and not cards:
        cards.append({
            "extra_work_id": "__ANALYSIS_INCOMPLETE__",
            "title": "Analysis incomplete",
            "claimed_amount": None,
            "currency": None,
            "risk_label": "Analysis incomplete",
            "review_status": "RECOMMENDED",
            "current_documentation_status": "ANALYSIS_INCOMPLETE",
            "historical_timing_review_required": False,
            "timing_concerns": [],
            "missing_requirements": [],
            "contrary_requirements": [],
            "unmet_requirements": [],
            "at_risk_requirements": [],
            "event": None,
            "categories": [],
            "next_action": "Configure AI extraction or retry analysis before treating the absence of findings as low risk.",
            "search_coverage": 0,
            "analysis_basis": {"recorded_searches": 0, "compared_checks": 0, "compared_fact_ids": [], "gap_bases": []},
            "retrieval_coverage": {"status": "UNKNOWN", "eligible_documents": [], "searched_documents": [], "candidate_assertions": [], "unresolved_scope_assertions": []},
            "uncertainty_reasons": ["AI_EXTRACTION_UNAVAILABLE"],
            "conflict_classifications": [],
            "issues": [],
            "analysis_incomplete": True,
            "analysis_incomplete_documents": [document.metadata.get("original_filename", document.id) for document in incomplete_documents],
        })
    return cards


@router.get("/findings")
def list_candidate_findings(tenant_id: str | None = None, matter_id: str | None = None) -> list[dict]:
    """AI-proposed candidate risks (experimental).

    UNASSESSED has no reliable rule coverage; RULE_COVERED has a matching
    approved rule but stale or incomplete requirement coverage. Neither is an
    assessed legal risk.
    """
    if not matter_id:
        raise HTTPException(status_code=400, detail="matter_id is required for findings")
    findings = [
        finding for finding in store.candidate_findings.values()
        if finding["matter_id"] == matter_id and (not tenant_id or finding["tenant_id"] == tenant_id)
    ]
    for finding in findings:
        finding["evidence"] = [
            {**item, "filename": _filename(item["source_document_id"])} for item in finding["evidence"]
        ]
    return sorted(findings, key=lambda item: (item["status"] == "ASSESSED", item["status"] == "RULE_COVERED", item["priority"] != "STANDARD", item["id"]))


@router.get("/{issue_id}")
def get_issue(issue_id: str) -> dict:
    issue = store.issues.get(issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="issue not found")
    return _serialize_issue(issue)


def _serialize_issue(issue) -> dict:
    assessment = store.assessments.get(issue.current_assessment_id) if issue.current_assessment_id else None
    assessment_history = sorted(
        [item for item in store.assessments.values() if item.issue_id == issue.id],
        key=lambda item: item.created_at,
        reverse=True,
    )
    requirement_check_ids = {check.id for check in assessment.requirement_checks} if assessment else set()
    checks = assessment.requirement_checks if assessment else []
    search_attempts = [attempt for attempt in store.search_attempts.values() if attempt.issue_id == issue.id]
    missing_requirements = [
        check.requirement_id
        for check in checks
        if check.result.value == "INSUFFICIENT_INFORMATION"
    ]
    contrary_requirements = [
        check.requirement_id
        for check in checks
        if check.result.value == "DISPUTED" or (check.evidence_outcome and check.evidence_outcome.value == "CONTRADICTED")
    ]
    unmet_requirements = [check.requirement_id for check in checks if check.result.value == "REQUIREMENT_NOT_SATISFIED"]
    # Open prerequisites before a milestone that has not (been shown to have)
    # taken place: a forward-looking exposure, not a requirement already failed.
    at_risk_requirements = [
        check.requirement_id for check in checks
        if check.milestone and check.milestone.readiness in {"AT_RISK", "REQUIRES_VERIFICATION"}
    ]
    gap = bool(missing_requirements or contrary_requirements or unmet_requirements or at_risk_requirements)
    # Required-vs-observed checks state their own next step from their data.
    pattern_actions = [
        check.next_action for check in checks
        if check.next_action and (check.comparison or check.milestone)
        and check.result.value != "REQUIREMENT_SATISFIED"
    ]
    extra_work = store.find_extra_work(
        tenant_id=issue.tenant_id,
        matter_id=issue.matter_id,
        external_id=issue.extra_work_id,
    ) if issue.extra_work_id else None
    return {
        "issue": issue,
        "assessment": assessment,
        "assessment_history": assessment_history,
        "extra_work": extra_work,
        "dashboard": {
            "extra_work_id": issue.extra_work_id,
            "title": extra_work.title if extra_work and extra_work.title else issue.title,
            "claimed_amount": (
                extra_work.claimed_amount
                if extra_work and extra_work.claimed_amount is not None
                else extra_work.proposed_amount if extra_work else None
            ),
            "currency": extra_work.currency if extra_work else None,
            "risk_label": "Potential documentation risk" if gap else "No identified documentation gap",
            "review_status": "RECOMMENDED" if assessment and assessment.review_status.value == "REQUIRED" else "NOT_REQUIRED",
            "missing_requirements": missing_requirements,
            "contrary_requirements": contrary_requirements,
            "unmet_requirements": unmet_requirements,
            "at_risk_requirements": at_risk_requirements,
            "next_action": (
                " ".join(dict.fromkeys(pattern_actions)) if pattern_actions
                else "Look for a pre-work cost estimate, signed change order, or other communication establishing price approval or a possible exception."
                if gap
                else "No additional documentation action identified."
            ),
            "search_coverage": sum(len(check.search_attempt_ids) for check in checks),
            # What the results rest on. Deterministic checks compare extracted
            # facts directly and record no search, so a search count alone
            # understates the basis.
            "analysis_basis": {
                "recorded_searches": sum(len(check.search_attempt_ids) for check in checks),
                "compared_checks": sum(1 for check in checks if check.comparison or check.milestone),
                "compared_fact_ids": sorted({
                    evidence_id for check in checks if check.comparison or check.milestone
                    for evidence_id in check.supporting_evidence_ids
                }),
                "gap_bases": sorted({check.gap_basis.value for check in checks if check.gap_basis}),
            },
            "retrieval_coverage": {
                "status": "PARTIAL" if any(item.coverage_status == "PARTIAL" for item in search_attempts) else "SEARCHED_CORPUS" if search_attempts else "UNKNOWN",
                "eligible_documents": sorted({doc_id for item in search_attempts for doc_id in item.eligible_document_ids}),
                "searched_documents": sorted({doc_id for item in search_attempts for doc_id in item.searched_document_ids}),
                "candidate_assertions": sorted({assertion_id for item in search_attempts for assertion_id in item.candidate_assertion_ids}),
                "unresolved_scope_assertions": sorted({assertion_id for item in search_attempts for assertion_id in item.unresolved_scope_assertion_ids}),
            },
            "uncertainty_reasons": [item.value for item in (assessment.uncertainty_reasons if assessment else [])],
            "conflict_classifications": [item.value for item in (assessment.conflict_classifications if assessment else [])],
            "requirement_findings": [_requirement_finding(check, issue) for check in checks],
            "timing_concerns": [
                _requirement_finding(check, issue) for check in checks
                if check.timing and check.timing.status.value in {"AFTER_WORK_START", "UNDETERMINED"} and check.timing.work_start_date
            ],
        },
        "evidence_links": [
            link for link in store.evidence_links.values()
            if link.requirement_check_id in requirement_check_ids
        ],
        "assertion_links": [
            link for link in store.assertion_links.values()
            if link.tenant_id == issue.tenant_id and link.matter_id == issue.matter_id
            and (link.source_assertion_id in issue.evidence_ids or link.target_assertion_id in issue.evidence_ids)
        ],
        # event_date: ISO date stated by the source for the fact; null when the
        # source gives none. Never the upload time.
        "evidence": [
            {
                **store.assertions[evidence_id].model_dump(),
                "event_date": assertion_event_date(store.assertions[evidence_id]),
                "modality": assertion_modality(store.assertions[evidence_id]),
                # Status as the checks read it ("not in the folder" is not_found,
                # whatever label the model gave).
                "reviewed_status": _reviewed_status(store.assertions[evidence_id]),
            }
            for evidence_id in issue.evidence_ids if evidence_id in store.assertions
        ],
        "rules": [
            store.rule_specs[(rule_id, version)]
            for rule_id in issue.rule_ids
            for version in issue.rule_version_ids
            if (rule_id, version) in store.rule_specs
        ],
    }


def _reviewed_status(assertion) -> str | None:
    from app.analysis.requirement_evaluator import _deliverable_status

    return _deliverable_status(assertion) if assertion.assertion_type == "deliverable_status" else None


def _merge_analysis_basis(dashboards: list[dict]) -> dict:
    bases = [item["analysis_basis"] for item in dashboards if item.get("analysis_basis")]
    return {
        "recorded_searches": sum(item["recorded_searches"] for item in bases),
        "compared_checks": sum(item["compared_checks"] for item in bases),
        "compared_fact_ids": sorted({fact for item in bases for fact in item["compared_fact_ids"]}),
        "gap_bases": sorted({basis for item in bases for basis in item["gap_bases"]}),
    }


def _requirement_finding(check, issue) -> dict:
    """Structured per-requirement result the Dashboard builds its text from."""
    rule_id = issue.rule_ids[0] if issue.rule_ids else None
    timing = check.timing
    return {
        "rule_id": rule_id,
        "requirement_id": check.requirement_id,
        "result": check.result.value,
        "evidence_outcome": check.evidence_outcome.value if check.evidence_outcome else None,
        "gap_basis": check.gap_basis.value if check.gap_basis else None,
        "milestone_readiness": check.milestone.readiness if check.milestone else None,
        "timing_status": timing.status.value if timing else None,
        "fact_date": timing.fact_date if timing else None,
        "work_start_date": timing.work_start_date if timing else None,
        "fact_documents": _documents_for(timing.fact_evidence_ids if timing else check.supporting_evidence_ids),
        "work_documents": _documents_for(timing.work_evidence_ids if timing else []),
    }


def _documents_for(assertion_ids: list[str]) -> list[dict]:
    documents: dict[str, dict] = {}
    for assertion_id in assertion_ids:
        assertion = store.assertions.get(assertion_id)
        if not assertion:
            continue
        document = store.documents.get(assertion.source_document_id)
        name = document.metadata.get("original_filename", document.id) if document else assertion.source_document_id
        documents.setdefault(assertion.source_document_id, {"document_id": assertion.source_document_id, "filename": name})
    return list(documents.values())


def _timing_next_action(concerns: list[dict]) -> str:
    late = [item for item in concerns if item["timing_status"] == "AFTER_WORK_START"]
    if late:
        return (
            "Review the legal effect of the late timing (possible ratification, waiver, or contractual exception). "
            "The supporting documents already exist; do not request them again."
        )
    return "Confirm the source dates; the order of approval or communication against work start could not be established."


def _merge_retrieval_coverage(records: list[dict]) -> dict:
    coverage = [item["dashboard"].get("retrieval_coverage", {}) for item in records]
    statuses = {item.get("status", "UNKNOWN") for item in coverage}
    status = "PARTIAL" if "PARTIAL" in statuses else "SEARCHED_CORPUS" if "SEARCHED_CORPUS" in statuses else "UNKNOWN"
    return {
        "status": status,
        "eligible_documents": sorted({value for item in coverage for value in item.get("eligible_documents", [])}),
        "searched_documents": sorted({value for item in coverage for value in item.get("searched_documents", [])}),
        "candidate_assertions": sorted({value for item in coverage for value in item.get("candidate_assertions", [])}),
        "unresolved_scope_assertions": sorted({value for item in coverage for value in item.get("unresolved_scope_assertions", [])}),
    }


def _aggregate_requirement_gaps(records: list[dict]) -> tuple[list[str], list[str], list[str]]:
    """Union gaps; a supported check resolves a gap only within the same rule.

    Two rules can share a requirement id (e.g. ``extra_work_occurred``) with
    different legal scope, so resolution is keyed by (rule, requirement).
    """
    resolved: set[tuple[str, str]] = set()
    missing: set[tuple[str, str]] = set()
    contrary: set[tuple[str, str]] = set()
    unmet: set[tuple[str, str]] = set()
    for record in records:
        issue = record.get("issue")
        rule_ids = _field(issue, "rule_ids") or [_field(issue, "id")]
        rule_key = "|".join(sorted(rule_ids))
        assessment = record.get("assessment")
        checks = (
            (assessment.get("requirement_checks", []) if isinstance(assessment, dict) else getattr(assessment, "requirement_checks", []))
            if assessment else []
        )
        resolved |= {
            (rule_key, _field(check, "requirement_id")) for check in checks
            if _field(check, "result") in {"REQUIREMENT_SATISFIED", "AssessmentStatus.satisfied"}
            or _field(check, "evidence_outcome") in {"SUPPORTED", "EvidenceOutcome.supported"}
        }
        missing |= {(rule_key, item) for item in record["dashboard"]["missing_requirements"]}
        contrary |= {(rule_key, item) for item in record["dashboard"]["contrary_requirements"]}
        unmet |= {(rule_key, item) for item in record["dashboard"].get("unmet_requirements", [])}
    return (
        sorted({requirement for _rule, requirement in missing - resolved}),
        sorted({requirement for _rule, requirement in contrary - resolved}),
        sorted({requirement for _rule, requirement in unmet - resolved}),
    )


def _event_identity(event, key: str) -> dict:
    """How the card names its event: a stated identifier first, else the
    location or work items the documents state. Never an invented ID."""
    if event is None:
        return {"id": None, "key": key, "display_id": key, "aliases": [], "location": None, "work_items": [], "identity_status": "CONFIRMED", "document_ids": []}
    stated = [value for value in [event.external_id, *event.aliases] if not str(value).startswith("EVT-")]
    items = sorted(event.work_items)
    span = (items[0] if len(items) == 1 else f"{items[0]}–{items[-1]}") if items else None
    return {
        "id": event.id,
        "key": event.external_id,
        "display_id": stated[0] if stated else event.location or span or "Event",
        "aliases": event.aliases,
        "location": event.location,
        "work_items": items,
        "identity_status": event.identity_status,
        "document_ids": event.document_ids,
    }


def _card_categories(event, records: list[dict], matter_id: str) -> list[dict]:
    """Root cause from the event; possible impacts from the rules that
    assessed it and from AI findings on the same event. All labels only."""
    tags = event_tags(event) if event is not None else []
    for record in records:
        for rule in record["rules"]:
            tags += [tag for code in rule.impact_categories if (tag := normalize_tag(code, "IMPACT", "POTENTIAL", f"rule:{rule.id}"))]
    key = event.external_id if event is not None else None
    for finding in store.candidate_findings.values():
        if key and finding["matter_id"] == matter_id and finding["event_key"] == key:
            tags += finding["categories"]
    return merge_tags(tags)


def _nothing_to_compare(record: dict) -> bool:
    rules = record["rules"]
    assessment = record["assessment"]
    pattern_only = bool(rules) and all(
        req.patterns and set(req.patterns) <= DETERMINISTIC_PATTERNS for rule in rules for req in rule.requirements
    )
    return pattern_only and assessment is not None and not assessment.requirement_checks


def _filename(document_id: str) -> str:
    document = store.documents.get(document_id)
    return document.metadata.get("original_filename", document_id) if document else document_id


def _field(value, name: str):
    item = value.get(name) if isinstance(value, dict) else getattr(value, name, None)
    return getattr(item, "value", item)
