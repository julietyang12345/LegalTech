from app.analysis.dependency_graph import record_issue_dependencies
from app.analysis.reconciliation import reconcile_issue
from app.decision_engine.dependencies import determine_rule_affected_issues
from app.domain_contracts.schemas import EvidenceAssertion, ExecutableRuleSpec, Obligation, WorkflowStatus
from app.repositories.memory import store


def reanalyze_rule_dependents(
    *, rule: ExecutableRuleSpec, obligations: list[Obligation], assertions: list[EvidenceAssertion],
    analysis_run_id: str, pipeline_version: str = "0.1.0",
) -> list[str]:
    """Recompute only issues that depend on the supplied rule version."""
    issue_ids = determine_rule_affected_issues(rule.id)
    affected: list[str] = []
    for issue_id in issue_ids:
        issue = store.issues[issue_id]
        issue.workflow_status = WorkflowStatus.analyzing
        assessment = reconcile_issue(
            issue=issue,
            obligations=obligations,
            assertions=assertions,
            analysis_run_id=analysis_run_id,
            pipeline_version=pipeline_version,
            rule=rule,
        )
        record_issue_dependencies(issue, assessment, rule)
        affected.append(issue_id)
    return affected
