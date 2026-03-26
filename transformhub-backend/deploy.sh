#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR"
IMAGE_NAME="transformhub-backend:latest"
CONTAINER_NAME="transformhub-backend-prod"
ARCHIVE_PATH="/tmp/transformhub-backend.tar.gz"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-$BACKEND_DIR/.env.production}"
SERVER_USER="${SERVER_USER:-j}"
SERVER_HOST="${SERVER_HOST:-10.3.8.169}"
SERVER_PATH="${SERVER_PATH:-/home/j}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-$SERVER_PATH/transformhub-backend}"
REMOTE_ENV_FILE="${REMOTE_ENV_FILE:-$REMOTE_APP_DIR/.env.production}"
REMOTE_HOST_PORT="${REMOTE_HOST_PORT:-4010}"
REMOTE_CONTAINER_PORT="4010"
REMOTE_DB_NETWORK="${REMOTE_DB_NETWORK:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

require_local_env() {
  if [ ! -f "$LOCAL_ENV_FILE" ]; then
    log_error "Missing local env file: $LOCAL_ENV_FILE"
    exit 1
  fi
}

build_image() {
  log_info "Building TransformHub backend image locally..."
  cd "$BACKEND_DIR"
  docker build -t "$IMAGE_NAME" .
  log_success "Built $IMAGE_NAME"
}

package_image() {
  build_image
  log_info "Saving image to $ARCHIVE_PATH..."
  docker save "$IMAGE_NAME" | gzip > "$ARCHIVE_PATH"
  log_success "Saved image archive"
  log_info "Archive size: $(du -h "$ARCHIVE_PATH" | cut -f1)"
}

transfer_artifacts() {
  require_local_env
  if [ ! -f "$ARCHIVE_PATH" ]; then
    package_image
  fi

  log_info "Preparing remote directory $REMOTE_APP_DIR..."
  ssh "$SERVER_USER@$SERVER_HOST" "mkdir -p '$REMOTE_APP_DIR'"

  log_info "Transferring image to $SERVER_USER@$SERVER_HOST..."
  scp "$ARCHIVE_PATH" "$SERVER_USER@$SERVER_HOST:/tmp/transformhub-backend.tar.gz"

  log_info "Uploading env file to $REMOTE_ENV_FILE..."
  scp "$LOCAL_ENV_FILE" "$SERVER_USER@$SERVER_HOST:$REMOTE_ENV_FILE"

  log_success "Transfer complete"
}

remote_deploy() {
  log_info "Deploying TransformHub on remote server..."
  ssh "$SERVER_USER@$SERVER_HOST" \
    "REMOTE_ENV_FILE='$REMOTE_ENV_FILE' IMAGE_NAME='$IMAGE_NAME' CONTAINER_NAME='$CONTAINER_NAME' REMOTE_HOST_PORT='$REMOTE_HOST_PORT' REMOTE_CONTAINER_PORT='$REMOTE_CONTAINER_PORT' REMOTE_DB_NETWORK='$REMOTE_DB_NETWORK' bash -s" <<'ENDSSH'
set -euo pipefail

if [ ! -f "$REMOTE_ENV_FILE" ]; then
  echo "[ERROR] Missing $REMOTE_ENV_FILE"
  exit 1
fi

DB_HOST="$(grep -E '^DB_HOST=' "$REMOTE_ENV_FILE" | tail -n 1 | cut -d '=' -f2-)"
if [ -z "$DB_HOST" ] || [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ] || [ "$DB_HOST" = "::1" ]; then
  echo "[ERROR] DB_HOST in $REMOTE_ENV_FILE cannot be localhost for Docker deploys"
  exit 1
fi

if [ -z "$REMOTE_DB_NETWORK" ] && docker ps -a --format '{{.Names}}' | grep -Fxq "$DB_HOST"; then
  REMOTE_DB_NETWORK="$(docker inspect "$DB_HOST" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{println}}{{end}}' | head -n 1 | tr -d '[:space:]')"
fi

if [ -z "$REMOTE_DB_NETWORK" ]; then
  echo "[ERROR] Could not determine remote Docker network. Set REMOTE_DB_NETWORK explicitly."
  exit 1
fi

cat /tmp/transformhub-backend.tar.gz | docker load >/dev/null

if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

docker run --rm \
  --network "$REMOTE_DB_NETWORK" \
  --env-file "$REMOTE_ENV_FILE" \
  "$IMAGE_NAME" \
  node ./node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network "$REMOTE_DB_NETWORK" \
  --env-file "$REMOTE_ENV_FILE" \
  -p "$REMOTE_HOST_PORT:$REMOTE_CONTAINER_PORT" \
  "$IMAGE_NAME" >/dev/null

for _ in $(seq 1 20); do
  if curl -fsS "http://localhost:${REMOTE_HOST_PORT}/api/v1/transformhub/health" >/dev/null 2>&1; then
    echo "[SUCCESS] Remote health check passed"
    docker ps --filter "name=$CONTAINER_NAME"
    exit 0
  fi
  sleep 2
done

echo "[ERROR] Remote health check failed"
docker logs --tail 100 "$CONTAINER_NAME" || true
exit 1
ENDSSH

  log_success "Remote deployment complete"
}

remove_local() {
  log_info "Removing local TransformHub backend container/image..."
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rmi "$IMAGE_NAME" >/dev/null 2>&1 || true
  rm -f "$ARCHIVE_PATH"
  log_success "Removed local TransformHub backend artifacts"
}

remote_status() {
  ssh "$SERVER_USER@$SERVER_HOST" "docker ps -a --filter name=$CONTAINER_NAME"
}

remote_logs() {
  ssh "$SERVER_USER@$SERVER_HOST" "docker logs --tail 200 $CONTAINER_NAME"
}

full_deploy() {
  package_image
  transfer_artifacts
  remote_deploy
}

case "${1:-deploy}" in
  build)
    build_image
    ;;
  package)
    package_image
    ;;
  transfer)
    transfer_artifacts
    ;;
  deploy)
    full_deploy
    ;;
  status)
    remote_status
    ;;
  logs)
    remote_logs
    ;;
  cleanup-local)
    remove_local
    ;;
  help)
    echo "TransformHub remote deploy script"
    echo ""
    echo "Usage: ./deploy.sh <command>"
    echo ""
    echo "Commands:"
    echo "  build          Build local Docker image"
    echo "  package        Build and export local image tarball"
    echo "  transfer       Copy image tarball and env file to remote server"
    echo "  deploy         Build, transfer, migrate, and run remotely"
    echo "  status         Show remote container status"
    echo "  logs           Show remote container logs"
    echo "  cleanup-local  Remove mistaken local backend container/image"
    echo ""
    echo "Environment overrides:"
    echo "  LOCAL_ENV_FILE      Local env file to upload"
    echo "  SERVER_USER         Remote SSH user"
    echo "  SERVER_HOST         Remote SSH host"
    echo "  SERVER_PATH         Remote base path"
    echo "  REMOTE_APP_DIR      Remote app directory"
    echo "  REMOTE_ENV_FILE     Remote env file path"
    echo "  REMOTE_HOST_PORT    Remote host port (default: 4010)"
    echo "  REMOTE_DB_NETWORK   Remote Docker network for DB access"
    ;;
  *)
    log_error "Unknown command: $1"
    exit 1
    ;;
esac
