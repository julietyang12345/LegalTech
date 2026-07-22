from app.ingestion.upload_ingestor import ingest_upload
from app.models.domain import DocumentType


def ingest_email_bytes(
    content: bytes,
    filename: str = "message.eml",
    matter_id: str | None = None,
    gmail_message_id: str | None = None,
    internet_message_id: str | None = None,
):
    return ingest_upload(
        content=content,
        filename=filename,
        document_type=DocumentType.email,
        matter_id=matter_id,
        gmail_message_id=gmail_message_id,
        internet_message_id=internet_message_id,
    )
