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
    return {
        "issue": issue,
        "assessment": assessment,
        "assessment_history": assessment_history,
        "extra_work": next(
            (item for item in store.extra_works.values() if item.external_id == issue.extra_work_id),
            None,
        ) if issue.extra_work_id else None,
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
