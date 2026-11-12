from collections.abc import Iterator
from contextlib import contextmanager

from app.core.config import get_settings


@contextmanager
def connection() -> Iterator[object]:
    """Open one PostgreSQL connection for a short operation."""
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")
    try:
        import psycopg
    except ImportError as error:
        raise RuntimeError("psycopg is not installed; install requirements.txt") from error

    with psycopg.connect(
        settings.database_url,
        connect_timeout=settings.database_connect_timeout_seconds,
    ) as conn:
        yield conn


def database_status() -> str:
    settings = get_settings()
    if not settings.database_url:
        return "not_configured"
    try:
        with connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        return "ok"
    except Exception:
        return "unavailable"
