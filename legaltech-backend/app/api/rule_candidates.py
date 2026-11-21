from fastapi import APIRouter

from app.domain_contracts.schemas import CaseRuleCandidate
from app.repositories.memory import store

router = APIRouter()


@router.get("")
def list_rule_candidates(tenant_id: str | None = None, matter_id: str | None = None) -> list[CaseRuleCandidate]:
    candidates = list(store.case_rule_candidates.values())
    if tenant_id:
        candidates = [item for item in candidates if item.tenant_id == tenant_id]
    if matter_id:
        candidates = [item for item in candidates if item.matter_id == matter_id]
    return candidates
