from app.parsers.base import ParsedContent


def parse_change_order_text(document_id: str, raw_text: str) -> ParsedContent:
    return ParsedContent(document_id=document_id, text=raw_text)
