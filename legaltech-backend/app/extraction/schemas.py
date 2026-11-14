from typing import Any

from pydantic import BaseModel


class SignalCandidate(BaseModel):
    signal_type: str
    value: Any
    actor: str | None = None
    source_text: str
    confidence: float
    polarity: str = "unknown"
    temporal_status: str = "unknown"
    extra_work_id: str | None = None
