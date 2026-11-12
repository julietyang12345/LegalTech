from collections.abc import Mapping
from enum import Enum

from app.domain_contracts.schemas import ReviewStatus, WorkflowStatus


class InvalidTransition(ValueError):
    pass


_TRANSITIONS: Mapping[type[Enum], Mapping[Enum, frozenset[Enum]]] = {
    WorkflowStatus: {
        WorkflowStatus.discovered: frozenset({WorkflowStatus.analyzing, WorkflowStatus.closed}),
        WorkflowStatus.analyzing: frozenset({WorkflowStatus.pending_review, WorkflowStatus.closed}),
        WorkflowStatus.pending_review: frozenset({WorkflowStatus.reviewed, WorkflowStatus.analyzing}),
        WorkflowStatus.reviewed: frozenset({WorkflowStatus.closed, WorkflowStatus.analyzing}),
        WorkflowStatus.closed: frozenset(),
    },
    ReviewStatus: {
        ReviewStatus.pending: frozenset({ReviewStatus.approved, ReviewStatus.corrected, ReviewStatus.rejected}),
        ReviewStatus.approved: frozenset(),
        ReviewStatus.corrected: frozenset(),
        ReviewStatus.rejected: frozenset({ReviewStatus.pending}),
    },
    # AssessmentStatus is deliberately not a transition machine: it is a
    # legal conclusion dimension and is replaced by a new assessment version.
}


def transition(current: Enum, target: Enum) -> Enum:
    """Validate a state change; assessment labels are conclusions, not workflow."""
    if type(current) is not type(target):
        raise InvalidTransition("state dimensions cannot be mixed")
    allowed = _TRANSITIONS.get(type(current), {}).get(current, frozenset())
    if target not in allowed:
        raise InvalidTransition(f"cannot transition {current.value} -> {target.value}")
    return target

