import logging
from time import perf_counter

from fastapi import APIRouter

from app.jobs.worker import run_once
from app.models import ProcessingJob
from app.repositories.memory import store

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("")
def list_jobs() -> list[ProcessingJob]:
    return sorted(store.jobs.values(), key=lambda job: job.created_at)


@router.post("/process-next")
def process_next_job() -> dict:
    started = perf_counter()
    logger.info("[detector] process-next requested")
    processed = run_once()
    logger.info("[detector] process-next finished processed=%s duration_ms=%d", processed, (perf_counter() - started) * 1000)
    return {"processed": processed, "jobs": list_jobs()}


@router.post("/process-all")
def process_all_jobs(max_jobs: int = 20) -> dict:
    started = perf_counter()
    logger.info("[detector] process-all started max_jobs=%d queued_jobs=%d", max_jobs, sum(1 for job in store.jobs.values() if job.status.value == "pending"))
    processed_count = 0
    for _ in range(max_jobs):
        if not run_once():
            break
        processed_count += 1
        logger.info("[detector] process-all progress processed=%d remaining_pending=%d", processed_count, sum(1 for job in store.jobs.values() if job.status.value == "pending"))
    logger.info("[detector] process-all finished processed=%d duration_ms=%d", processed_count, (perf_counter() - started) * 1000)
    return {"processed_count": processed_count, "jobs": list_jobs()}
