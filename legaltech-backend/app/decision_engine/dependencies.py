from pathlib import Path
import json

from app.repositories.memory import store


RULE_PATH = Path(__file__).parent / "rules" / "construction_extras_v1.json"


def load_rule_set() -> dict:
    return json.loads(RULE_PATH.read_text())


def determine_affected_nodes(signal_types: list[str]) -> list[str]:
    rules = load_rule_set()
    affected: list[str] = []
    for node in rules["nodes"]:
        if any(signal_type in node["depends_on"] for signal_type in signal_types):
            affected.append(node["node_id"])
    return affected


def determine_rule_affected_issues(rule_id: str, rule_version: str | None = None) -> list[str]:
    """Return issue IDs that must be re-evaluated after a rule changes."""
    return [
        issue.id for issue in store.issues.values()
        if rule_id in issue.rule_ids
        and (rule_version is None or rule_version in issue.rule_version_ids)
    ]


def determine_rule_affected_assessments(rule_id: str, rule_version: str | None = None) -> list[str]:
    """Return assessment IDs downstream of a rule version for targeted reanalysis."""
    issue_ids = set(determine_rule_affected_issues(rule_id, rule_version))
    return [assessment.id for assessment in store.assessments.values() if assessment.issue_id in issue_ids]
