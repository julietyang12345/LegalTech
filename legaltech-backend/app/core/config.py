import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel


_BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_BACKEND_ROOT / ".env")


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


class Settings(BaseModel):
    ai_extraction_enabled: bool = _env_bool("AI_EXTRACTION_ENABLED", bool(os.getenv("OPENAI_API_KEY")))
    ai_rule_discovery_enabled: bool = _env_bool("AI_RULE_DISCOVERY_ENABLED", bool(os.getenv("OPENAI_API_KEY")))
    # Experimental: AI proposes candidate risks beyond the approved rules.
    # Off unless explicitly enabled; findings never count as assessed risks.
    ai_risk_discovery_enabled: bool = _env_bool("AI_RISK_DISCOVERY_ENABLED", False)
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    openai_timeout_seconds: int = _env_int("OPENAI_TIMEOUT_SECONDS", 20)
    ai_extraction_max_chars: int = _env_int("AI_EXTRACTION_MAX_CHARS", 12000)
    database_url: str | None = os.getenv("DATABASE_URL") or None
    database_connect_timeout_seconds: int = _env_int("DATABASE_CONNECT_TIMEOUT_SECONDS", 3)


@lru_cache
def get_settings() -> Settings:
    return Settings()
