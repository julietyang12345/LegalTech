from dataclasses import dataclass

from app.analysis.requirement_evaluator import evaluate_requirements
from app.analysis.rule_activation import activate_rules
from app.domain_contracts.schemas import EvidenceAssertion, ExecutableRuleSpec, RequirementCheck, Provenance


@dataclass(frozen=True)
class GoldenCase:
    id: str
    assertions: list[EvidenceAssertion]
    expects_activation: bool
    expected_requirements: dict[str, str]
    scope_id: str | None = None


@dataclass(frozen=True)
class GoldenCaseResult:
    case_id: str
    activation_expected: bool
    activation_observed: bool
    requirement_accuracy: float
    requirement_count: int


def evaluate_golden_case(rule: ExecutableRuleSpec, case: GoldenCase) -> GoldenCaseResult:
    assertions = [assertion for assertion in case.assertions if case.scope_id is None or _scope(assertion) == case.scope_id]
    activations = activate_rules(rules=[rule], assertions=assertions)
    checks = evaluate_requirements(
        rule=rule,
        assertions=assertions,
        search_attempts=[],
        tenant_id=assertions[0].tenant_id if assertions else "test",
        matter_id=assertions[0].matter_id if assertions else "test",
        analysis_run_id=f"EVAL-{case.id}",
        pipeline_version="eval-1.0",
    )
    expected = case.expected_requirements
    correct = sum(1 for check in checks if expected.get(check.requirement_id) == check.result.value)
    count = len(expected)
    return GoldenCaseResult(
        case_id=case.id,
        activation_expected=case.expects_activation,
        activation_observed=bool(activations),
        requirement_accuracy=correct / count if count else 1.0,
        requirement_count=count,
    )


def evaluate_golden_cases(rule: ExecutableRuleSpec, cases: list[GoldenCase]) -> dict:
    results = [evaluate_golden_case(rule, case) for case in cases]
    activation_expected = sum(result.activation_expected for result in results)
    activation_hits = sum(result.activation_expected and result.activation_observed for result in results)
    return {
        "rule_id": rule.id,
        "rule_version": rule.version,
        "case_count": len(results),
        "rule_activation_recall": activation_hits / activation_expected if activation_expected else 1.0,
        "requirement_evaluation_accuracy": sum(result.requirement_accuracy for result in results) / len(results) if results else 1.0,
        "results": results,
    }


def _scope(assertion: EvidenceAssertion) -> str | None:
    if isinstance(assertion.value, dict):
        value = assertion.value.get("extra_work_id") or assertion.value.get("event_id")
        return str(value) if value else None
    return None
