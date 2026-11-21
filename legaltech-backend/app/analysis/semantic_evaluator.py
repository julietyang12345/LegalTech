"""AI classification of how each candidate assertion bears on one requirement.

The model labels evidence; it never decides a requirement's final status.
Deterministic code in ``requirement_evaluator`` decides which labels are
structurally admissible (assertion type, role, EW scope, dates) and how the
admitted labels combine into a RequirementCheck.
"""

from dataclasses import dataclass, field
import json
import logging

from app.analysis.evidence_relationships import assertion_scope
from app.domain_contracts.schemas import EvidenceAssertion, RuleRequirement

logger = logging.getLogger(__name__)

PROMPT_VERSION = "semantic-relations-v3"

RELATIONS = {"SUPPORTS", "CONTRADICTS", "CONDITIONAL", "CONTEXT", "UNCERTAIN"}
CHANGE_RELATIONS = {"MODIFIES", "SUPERSEDES", "REVOKES"}

SYSTEM_PROMPT = """You classify project evidence against ONE legal requirement.
For EVERY evidence item, return how it bears on THIS requirement only:
- SUPPORTS: a completed, affirmative, project-specific fact that establishes the requirement.
- CONTRADICTS: a project-specific denial, refusal, limitation, or incompatible fact.
- CONDITIONAL: the very fact the requirement asks about depends on an unmet condition (signature, funding, later confirmation). Put the condition in "condition".
- CONTEXT: relevant background that does not establish or deny the requirement.
Judge the requirement exactly as worded, not a neighbouring one. The same sentence can bear differently on different requirements:
- "Current estimate is $13,600" SUPPORTS "cost impact communicated" (the cost was communicated) but is CONTEXT for "owner approved additional cost".
- "We can hold the price at $13,600 if you sign today" SUPPORTS "cost impact communicated" (the communication itself is complete) and is CONDITIONAL only for approval.
- "Please proceed" SUPPORTS "work directed / extra work occurred" but is CONTEXT for price approval.
- UNCERTAIN: the language is genuinely ambiguous for this requirement.
Distinguish completed acts from future plans, proposals, conditions, and denials. A general legal or contractual rule is CONTEXT, never proof of a project fact.
If an item changes an EARLIER item in the list (new amount, withdrawal, replacement), set "changes" to {"target_id": <earlier id>, "type": "MODIFIES" | "SUPERSEDES" | "REVOKES"}. Only reference ids from the list.
Return JSON only: {"relations": [{"id", "relation", "rationale", "condition"?, "changes"?}], "explanation"}.
Do not give legal advice."""


@dataclass(frozen=True)
class RelationJudgment:
    assertion_id: str
    relation: str
    rationale: str = ""
    condition: str | None = None
    change_target_id: str | None = None
    change_type: str | None = None


@dataclass(frozen=True)
class SemanticJudgment:
    """Model output for one requirement.

    ``status`` is "completed" or "failed". A failed judgment means the semantic
    step ran but produced nothing usable; callers must treat the analysis as
    incomplete rather than as missing evidence. ``omitted_ids`` lists candidates
    that were omitted by the input budget or by the model response.
    """

    result: str
    supporting_ids: list[str] = field(default_factory=list)
    contrary_ids: list[str] = field(default_factory=list)
    explanation: str = ""
    relations: dict[str, RelationJudgment] = field(default_factory=dict)
    status: str = "completed"
    omitted_ids: list[str] = field(default_factory=list)
    model_id: str | None = None

    def relation_for(self, assertion_id: str) -> RelationJudgment | None:
        if self.relations:
            return self.relations.get(assertion_id)
        # Legacy shape: only id lists were provided.
        if assertion_id in self.supporting_ids:
            return RelationJudgment(assertion_id, "SUPPORTS", self.explanation)
        if assertion_id in self.contrary_ids:
            return RelationJudgment(assertion_id, "CONTRADICTS", self.explanation)
        return None


def failed_judgment(reason: str, omitted_ids: list[str] | None = None) -> SemanticJudgment:
    return SemanticJudgment(result="uncertain", explanation=reason, status="failed", omitted_ids=omitted_ids or [])


def judge_requirement(requirement: RuleRequirement, assertions: list[EvidenceAssertion]) -> SemanticJudgment | None:
    """Label each candidate assertion relative to ``requirement``.

    Returns None only when the model is not configured (heuristic mode). Any
    error or unusable output returns a ``failed`` judgment instead, so the
    caller can report ANALYSIS_INCOMPLETE rather than silently degrading.
    """
    try:
        from app.core.config import get_settings
        settings = get_settings()
    except Exception as error:
        logger.exception("semantic evaluator settings lookup failed: %s", type(error).__name__)
        return None
    if not settings.ai_extraction_enabled or not settings.openai_api_key or not assertions:
        return None
    excerpts, omitted = bounded_excerpts(assertions, settings.ai_extraction_max_chars)
    if not excerpts:
        return failed_judgment("No candidate fit the model input budget.", omitted)
    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds)
        response = client.chat.completions.create(
            model=settings.openai_model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Requirement: {requirement.label}\nQueries: {requirement.evidence_queries}\nEvidence (oldest first):\n" + "\n".join(excerpts)},
            ],
        )
        payload = json.loads(response.choices[0].message.content or "{}")
    except Exception as error:
        logger.exception("semantic evaluator model call failed: %s", type(error).__name__)
        return failed_judgment(f"Semantic model call failed ({type(error).__name__}).", omitted)
    sent_ids = [a.id for a in assertions if a.id not in set(omitted)]
    judgment = parse_judgment(payload, sent_ids=sent_ids, omitted_ids=omitted)
    if judgment.status == "completed":
        judgment = SemanticJudgment(**{**judgment.__dict__, "model_id": settings.openai_model})
    return judgment


def parse_judgment(payload: dict, *, sent_ids: list[str], omitted_ids: list[str] | None = None) -> SemanticJudgment:
    """Validate model JSON. Unknown ids, labels, or self-references are dropped."""
    omitted_ids = omitted_ids or []
    raw_relations = payload.get("relations") if isinstance(payload, dict) else None
    if not isinstance(raw_relations, list):
        return failed_judgment("Semantic model returned no relations list.", omitted_ids)
    valid = set(sent_ids)
    order = {assertion_id: index for index, assertion_id in enumerate(sent_ids)}
    relations: dict[str, RelationJudgment] = {}
    for item in raw_relations:
        if not isinstance(item, dict):
            continue
        assertion_id = item.get("id")
        relation = str(item.get("relation") or "").upper()
        if assertion_id not in valid or relation not in RELATIONS or assertion_id in relations:
            continue
        target_id = change_type = None
        changes = item.get("changes")
        if isinstance(changes, dict):
            candidate = changes.get("target_id")
            kind = str(changes.get("type") or "").upper()
            # The model may only point at an id it was shown, other than itself.
            # Date order is validated by deterministic code, not here.
            if candidate in valid and candidate != assertion_id and kind in CHANGE_RELATIONS:
                target_id, change_type = candidate, kind
        condition = item.get("condition")
        relations[assertion_id] = RelationJudgment(
            assertion_id=assertion_id,
            relation=relation,
            rationale=str(item.get("rationale") or ""),
            condition=str(condition) if condition else None,
            change_target_id=target_id,
            change_type=change_type,
        )
    missing_ids = sorted(valid - set(relations), key=order.get)
    if not relations:
        return failed_judgment("Semantic model returned no valid relations.", omitted_ids)
    if missing_ids:
        all_omitted = list(dict.fromkeys([*omitted_ids, *missing_ids]))
        return failed_judgment(
            "Semantic model did not classify every evidence item; analysis is incomplete.",
            all_omitted,
        )
    supporting = sorted((r.assertion_id for r in relations.values() if r.relation == "SUPPORTS"), key=order.get)
    contrary = sorted((r.assertion_id for r in relations.values() if r.relation == "CONTRADICTS"), key=order.get)
    result = "contrary" if contrary else "support" if supporting else "uncertain"
    return SemanticJudgment(
        result=result,
        supporting_ids=supporting,
        contrary_ids=contrary,
        explanation=str(payload.get("explanation") or "Model returned bounded per-evidence relations."),
        relations=relations,
        omitted_ids=omitted_ids,
    )


def bounded_excerpts(assertions: list[EvidenceAssertion], max_chars: int) -> tuple[list[str], list[str]]:
    """Fit whole assertions into the budget; never cut one mid-statement."""
    lines: list[str] = []
    omitted: list[str] = []
    used = 0
    for assertion in sorted(assertions, key=_sort_key):
        line = _excerpt(assertion)
        if used + len(line) + 1 > max_chars:
            omitted.append(assertion.id)
            continue
        lines.append(line)
        used += len(line) + 1
    return lines, omitted


def _when(assertion: EvidenceAssertion) -> str | None:
    return (
        assertion.price_approved_at or assertion.approval_at or assertion.price_communicated_at
        or assertion.communication_at or assertion.work_start_at or assertion.event_at
        or assertion.document_sent_at
    )


def _excerpt(assertion: EvidenceAssertion) -> str:
    when = _when(assertion)
    return (
        f"{assertion.id}: type={assertion.assertion_type}; date={when or 'unknown'}; "
        f"actor={assertion.actor or 'unknown'}; ew={assertion_scope(assertion) or 'unscoped'}; "
        f"statement={assertion.statement}"
    )


def _sort_key(assertion: EvidenceAssertion):
    when = _when(assertion)
    return (when is None, str(when or ""), assertion.asserted_at.isoformat() if assertion.asserted_at else "")
