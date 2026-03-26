#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR"
IMAGE_NAME="transformhub-backend:latest"
CONTAINER_NAME="transformhub-backend-prod"
ENV_FILE="$BACKEND_DIR/.env.production"
HOST_PORT="${HOST_PORT:-4010}"
CONTAINER_PORT="4010"
HEALTH_URL="http://localhost:${HOST_PORT}/api/v1/transformhub/health"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

require_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    log_error "Missing $ENV_FILE"
    log_info "Create it from $BACKEND_DIR/.env.production.example"
    exit 1
  fi
}

build_image() {
  log_info "Building TransformHub backend image..."
  cd "$BACKEND_DIR"
  docker build -t "$IMAGE_NAME" .
  log_success "Built $IMAGE_NAME"
}

stop_existing() {
  if docker ps -a --format '{{.Names}}' | grep -Fxq "$CONTAINER_NAME"; then
    log_info "Stopping existing container $CONTAINER_NAME..."
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
}

start_container() {
  require_env_file
  log_info "Starting $CONTAINER_NAME on port $HOST_PORT..."
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    --env-file "$ENV_FILE" \
    -p "$HOST_PORT:$CONTAINER_PORT" \
    "$IMAGE_NAME" >/dev/null
  log_success "Container started"
}

show_status() {
  docker ps --filter "name=$CONTAINER_NAME"
}

show_logs() {
  docker logs -f --tail 200 "$CONTAINER_NAME"
}

health_check() {
  log_info "Waiting for health endpoint..."
  for _ in $(seq 1 20); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      log_success "Health check passed: $HEALTH_URL"
      return 0
    fi
    sleep 2
  done

  log_error "Health check failed: $HEALTH_URL"
  docker logs --tail 100 "$CONTAINER_NAME" || true
  exit 1
}

deploy() {
  build_image
  stop_existing
  start_container
  health_check
  show_status
}

case "${1:-deploy}" in
  build)
    build_image
    ;;
  start)
    stop_existing
    start_container
    ;;
  deploy)
    deploy
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  stop)
    stop_existing
    ;;
  help)
    echo "TransformHub backend deploy script"
    echo ""
    echo "Usage: ./deploy.sh <command>"
    echo ""
    echo "Commands:"
    echo "  build    Build the Docker image"
    echo "  start    Start the container from the current image"
    echo "  deploy   Build, replace container, and health-check"
    echo "  status   Show container status"
    echo "  logs     Tail container logs"
    echo "  stop     Stop and remove the container"
    echo ""
    echo "Environment overrides:"
    echo "  HOST_PORT   Host port to bind (default: 4010)"
    ;;
  *)
    log_error "Unknown command: $1"
    exit 1
    ;;
esac
