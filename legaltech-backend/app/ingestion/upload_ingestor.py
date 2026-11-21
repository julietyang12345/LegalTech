from pathlib import Path

from app.ingestion.deduplication import find_existing_document
from app.models import Document, Event, ProcessingJob
from app.models.domain import DocumentType
from app.repositories.memory import store
from app.services.hashing import sha256_bytes

STORAGE_ROOT = Path("storage/documents")


def ingest_upload(
    content: bytes,
    filename: str,
    document_type: DocumentType = DocumentType.unknown,
    matter_id: str | None = None,
    sender: str | None = None,
    subject: str | None = None,
    gmail_message_id: str | None = None,
    internet_message_id: str | None = None,
    tenant_id: str | None = None,
    conversation_id: str | None = None,
    in_reply_to: str | None = None,
    thread_index: int | None = None,
) -> tuple[Document, ProcessingJob | None]:
    file_hash = sha256_bytes(content)
    existing = find_existing_document(
        file_hash, gmail_message_id, internet_message_id,
        tenant_id=tenant_id, matter_id=matter_id,
    )
    if existing:
        return existing, None

    document = Document(
        document_type=document_type,
        sender=sender,
        subject=subject,
        file_hash=file_hash,
        storage_path="",
        gmail_message_id=gmail_message_id,
        internet_message_id=internet_message_id,
        metadata={
            "original_filename": Path(filename).name,
            "matter_id": matter_id,
            **({"conversation_id": conversation_id} if conversation_id else {}),
            **({"in_reply_to": in_reply_to} if in_reply_to else {}),
            **({"thread_index": thread_index} if thread_index is not None else {}),
        },
        tenant_id=tenant_id,
        matter_id=matter_id,
    )

    document_dir = STORAGE_ROOT / document.id
    document_dir.mkdir(parents=True, exist_ok=True)
    storage_path = document_dir / Path(filename).name
    storage_path.write_bytes(content)
    document.storage_path = str(storage_path)

    store.save_document(document)
    store.save_event(
        Event(
            event_type="document_received",
            matter_id=matter_id,
            document_id=document.id,
            tenant_id=tenant_id,
        )
    )
    job = store.enqueue_job(ProcessingJob(document_id=document.id))
    return document, job
