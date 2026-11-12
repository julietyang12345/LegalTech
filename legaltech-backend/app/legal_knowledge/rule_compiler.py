from app.domain_contracts.schemas import ExecutableRuleSpec, LegalPrinciple, RuleApprovalStatus


def compile_rule(principle: LegalPrinciple, spec: ExecutableRuleSpec) -> ExecutableRuleSpec:
    """Validate the link between an approved principle and its executable rule.

    Compilation does not approve legal content. A lawyer or authorized reviewer
    must publish the returned candidate separately.
    """
    if spec.legal_principle_id != principle.id:
        raise ValueError("rule must reference the supplied legal principle")
    if principle.approval_status != RuleApprovalStatus.approved:
        raise ValueError("only an approved legal principle may be compiled")
    if not spec.discovery_triggers:
        raise ValueError("executable rule requires at least one discovery trigger")
    if not spec.requirements:
        raise ValueError("executable rule requires at least one requirement")
    return spec
