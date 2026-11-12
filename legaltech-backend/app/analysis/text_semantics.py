def is_negative_statement(statement: str) -> bool:
    lowered = statement.lower()
    return any(phrase in lowered for phrase in (
        "not approved", "never approved", "no approval", "without approval",
        "not authorize", "not authorized", "scheduling only", "not additional cost",
        "no notice was sent", "no written notice", "notice was not sent", "never sent notice",
    ))
