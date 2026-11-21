import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import change_events, documents, issues, jobs, matters, reviews, risks, rule_candidates
from app.database.connection import database_status

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

app = FastAPI(title="Evidence Risk Engine", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):[0-9]+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(matters.router, prefix="/api/matters", tags=["matters"])
app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(change_events.router, prefix="/api/change-events", tags=["change-events"])
app.include_router(risks.router, prefix="/api/risks", tags=["risks"])
app.include_router(reviews.router, prefix="/api/reviews", tags=["reviews"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(issues.router, prefix="/api/issues", tags=["issues"])
app.include_router(rule_candidates.router, prefix="/api/rule-candidates", tags=["rule-candidates"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "database": database_status()}
