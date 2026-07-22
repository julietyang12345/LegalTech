from time import sleep

from app.jobs.repository import claim_next_job, mark_completed, mark_failed, mark_waiting_for_review
from app.jobs.retry_policy import schedule_retry
from app.services.pipeline import process_document


class TemporaryError(Exception):
    pass


def run_once() -> bool:
    job = claim_next_job()
    if not job:
        return False

    try:
        result = process_document(job.document_id)
        if result == "waiting_for_review":
            mark_waiting_for_review(job)
        else:
            mark_completed(job)
    except TemporaryError as error:
        schedule_retry(job, error)
    except Exception as error:
        mark_failed(job, error)
    return True


def run_forever() -> None:
    while True:
        if not run_once():
            sleep(2)


if __name__ == "__main__":
    run_forever()
