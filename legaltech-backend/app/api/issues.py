from fastapi import APIRouter, HTTPException

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
    grouped: dict[str, list[dict]] = {}
    for issue in issues:
        serialized = _serialize_issue(issue)
        key = issue.extra_work_id or issue.id
        grouped.setdefault(key, []).append(serialized)
    cards = []
    for extra_work_id, records in grouped.items():
        dashboards = [record["dashboard"] for record in records]
        first = records[0]
        cards.append({
            "extra_work_id": extra_work_id,
            "title": first["dashboard"]["title"],
            "claimed_amount": first["dashboard"]["claimed_amount"],
            "currency": first["dashboard"]["currency"],
            "risk_label": "Potential documentation risk" if any(item["risk_label"] == "Potential documentation risk" for item in dashboards) else "No identified documentation gap",
            "review_status": "RECOMMENDED" if any(item["review_status"] == "RECOMMENDED" for item in dashboards) else "NOT_REQUIRED",
            "missing_requirements": sorted({item for dashboard in dashboards for item in dashboard["missing_requirements"]}),
            "contrary_requirements": sorted({item for dashboard in dashboards for item in dashboard["contrary_requirements"]}),
            "next_action": next((item["next_action"] for item in dashboards if item["risk_label"] == "Potential documentation risk"), "No additional documentation action identified."),
            "search_coverage": sum(item["search_coverage"] for item in dashboards),
            "uncertainty_reasons": sorted({item for dashboard in dashboards for item in dashboard["uncertainty_reasons"]}),
            "conflict_classifications": sorted({item for dashboard in dashboards for item in dashboard["conflict_classifications"]}),
            "issues": records,
        })
    return cards


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
    extra_work = next(
        (item for item in store.extra_works.values() if item.external_id == issue.extra_work_id),
        None,
    ) if issue.extra_work_id else None
    return {
        "issue": issue,
        "assessment": assessment,
        "assessment_history": assessment_history,
        "extra_work": extra_work,
        "dashboard": {
            "extra_work_id": issue.extra_work_id,
            "title": extra_work.title if extra_work and extra_work.title else issue.title,
            "claimed_amount": extra_work.proposed_amount if extra_work else None,
            "currency": extra_work.currency if extra_work else None,
            "risk_label": "Potential documentation risk" if missing_requirements or contrary_requirements else "No identified documentation gap",
            "review_status": "RECOMMENDED" if assessment and assessment.review_status.value == "REQUIRED" else "NOT_REQUIRED",
            "missing_requirements": missing_requirements,
            "contrary_requirements": contrary_requirements,
            "next_action": (
                "Look for a pre-work cost estimate, signed change order, or other communication establishing price approval or a possible exception."
                if missing_requirements or contrary_requirements
                else "No additional documentation action identified."
            ),
            "search_coverage": sum(len(check.search_attempt_ids) for check in checks),
            "uncertainty_reasons": [item.value for item in (assessment.uncertainty_reasons if assessment else [])],
            "conflict_classifications": [item.value for item in (assessment.conflict_classifications if assessment else [])],
        },
        "evidence_links": [
            link for link in store.evidence_links.values()
            if link.requirement_check_id in requirement_check_ids
        ],
        "evidence": [store.assertions[evidence_id] for evidence_id in issue.evidence_ids if evidence_id in store.assertions],
        "rules": [
            store.rule_specs[(rule_id, version)]
            for rule_id in issue.rule_ids
            for version in issue.rule_version_ids
            if (rule_id, version) in store.rule_specs
        ],
    }
