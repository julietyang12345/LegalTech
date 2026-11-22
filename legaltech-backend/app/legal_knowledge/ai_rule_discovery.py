"""Review-gated AI discovery of possible contract rules.

This module never registers or activates an executable rule. It only records a
candidate for lawyer review, preserving the contract text as provenance.
"""

import json
import logging

from app.core.config import get_settings
from app.domain_contracts.schemas import CaseRuleCandidate, Provenance, ReviewStatus
from app.repositories.memory import store

logger = logging.getLogger(__name__)


def discover_rule_candidates(*, document_id: str, text: str, tenant_id: str, matter_id: str, analysis_run_id: str) -> list[CaseRuleCandidate]:
    settings = get_settings()
    if not settings.ai_rule_discovery_enabled or not settings.openai_api_key or not text.strip():
        return []
    try:
        from openai import OpenAI
        response = OpenAI(api_key=settings.openai_api_key, timeout=settings.openai_timeout_seconds).chat.completions.create(
            model=settings.openai_model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "Identify possible contract rule candidates from the supplied contract text. Return JSON only: {\"candidates\":[{\"title\":str,\"principle\":str,\"facts\":[str],\"limits\":[str],\"triggers\":[str],\"requirements\":[str],\"source_text\":str}]}. Do not state that a rule is legally applicable. Every source_text must be an exact excerpt."},
                {"role": "user", "content": text[:settings.ai_extraction_max_chars]},
            ],
        )
        payload = json.loads(response.choices[0].message.content or "{}")
    except Exception as error:
        logger.warning("AI rule discovery unavailable error_type=%s", type(error).__name__)
        return []

    candidates: list[CaseRuleCandidate] = []
    for item in payload.get("candidates", []) if isinstance(payload, dict) else []:
        if not isinstance(item, dict) or not isinstance(item.get("source_text"), str):
            continue
        source = item["source_text"].strip()
        if not source or source not in text:
            continue
        candidate = CaseRuleCandidate(
            tenant_id=tenant_id,
            matter_id=matter_id,
            case_document_id=document_id,
            title=str(item.get("title") or "Unclassified contract rule candidate"),
            extracted_facts=[str(value) for value in item.get("facts", []) if isinstance(value, str)],
            court_findings=[],
            candidate_principle=str(item.get("principle") or "Potential contract rule requires review."),
            applicability_limits=[str(value) for value in item.get("limits", []) if isinstance(value, str)],
            candidate_triggers=[str(value) for value in item.get("triggers", []) if isinstance(value, str)],
            candidate_requirements=[str(value) for value in item.get("requirements", []) if isinstance(value, str)],
            source_span_ids=[source],
            review_status=ReviewStatus.pending,
            requires_lawyer_review=True,
        )
        store.case_rule_candidates[candidate.id] = candidate
        candidates.append(candidate)
    logger.info("AI rule discovery candidates=%d document_id=%s", len(candidates), document_id)
    return candidates


__all__ = ["discover_rule_candidates"]
