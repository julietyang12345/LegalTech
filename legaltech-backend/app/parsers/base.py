from pydantic import BaseModel, Field

from app.models import Document


class ParsedContent(BaseModel):
    document_id: str
    text: str
    metadata: dict[str, str] = Field(default_factory=dict)


def parse_document(document: Document) -> ParsedContent:
    path = document.storage_path
    try:
        text = open(path, "rb").read().decode("utf-8", errors="replace")
    except FileNotFoundError:
        text = ""
    return ParsedContent(document_id=document.id, text=text, metadata=document.metadata)
