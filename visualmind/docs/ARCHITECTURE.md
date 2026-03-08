# VisualMind Architecture

## Isolation Goal

VisualMind is split into a standalone folder so lifecycle is independent from old product code.

## Runtime Topology

```txt
Browser (visualmind-frontend, Vite)
  -> visualmind-backend (/api/v1/*)
    -> Postgres (vm_projects, vm_generations)
    -> Remote model server (Ollama API)
```

## Auth Reuse Strategy

- VisualMind backend validates JWT using `JWT_SECRET`.
- Token can be read from:
  - HTTP cookie (`access_token`)
  - Authorization header (`Bearer <token>`)
- No old business module is imported; only identity contract is reused.

## Data Ownership

- New tables:
  - `vm_projects`
  - `vm_generations`
- Existing FlexForge tables remain untouched.

## API Surface

- `GET /api/v1/health`
- `GET /api/v1/auth/me`
- `POST /api/v1/vm/projects`
- `GET /api/v1/vm/projects`
- `POST /api/v1/vm/projects/:id/generate`
- `GET /api/v1/vm/projects/:id/tree`
- `POST /api/v1/vm/projects/:id/tree/patch`
- `GET /api/v1/vm/projects/:id/export/mm`

## Security Baseline

- Model endpoint is never called directly from frontend.
- Backend performs input length checks.
- User-owned project checks are applied on every project route.

## Remote Model Deployment

Deploy `deploy/docker-compose.model.yml` on model host.

Recommended network policy:
- Allow `11434` only from app backend server IP.
- Do not expose model endpoint to public internet.
