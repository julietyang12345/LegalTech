from app.models.domain import Severity


def severity_for_factor_types(factor_types: list[str]) -> Severity:
    if "authorization_disputed" in factor_types or "missing_signed_change_order" in factor_types:
        return Severity.high
    if factor_types:
        return Severity.medium
    return Severity.low
