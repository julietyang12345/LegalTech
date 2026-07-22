from datetime import datetime, timedelta

from app.models import ProcessingJob
from app.models.domain import JobStatus


def schedule_retry(job: ProcessingJob, error: Exception) -> None:
    job.status = JobStatus.pending
    job.error_message = str(error)
    job.next_attempt_at = datetime.utcnow() + timedelta(seconds=min(60, 2 ** job.attempt_count))
