from app.models import HumanReview
from app.repositories.memory import store


def create_match_review(document_id: str, payload: dict) -> HumanReview:
    for review in store.reviews.values():
        if (
            review.review_type == "document_match"
            and review.document_id == document_id
            and review.status == "open"
        ):
            review.payload = payload
            return review

    review = HumanReview(review_type="document_match", document_id=document_id, payload=payload)
    store.reviews[review.id] = review
    return review
