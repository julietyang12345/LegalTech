# VisualMind (Isolated from FlexForge Core)

This folder is intentionally isolated so it can be removed later without touching:
- `flexforge-backend/`
- `flexforge-frontend/`

## Structure

```txt
visualmind/
  visualmind-backend/    # TypeScript API (JWT auth reuse + Postgres + model proxy)
  visualmind-frontend/   # Vite + React app
  deploy/
    docker-compose.app.yml
    docker-compose.model.yml
  docs/
    ARCHITECTURE.md
```

## Quick Start (Local)

1. Copy backend env file:

```bash
cd visualmind/visualmind-backend
cp .env.example .env
```

2. Set `JWT_SECRET` in `.env` to match your existing auth provider.

3. Start app stack:

```bash
cd /home/junni/repos/Startup/flexforge/visualmind/deploy
docker compose -f docker-compose.app.yml up --build
```

4. Start model stack on a remote server:

```bash
docker compose -f docker-compose.model.yml up -d
ollama pull qwen2.5:7b
```

5. In backend `.env`, set:

```env
MODEL_API_BASE_URL=http://<remote-model-server-ip>:11434
```

## Local Frontend + Remote Backend (Dev Token Mode)

When testing from `localhost`, shared auth cookie may not be sent cross-site.
Use bearer token mode instead:

1. Mint a token locally from backend folder:

```bash
cd /home/junni/repos/Startup/flexforge/visualmind/visualmind-backend
npm run token:mint -- <user_id> <email> <role> <expires_in>
```

Example:

```bash
npm run token:mint -- 11111111-1111-1111-1111-111111111111 dev@flexforge.ai member 7d
```

2. Paste token into `Dev Auth Token (Option 1)` box in VisualMind frontend.
3. Click `Apply Token`.

## Delete Later

Delete only this folder:

```bash
rm -rf /home/junni/repos/Startup/flexforge/visualmind
```

## Deploy
1. Deploy app stack (frontend/backend/postgres) to separate folder on server:

  cd /home/junni/repos/Startup/flexforge
  ./visualmind/deploy.sh app:full

2. Deploy model stack (Ollama) on server:

  ./visualmind/deploy.sh model:deploy
  ./visualmind/deploy.sh model:pull

3. Check status:

  ./visualmind/deploy.sh status

4. Tail logs if needed:

  ./visualmind/deploy.sh app:logs
```
