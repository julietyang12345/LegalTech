from typing import Any

from pydantic import BaseModel


class SignalCandidate(BaseModel):
    signal_type: str
    value: Any
    actor: str | None = None
    source_text: str
    confidence: float
