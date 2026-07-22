from fastapi import FastAPI

from app.api import change_events, documents, matters, reviews, risks

app = FastAPI(title="LegalTech Risk Engine", version="0.1.0")

app.include_router(matters.router, prefix="/api/matters", tags=["matters"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(change_events.router, prefix="/api/change-events", tags=["change-events"])
app.include_router(risks.router, prefix="/api/risks", tags=["risks"])
app.include_router(reviews.router, prefix="/api/reviews", tags=["reviews"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
