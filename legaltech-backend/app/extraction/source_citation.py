from app.models import Document, ExtractedSignal
from app.services.hashing import stable_text_hash


def attach_source_citation(document: Document, signal: ExtractedSignal) -> ExtractedSignal:
    signal.source_document_id = document.id
    signal.source_text_hash = stable_text_hash(signal.source_text)
    return signal
