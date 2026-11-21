from fastapi import APIRouter, File, Form, UploadFile

from app.ingestion.upload_ingestor import ingest_upload
from app.models import Document
from app.models.domain import DocumentType
from app.repositories.memory import store

router = APIRouter()


@router.get("")
def list_documents() -> list[Document]:
    return list(store.documents.values())


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    matter_id: str | None = Form(default=None),
    document_type: DocumentType = Form(default=DocumentType.unknown),
    sender: str | None = Form(default=None),
    subject: str | None = Form(default=None),
    gmail_message_id: str | None = Form(default=None),
    internet_message_id: str | None = Form(default=None),
    tenant_id: str | None = Form(default=None),
    conversation_id: str | None = Form(default=None),
    in_reply_to: str | None = Form(default=None),
    thread_index: int | None = Form(default=None),
) -> dict:
    document, job = ingest_upload(
        content=await file.read(),
        filename=file.filename or "upload.bin",
        document_type=document_type,
        matter_id=matter_id,
        sender=sender,
        subject=subject,
        gmail_message_id=gmail_message_id,
        internet_message_id=internet_message_id,
        tenant_id=tenant_id,
        conversation_id=conversation_id,
        in_reply_to=in_reply_to,
        thread_index=thread_index,
    )
    return {"document": document, "job": job, "deduplicated": job is None}


@router.get("/{document_id}")
def get_document(document_id: str) -> dict:
    signals = [
        signal for signal in store.signals.values() if signal.source_document_id == document_id
    ]
    events = [event for event in store.events.values() if event.document_id == document_id]
    return {"document": store.documents.get(document_id), "signals": signals, "events": events}
