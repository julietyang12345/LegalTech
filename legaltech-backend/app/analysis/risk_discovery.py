"""Experimental, bounded AI discovery of candidate risks.

Approved rules only find what they were written to look for. This step lets
the model propose *candidate* project risks from the extracted evidence, so a
risk with no rule yet (an incomplete investigation, a design conflict) is not
silently missed or forced into the wrong rule.

Bounds, all enforced in code:
- The model may only cite assertion ids it was shown. Evidence must be project
  facts; the stated basis must be a contract requirement (normative) and a
  project dependency (a fact). Anything else is dropped.
- ``why_this_matters`` must point to those ids. A finding without a valid
  requirement + dependency link is kept, but at LOW priority.
- Categories come only from the taxonomy and are capped at POTENTIAL (the
  model's label is unverified). Nothing here can state damages are recoverable.
- A finding is never a legal conclusion. Routing distinguishes no coverage
  (UNASSESSED), rule coverage with stale/incomplete assessment (RULE_COVERED),
  and a complete assessment of every proposed check (ASSESSED).

Disabled unless ``AI_RISK_DISCOVERY_ENABLED`` is set.
"""

import json
import logging
from datetime import datetime

from app.analysis.evidence_relationships import assertion_scope
from app.analysis.event_time import assertion_event_date
from app.domain_contracts.schemas import CheckPattern, EvidenceRole
from app.legal_knowledge.taxonomy import merge_tags, normalize_tag
from app.repositories.memory import store

logger = logging.getLogger(__name__)

PROMPT_VERSION = "risk-discovery-v1"

# Checks the model may propose. The first group is implemented as CheckPatterns;
# the rest are recognised so they can be shown, but no rule evaluates them yet.
PROPOSABLE_CHECKS = {pattern.value for pattern in CheckPattern} | {
    "NOTICE", "AUTHORITY", "RISK_ALLOCATION", "ENTITLEMENT", "TIME_EXTENSION",
}

SYSTEM_PROMPT = """You review extracted construction-project evidence for candidate risks.
Each evidence line has an id, a role (PROJECT_FACT or NORMATIVE_RULE), a type,
a date and the source statement. Propose only risks the evidence itself shows,
for example a contract requirement whose actual state falls short before a
dependent milestone. Do not repeat a risk only because a category exists.
Return JSON only:
{"candidates": [{
  "candidate_event": short description,
  "evidence_ids": [PROJECT_FACT ids showing what happened],
  "requirement_ids": [NORMATIVE_RULE ids stating what is required],
  "dependency_ids": [PROJECT_FACT ids for what depends on it, e.g. a milestone],
  "why_this_matters": one sentence naming the requirement and the dependency,
  "categories": [{"code", "dimension", "status"}],
  "proposed_checks": [check codes]
}]}
Category codes: A_SCOPE_CHANGE, B_PRICE_ADJUSTMENT, C_SCHEDULE_TIME (IMPACT),
D_DAMAGES (IMPACT, POTENTIAL only), E_UNEXPECTED_SITE_CONDITIONS (ROOT_CAUSE).
Status: CONFIRMED only when a fact states the impact occurred; else POTENTIAL.
Check codes: """ + ", ".join(sorted(PROPOSABLE_CHECKS)) + """.
Never invent ids. Never state a breach, liability, entitlement or recoverable
damages. If nothing qualifies, return {"candidates": []}."""


def discover_candidate_risks(*, tenant_id: str, matter_id: str) -> list[dict]:
    """Propose, validate, route and store candidate risks for one Matter."""
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.ai_risk_discovery_enabled or not settings.openai_api_key:
        return []
    assertions = [
        a for a in store.assertions.values()
        if a.tenant_id == tenant_id and a.matter_id == matter_id
        and a.evidence_role in {EvidenceRole.project_fact, EvidenceRole.normative_rule}
        and a.assertion_type not in {"project_number", "po_number"}
    ]
    if not assertions:
        return []
    payload = _model_candidates(_evidence_lines(assertions, settings.ai_extraction_max_chars), settings)
    if payload is None:
        return []
    findings = validate_candidates(payload, assertions=assertions, tenant_id=tenant_id, matter_id=matter_id)
    for finding_id in [key for key, value in store.candidate_findings.items() if value["matter_id"] == matter_id and value["tenant_id"] == tenant_id]:
        del store.candidate_findings[finding_id]
    for finding in findings:
        store.candidate_findings[finding["id"]] = finding
    return findings


def validate_candidates(payload, *, assertions, tenant_id: str, matter_id: str) -> list[dict]:
    """Drop everything the evidence cannot support; route the rest."""
    by_id = {a.id: a for a in assertions}
    items = payload.get("candidates") if isinstance(payload, dict) else None
    findings: list[dict] = []
    for index, item in enumerate(items if isinstance(items, list) else []):
        if not isinstance(item, dict):
            continue
        evidence = _ids(item.get("evidence_ids"), by_id, EvidenceRole.project_fact)
        if not evidence:
            logger.info("[risk-discovery] candidate dropped: no valid project-fact evidence")
            continue
        requirements = _ids(item.get("requirement_ids"), by_id, EvidenceRole.normative_rule)
        dependencies = _ids(item.get("dependency_ids"), by_id, EvidenceRole.project_fact)
        # A discovery label is the model's reading, which code cannot verify:
        # it is never more than POTENTIAL.
        tags = merge_tags([
            {**tag, "status": "POTENTIAL" if tag["status"] == "CONFIRMED" else tag["status"]}
            for raw in item.get("categories") or [] if isinstance(raw, dict)
            if (tag := normalize_tag(raw.get("code"), raw.get("dimension"), raw.get("status"), "ai_discovery"))
        ])
        checks = sorted({str(c).upper() for c in item.get("proposed_checks") or [] if str(c).upper() in PROPOSABLE_CHECKS})
        scopes = {assertion_scope(by_id[i]) for i in evidence if assertion_scope(by_id[i])}
        event_key = next(iter(scopes)) if len(scopes) == 1 else None
        finding = {
            "id": f"FINDING-{matter_id}-{index}",
            "tenant_id": tenant_id,
            "matter_id": matter_id,
            "candidate_event": str(item.get("candidate_event") or "Candidate risk")[:200],
            "event_key": event_key,
            "evidence_ids": evidence,
            "requirement_ids": requirements,
            "dependency_ids": dependencies,
            "why_this_matters": str(item.get("why_this_matters") or "")[:400],
            "basis_verified": bool(requirements and dependencies),
            "priority": "STANDARD" if requirements and dependencies else "LOW",
            "categories": tags,
            "proposed_checks": checks,
            "evidence": [_evidence(by_id[i]) for i in [*requirements, *evidence, *dependencies]],
            "prompt_version": PROMPT_VERSION,
            "created_at": datetime.utcnow().isoformat(),
        }
        finding.update(_route(finding, tenant_id=tenant_id, matter_id=matter_id))
        findings.append(finding)
    return findings


def _route(finding: dict, *, tenant_id: str, matter_id: str) -> dict:
    """Route a candidate at check-coverage granularity."""
    proposed = set(finding["proposed_checks"])
    if not proposed:
        return {"status": "UNASSESSED", "issue_ids": [], "covered_checks": [], "uncovered_checks": []}
    assessed: list[str] = []
    rule_covered: list[str] = []
    best_covered: set[str] = set()
    best_uncovered: set[str] = set(proposed)
    for issue in store.issues.values():
        if issue.tenant_id != tenant_id or issue.matter_id != matter_id:
            continue
        if not finding["event_key"] or issue.extra_work_id != finding["event_key"]:
            continue
        if issue.merged_into_event_id:
            continue
        rule = _approved_issue_rule(issue)
        if rule is None:
            continue
        patterns = {pattern.value for req in rule.requirements for pattern in req.patterns}
        overlap = proposed & patterns
        if not overlap:
            continue
        rule_covered.append(issue.id)
        assessment = _current_assessment(issue)
        complete = _assessment_covers_current_evidence(issue, assessment)
        completed = _completed_checks_for_patterns(rule, assessment) if complete else set()
        covered = overlap & completed
        uncovered = proposed - covered
        if len(covered) > len(best_covered):
            best_covered, best_uncovered = covered, uncovered
        if not uncovered:
            assessed.append(issue.id)

    if assessed:
        return {"status": "ASSESSED", "issue_ids": sorted(assessed),
                "covered_checks": sorted(proposed), "uncovered_checks": []}
    if rule_covered:
        return {"status": "RULE_COVERED", "issue_ids": sorted(set(rule_covered)),
                "covered_checks": sorted(best_covered), "uncovered_checks": sorted(best_uncovered)}
    return {"status": "UNASSESSED", "issue_ids": [],
            "covered_checks": [], "uncovered_checks": sorted(proposed)}


def _approved_issue_rule(issue):
    """Return the exact approved rule version referenced by an issue."""
    if len(issue.rule_ids) != 1 or len(issue.rule_version_ids) != 1:
        return None
    rule = store.rule_specs.get((issue.rule_ids[0], issue.rule_version_ids[0]))
    if rule is None or rule.approval_status.value != "APPROVED":
        return None
    return rule


def _current_assessment(issue):
    if not issue.current_assessment_id:
        return None
    assessment = store.assessments.get(issue.current_assessment_id)
    if assessment is None or not assessment.is_current or assessment.issue_id != issue.id:
        return None
    return assessment


def _assessment_covers_current_evidence(issue, assessment) -> bool:
    if assessment is None:
        return False
    if set(assessment.rule_ids) != set(issue.rule_ids):
        return False
    if set(assessment.rule_version_ids) != set(issue.rule_version_ids):
        return False
    # Evidence added to the issue after assessment makes the old result stale.
    return set(issue.evidence_ids).issubset(set(assessment.evidence_ids))


def _completed_checks_for_patterns(rule, assessment) -> set[str]:
    if assessment is None:
        return set()
    checks_by_requirement = {check.requirement_id: check for check in assessment.requirement_checks}
    completed: set[str] = set()
    for requirement in rule.requirements:
        check = checks_by_requirement.get(requirement.id)
        if check is not None and check.analysis_complete:
            completed.update(pattern.value for pattern in requirement.patterns)
    return completed


def _ids(raw, by_id, role) -> list[str]:
    if not isinstance(raw, list):
        return []
    return list(dict.fromkeys(i for i in raw if isinstance(i, str) and i in by_id and by_id[i].evidence_role == role))


def _evidence(assertion) -> dict:
    return {
        "id": assertion.id, "role": assertion.evidence_role.value, "type": assertion.assertion_type,
        "statement": assertion.statement, "source_document_id": assertion.source_document_id,
        "event_date": assertion_event_date(assertion),
    }


def _evidence_lines(assertions, max_chars: int) -> list[str]:
    lines, used = [], 0
    for assertion in sorted(assertions, key=lambda a: assertion_event_date(a) or ""):
        line = (
            f"{assertion.id}: role={assertion.evidence_role.value}; type={assertion.assertion_type}; "
            f"date={assertion_event_date(assertion) or 'unknown'}; event={assertion_scope(assertion) or 'unscoped'}; "
            f"statement={assertion.statement}"
        )
        if used + len(line) + 1 > max_chars:
            break
        lines.append(line)
        used += len(line) + 1
    return lines


def _model_candidates(lines: list[str], settings) -> dict | None:
    try:
        from openai import OpenAI

        response = OpenAI(api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds).chat.completions.create(
            model=settings.openai_model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": "Evidence:\n" + "\n".join(lines)},
            ],
        )
        return json.loads(response.choices[0].message.content or "{}")
    except Exception as error:  # discovery is advisory; never fail the pipeline
        logger.exception("[risk-discovery] model call failed: %s", type(error).__name__)
        return None
