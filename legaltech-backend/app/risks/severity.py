from app.models.domain import Severity


def severity_for_factor_types(factor_types: list[str]) -> Severity:
    high_risk = {
        "authorization_disputed",
        "missing_signed_change_order",
        "invoice_exceeds_approved_amount",
        "document_consistency_conflict",
    }
    if any(factor_type in high_risk for factor_type in factor_types):
        return Severity.high
    if factor_types:
        return Severity.medium
    return Severity.low
