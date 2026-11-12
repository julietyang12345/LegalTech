from app.domain_contracts.schemas import ExecutableRuleSpec, LegalPrinciple, RuleApprovalStatus
from app.repositories.memory import store


def register_rule(principle: LegalPrinciple, spec: ExecutableRuleSpec) -> ExecutableRuleSpec:
    if spec.legal_principle_id != principle.id:
        raise ValueError("rule and legal principle do not match")
    if spec.approval_status == RuleApprovalStatus.approved and principle.approval_status != RuleApprovalStatus.approved:
        raise ValueError("an approved executable rule requires an approved legal principle")
    store.legal_principles[principle.id] = principle
    store.rule_specs[(spec.id, spec.version)] = spec
    return spec


def get_rule(rule_id: str, version: str | None = None) -> ExecutableRuleSpec | None:
    candidates = [rule for (candidate_id, _), rule in store.rule_specs.items() if candidate_id == rule_id]
    if version is not None:
        return store.rule_specs.get((rule_id, version))
    return sorted(candidates, key=lambda rule: rule.version)[-1] if candidates else None
