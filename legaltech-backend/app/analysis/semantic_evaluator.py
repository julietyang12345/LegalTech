from dataclasses import dataclass

from app.domain_contracts.schemas import EvidenceAssertion, RuleRequirement


@dataclass(frozen=True)
class SemanticJudgment:
    result: str
    supporting_ids: list[str]
    contrary_ids: list[str]
    explanation: str


def judge_requirement(requirement: RuleRequirement, assertions: list[EvidenceAssertion]) -> SemanticJudgment | None:
    """Use the configured model for semantic evidence selection when enabled.

    A disabled/unavailable model returns None. Callers must then keep the
    result as a candidate requiring review; keyword matches never become a
    final legal conclusion.
    """
    try:
        from app.core.config import get_settings
        settings = get_settings()
    except Exception:
        return None
    if not settings.ai_extraction_enabled or not settings.openai_api_key or not assertions:
        return None
    try:
        from openai import OpenAI, OpenAIError
        import json
        client = OpenAI(api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds)
        excerpts = "\n".join(f"{a.id}: {a.statement}" for a in assertions)[: settings.ai_extraction_max_chars]
        response = client.chat.completions.create(
            model=settings.openai_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Classify project-fact evidence for one legal requirement. Return JSON only with result support, contrary, or uncertain; supporting_ids; contrary_ids; explanation. Mark evidence contrary only when it is a project-specific denial, limitation, or incompatible fact; a general legal or contractual rule is context, not proof that this project lacked the required fact. Do not give legal advice."},
                {"role": "user", "content": f"Requirement: {requirement.label}\nQueries: {requirement.evidence_queries}\nEvidence:\n{excerpts}"},
            ],
        )
        payload = json.loads(response.choices[0].message.content or "{}")
    except Exception:
        return None
    valid_ids = {assertion.id for assertion in assertions}
    supporting = [item for item in payload.get("supporting_ids", []) if item in valid_ids]
    contrary = [item for item in payload.get("contrary_ids", []) if item in valid_ids]
    result = payload.get("result")
    if result not in {"support", "contrary", "uncertain"}:
        return None
    return SemanticJudgment(
        result=result,
        supporting_ids=supporting,
        contrary_ids=contrary,
        explanation=str(payload.get("explanation") or "Model returned a bounded evidence classification."),
    )
