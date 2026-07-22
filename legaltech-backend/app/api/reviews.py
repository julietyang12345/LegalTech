from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel

from app.models import HumanReview, MatchFeedback
from app.repositories.memory import store

router = APIRouter()


class ResolveMatchReviewRequest(BaseModel):
    user_id: str
    selected_project_id: str | None = None
    selected_change_event_id: str | None = None
    features: dict = {}


@router.get("")
def list_reviews(status: str | None = "open") -> list[HumanReview]:
    reviews = list(store.reviews.values())
    if status:
        return [review for review in reviews if review.status == status]
    return reviews


@router.post("/{review_id}/resolve-match")
def resolve_match_review(review_id: str, payload: ResolveMatchReviewRequest) -> dict:
    review = store.reviews[review_id]
    review.status = "resolved"
    review.resolved_at = datetime.utcnow()
    review.project_id = payload.selected_project_id
    review.change_event_id = payload.selected_change_event_id

    feedback = MatchFeedback(
        user_id=payload.user_id,
        document_id=review.document_id or "",
        selected_project_id=payload.selected_project_id,
        selected_change_event_id=payload.selected_change_event_id,
        features=payload.features,
    )
    store.match_feedback[feedback.id] = feedback
    return {"review": review, "feedback": feedback}
