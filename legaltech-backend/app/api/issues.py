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
    return {
        "issue": issue,
        "assessment": store.assessments.get(issue.current_assessment_id) if issue.current_assessment_id else None,
        "evidence": [store.assertions[evidence_id] for evidence_id in issue.evidence_ids if evidence_id in store.assertions],
        "rules": [
            store.rule_specs[(rule_id, version)]
            for rule_id in issue.rule_ids
            for version in issue.rule_version_ids
            if (rule_id, version) in store.rule_specs
        ],
    }
