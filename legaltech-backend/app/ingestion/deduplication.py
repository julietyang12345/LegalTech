from app.models import Document
from app.repositories.memory import store


def find_existing_document(
    file_hash: str,
    gmail_message_id: str | None = None,
    internet_message_id: str | None = None,
) -> Document | None:
    return store.find_document_duplicate(
        file_hash=file_hash,
        gmail_message_id=gmail_message_id,
        internet_message_id=internet_message_id,
    )


def document_already_processed(document_id: str, pipeline_version: str) -> bool:
    return (document_id, pipeline_version) in store.processed_documents
