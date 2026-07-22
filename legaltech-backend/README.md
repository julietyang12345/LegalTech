# LegalTech Backend

FastAPI backend skeleton for immutable legal evidence ingestion, atomic signal
extraction, deterministic decision-tree evaluation, and risk ticket management.

## Local Commands

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
python -m app.jobs.worker
```

The current implementation uses repository interfaces and an in-memory store so
the app structure can run before PostgreSQL migrations are wired in.
