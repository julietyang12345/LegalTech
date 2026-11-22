"""Delete an uploaded document and rebuild its matter's analysis without it.

Facts from one document feed matter-wide results: Extra Work titles and
amounts, issue discovery, cross-document retrieval, assertion change edges and
assessments. Patching those in place would leave conclusions that silently
still depend on the deleted file. Instead the document and everything derived
from it is removed, the matter's derived analysis is cleared, and the remaining
documents are queued to run through the normal pipeline again, so the result
is exactly what uploading only the remaining files would produce.

Assessment history for the matter is cleared with it: earlier assessments
cited evidence that no longer exists.
"""

import logging
from pathlib import Path

from app.models import ProcessingJob
from app.repositories.memory import store

logger = logging.getLogger(__name__)

# Collections whose records are matter-scoped analysis output.
_MATTER_DERIVED = (
    "assertions", "evidence_links", "assertion_links", "issues", "assessments",
    "search_attempts", "rule_activations", "dependency_edges", "extra_works",
    "provenance",
)
_CHANGE_EVENT_DERIVED = ("node_states", "risk_factors", "risk_tickets")


def delete_document(document_id: str) -> dict:
    """Remove the document; return what was requeued. Raises KeyError if absent."""
    document = store.documents.pop(document_id)
    matter_id = document.matter_id or document.metadata.get("matter_id")
    _remove_stored_file(document.storage_path)

    remaining = sorted(
        (doc for doc in store.documents.values()
         if matter_id and (doc.matter_id or doc.metadata.get("matter_id")) == matter_id),
        key=lambda doc: doc.received_at,
    )
    affected_ids = {document_id} | {doc.id for doc in remaining}

    change_event_ids = {
        signal.change_event_id for signal in store.signals.values()
        if signal.source_document_id in affected_ids and signal.change_event_id
    }
    _drop("signals", lambda item: item.source_document_id in affected_ids)
    _drop("jobs", lambda item: item.document_id in affected_ids)
    _drop("reviews", lambda item: item.document_id in affected_ids)
    _drop("match_feedback", lambda item: item.document_id == document_id)
    _drop("events", lambda item: item.document_id == document_id)
    _drop("case_rule_candidates", lambda item: getattr(item, "case_document_id", None) == document_id)
    store.processed_documents.difference_update(
        {entry for entry in store.processed_documents if entry[0] in affected_ids}
    )
    if matter_id:
        for name in _MATTER_DERIVED:
            _drop(name, lambda item: getattr(item, "matter_id", None) == matter_id)
    else:
        _drop("assertions", lambda item: item.source_document_id == document_id)
    for name in _CHANGE_EVENT_DERIVED:
        _drop(name, lambda item: item.change_event_id in change_event_ids)

    requeued = []
    for doc in remaining:
        for key in ("analysis_status", "analysis_reason"):
            doc.metadata.pop(key, None)
        store.enqueue_job(ProcessingJob(document_id=doc.id))
        requeued.append(doc.id)
    logger.info(
        "[documents] deleted document_id=%s matter_id=%s requeued=%d",
        document_id, matter_id, len(requeued),
    )
    return {"deleted_document_id": document_id, "matter_id": matter_id, "requeued_document_ids": requeued}


def _drop(collection: str, predicate) -> None:
    records = getattr(store, collection)
    for key in [key for key, item in records.items() if predicate(item)]:
        del records[key]


def _remove_stored_file(storage_path: str | None) -> None:
    if not storage_path:
        return
    try:
        Path(storage_path).unlink(missing_ok=True)
    except OSError:
        logger.warning("[documents] stored file could not be removed path=%s", storage_path)
