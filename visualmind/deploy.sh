#!/bin/bash
set -euo pipefail

# ============================================================================
# VisualMind Deployment Script (isolated from FlexForge core deployment)
# ============================================================================
# Usage:
#   ./visualmind/deploy.sh app:full
#   ./visualmind/deploy.sh app:deploy
#   ./visualmind/deploy.sh model:deploy
#   ./visualmind/deploy.sh status
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VM_DIR="$SCRIPT_DIR"
BACKEND_DIR="$VM_DIR/visualmind-backend"
FRONTEND_DIR="$VM_DIR/visualmind-frontend"
DEPLOY_DIR="$VM_DIR/deploy"

# App server config (override with env vars when needed)
APP_SERVER_USER="${APP_SERVER_USER:-j}"
APP_SERVER_HOST="${APP_SERVER_HOST:-10.3.8.169}"
APP_SERVER_PATH="${APP_SERVER_PATH:-/home/j/visualmind}"

# Model server config (can be same or different host)
MODEL_SERVER_USER="${MODEL_SERVER_USER:-j}"
MODEL_SERVER_HOST="${MODEL_SERVER_HOST:-10.3.8.169}"
MODEL_SERVER_PATH="${MODEL_SERVER_PATH:-/home/j/visualmind-model}"

# Deployment identity (keeps docker resources isolated)
APP_PROJECT_NAME="visualmind"
MODEL_PROJECT_NAME="visualmind-model"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

require_file() {
    local file_path="$1"
    local help_text="$2"
    if [ ! -f "$file_path" ]; then
        log_error "Missing file: $file_path"
        log_info "$help_text"
        exit 1
    fi
}

# ============================================================================
# App Deploy (frontend + backend + db)
# ============================================================================
sync_app_code() {
    log_info "Syncing VisualMind app code to remote server..."
    require_file "$BACKEND_DIR/.env" "Create backend env first: cp $BACKEND_DIR/.env.example $BACKEND_DIR/.env"

    ssh "$APP_SERVER_USER@$APP_SERVER_HOST" "mkdir -p '$APP_SERVER_PATH'"

    rsync -az --delete \
      --exclude '.git' \
      --exclude 'node_modules' \
      --exclude 'dist' \
      --exclude '.DS_Store' \
      "$VM_DIR/" "$APP_SERVER_USER@$APP_SERVER_HOST:$APP_SERVER_PATH/"

    log_success "App code synced to $APP_SERVER_USER@$APP_SERVER_HOST:$APP_SERVER_PATH"
}

deploy_app_remote() {
    log_info "Deploying VisualMind app stack remotely..."
    ssh "$APP_SERVER_USER@$APP_SERVER_HOST" << ENDSSH
set -euo pipefail
cd "$APP_SERVER_PATH/deploy"
docker compose -p "$APP_PROJECT_NAME" -f docker-compose.app.yml up -d --build
docker compose -p "$APP_PROJECT_NAME" -f docker-compose.app.yml ps
ENDSSH
    log_success "VisualMind app deployed"
}

app_status() {
    log_info "Fetching VisualMind app status..."
    ssh "$APP_SERVER_USER@$APP_SERVER_HOST" \
      "cd '$APP_SERVER_PATH/deploy' && docker compose -p '$APP_PROJECT_NAME' -f docker-compose.app.yml ps"
}

app_logs() {
    log_info "Streaming VisualMind app logs (Ctrl+C to stop)..."
    ssh "$APP_SERVER_USER@$APP_SERVER_HOST" \
      "cd '$APP_SERVER_PATH/deploy' && docker compose -p '$APP_PROJECT_NAME' -f docker-compose.app.yml logs -f --tail=200"
}

deploy_app_full() {
    sync_app_code
    deploy_app_remote
}

# ============================================================================
# Model Deploy (remote Ollama only)
# ============================================================================
sync_model_code() {
    log_info "Syncing model compose to model server..."
    ssh "$MODEL_SERVER_USER@$MODEL_SERVER_HOST" "mkdir -p '$MODEL_SERVER_PATH'"

    rsync -az \
      "$DEPLOY_DIR/docker-compose.model.yml" \
      "$MODEL_SERVER_USER@$MODEL_SERVER_HOST:$MODEL_SERVER_PATH/docker-compose.model.yml"

    log_success "Model compose synced to $MODEL_SERVER_USER@$MODEL_SERVER_HOST:$MODEL_SERVER_PATH"
}

deploy_model_remote() {
    log_info "Deploying remote model stack..."
    ssh "$MODEL_SERVER_USER@$MODEL_SERVER_HOST" << ENDSSH
set -euo pipefail
cd "$MODEL_SERVER_PATH"
docker compose -p "$MODEL_PROJECT_NAME" -f docker-compose.model.yml up -d
docker compose -p "$MODEL_PROJECT_NAME" -f docker-compose.model.yml ps
ENDSSH
    log_success "Model stack deployed"
}

pull_model() {
    log_info "Pulling model on remote model server..."
    ssh "$MODEL_SERVER_USER@$MODEL_SERVER_HOST" \
      "docker exec visualmind-model ollama pull qwen2.5:7b"
    log_success "Model pull completed"
}

model_status() {
    log_info "Fetching model stack status..."
    ssh "$MODEL_SERVER_USER@$MODEL_SERVER_HOST" \
      "cd '$MODEL_SERVER_PATH' && docker compose -p '$MODEL_PROJECT_NAME' -f docker-compose.model.yml ps"
}

# ============================================================================
# Utility Commands
# ============================================================================
teardown_app() {
    log_warn "Stopping VisualMind app stack on remote server..."
    ssh "$APP_SERVER_USER@$APP_SERVER_HOST" \
      "cd '$APP_SERVER_PATH/deploy' && docker compose -p '$APP_PROJECT_NAME' -f docker-compose.app.yml down"
    log_success "App stack stopped"
}

teardown_model() {
    log_warn "Stopping VisualMind model stack on remote model server..."
    ssh "$MODEL_SERVER_USER@$MODEL_SERVER_HOST" \
      "cd '$MODEL_SERVER_PATH' && docker compose -p '$MODEL_PROJECT_NAME' -f docker-compose.model.yml down"
    log_success "Model stack stopped"
}

show_help() {
    echo "VisualMind Deployment Script"
    echo ""
    echo "Usage: ./visualmind/deploy.sh <command>"
    echo ""
    echo "Commands:"
    echo "  app:sync       Sync visualmind/ code to app server"
    echo "  app:deploy     Deploy app stack (frontend/backend/postgres) on app server"
    echo "  app:full       Sync + deploy app stack"
    echo "  app:status     Show app stack status"
    echo "  app:logs       Stream app stack logs"
    echo ""
    echo "  model:sync     Sync model compose file to model server"
    echo "  model:deploy   Deploy remote model stack (Ollama)"
    echo "  model:pull     Pull qwen2.5:7b on model server"
    echo "  model:status   Show model stack status"
    echo ""
    echo "  status         Show both app + model status"
    echo "  down:app       Stop app stack"
    echo "  down:model     Stop model stack"
    echo "  help           Show this help"
    echo ""
    echo "Isolation guarantees:"
    echo "  - Uses folder:  $APP_SERVER_PATH"
    echo "  - Uses project: $APP_PROJECT_NAME / $MODEL_PROJECT_NAME"
    echo "  - Uses visualmind ports from docker-compose.app.yml (4300/4173/5434)"
    echo ""
    echo "Servers:"
    echo "  - App:   $APP_SERVER_USER@$APP_SERVER_HOST"
    echo "  - Model: $MODEL_SERVER_USER@$MODEL_SERVER_HOST"
}

case "${1:-help}" in
    app:sync)
        sync_app_code
        ;;
    app:deploy)
        deploy_app_remote
        ;;
    app:full)
        deploy_app_full
        ;;
    app:status)
        app_status
        ;;
    app:logs)
        app_logs
        ;;
    model:sync)
        sync_model_code
        ;;
    model:deploy)
        sync_model_code
        deploy_model_remote
        ;;
    model:pull)
        pull_model
        ;;
    model:status)
        model_status
        ;;
    status)
        app_status
        echo ""
        model_status
        ;;
    down:app)
        teardown_app
        ;;
    down:model)
        teardown_model
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
