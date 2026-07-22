from app.models import ProcessingJob
from app.models.domain import JobStatus
from app.repositories.memory import store


def claim_next_job() -> ProcessingJob | None:
    return store.claim_next_job()


def mark_completed(job: ProcessingJob) -> None:
    store.mark_job_completed(job)


def mark_waiting_for_review(job: ProcessingJob) -> None:
    job.status = JobStatus.waiting_for_review


def mark_failed(job: ProcessingJob, error: Exception) -> None:
    store.mark_job_failed(job, error)
