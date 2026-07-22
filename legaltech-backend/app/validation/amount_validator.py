def amounts_are_consistent(values: list[float]) -> bool:
    return len(set(values)) <= 1
