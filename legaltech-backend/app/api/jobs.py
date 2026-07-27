from fastapi import APIRouter

from app.jobs.worker import run_once
from app.models import ProcessingJob
from app.repositories.memory import store

router = APIRouter()


@router.get("")
def list_jobs() -> list[ProcessingJob]:
    return sorted(store.jobs.values(), key=lambda job: job.created_at)


@router.post("/process-next")
def process_next_job() -> dict:
    processed = run_once()
    return {"processed": processed, "jobs": list_jobs()}


@router.post("/process-all")
def process_all_jobs(max_jobs: int = 20) -> dict:
    processed_count = 0
    for _ in range(max_jobs):
        if not run_once():
            break
        processed_count += 1
    return {"processed_count": processed_count, "jobs": list_jobs()}
