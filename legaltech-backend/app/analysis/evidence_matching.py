"""Small deterministic helpers for candidate evidence retrieval."""

from collections.abc import Iterable


def matches_queries(assertion, queries: Iterable[str]) -> bool:
    """Match retrieval text only; this never establishes legal sufficiency."""
    haystack = f"{assertion.assertion_type} {assertion.statement}".casefold()
    return any(query.casefold() in haystack for query in queries if query)
