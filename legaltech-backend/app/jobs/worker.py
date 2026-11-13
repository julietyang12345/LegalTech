import logging
from time import sleep

from app.jobs.repository import claim_next_job, mark_completed, mark_failed, mark_waiting_for_review
from app.jobs.retry_policy import schedule_retry
from app.services.pipeline import process_document

logger = logging.getLogger(__name__)


class TemporaryError(Exception):
    pass


def run_once() -> bool:
    job = claim_next_job()
    if not job:
        logger.info("[detector] queue empty")
        return False

    logger.info("[detector] job started job_id=%s document_id=%s attempt=%s", job.id, job.document_id, job.attempt_count)
    try:
        result = process_document(job.document_id)
        if result == "waiting_for_review":
            mark_waiting_for_review(job)
        else:
            mark_completed(job)
        logger.info("[detector] job finished job_id=%s document_id=%s result=%s status=%s", job.id, job.document_id, result, job.status)
    except TemporaryError as error:
        logger.exception("[detector] temporary job error job_id=%s document_id=%s", job.id, job.document_id)
        schedule_retry(job, error)
    except Exception as error:
        logger.exception("[detector] job failed job_id=%s document_id=%s error=%s", job.id, job.document_id, error)
        mark_failed(job, error)
    return True


def run_forever() -> None:
    while True:
        if not run_once():
            sleep(2)


if __name__ == "__main__":
    run_forever()
