#!/bin/bash
set -e

# ============================================================================
# FlexForge Deployment Script
# ============================================================================
# Usage:
#   ./deploy.sh all        # Deploy everything
#   ./deploy.sh backend    # Deploy backend only
#   ./deploy.sh worker     # Deploy edge worker only
#   ./deploy.sh frontend   # Deploy frontend only
#   ./deploy.sh migrate    # Run database migrations only
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/flexforge-backend"
WORKER_DIR="$SCRIPT_DIR/flexforge-edge"
FRONTEND_DIR="$SCRIPT_DIR/flexforge-frontend"

# Server configuration
SERVER_USER="j"
SERVER_HOST="10.3.8.169"
SERVER_PATH="/home/j"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================================================
# Backend Deployment - Local Build
# ============================================================================
build_backend() {
    log_info "Building Backend..."
    cd "$BACKEND_DIR"

    # Build TypeScript
    log_info "Compiling TypeScript..."
    npm run build

    # Build Docker image
    log_info "Building Docker image..."
    docker build --no-cache -t flexforge-api:latest .

    # Save to tar for transfer
    log_info "Saving image to /tmp/flexforge-api.tar.gz..."
    docker save flexforge-api:latest | gzip > /tmp/flexforge-api.tar.gz

    log_success "Image saved to /tmp/flexforge-api.tar.gz"
    log_info "Size: $(du -h /tmp/flexforge-api.tar.gz | cut -f1)"
}

# ============================================================================
# Backend Deployment - Transfer to Server
# ============================================================================
transfer_backend() {
    log_info "Transferring image to server..."

    if [ ! -f /tmp/flexforge-api.tar.gz ]; then
        log_error "Image not found. Run './deploy.sh build' first."
        exit 1
    fi

    # Transfer image
    log_info "Copying to $SERVER_USER@$SERVER_HOST..."
    scp /tmp/flexforge-api.tar.gz "$SERVER_USER@$SERVER_HOST:/tmp/"

    log_success "Transfer complete!"
}

# ============================================================================
# Backend Deployment - Deploy on Server (run via SSH)
# ============================================================================
deploy_backend_remote() {
    log_info "Deploying on remote server..."

    ssh "$SERVER_USER@$SERVER_HOST" << 'ENDSSH'
        set -e
        echo "[INFO] Loading Docker image..."
        docker load < /tmp/flexforge-api.tar.gz

        echo "[INFO] Stopping existing container..."
        docker stop flexforge-api-prod 2>/dev/null || true
        docker rm flexforge-api-prod 2>/dev/null || true

        echo "[INFO] Starting containers..."
        cd ~
        docker-compose -f docker-compose.prod.yml up -d

        echo "[SUCCESS] Backend deployed!"
        docker-compose -f docker-compose.prod.yml ps
ENDSSH

    log_success "Remote deployment complete!"
}

# ============================================================================
# Backend Deployment - Full Pipeline (build + transfer + deploy)
# ============================================================================
deploy_backend_full() {
    build_backend
    echo ""
    transfer_backend
    echo ""
    deploy_backend_remote
}

# ============================================================================
# Backend Deployment - Server Deploy
# ============================================================================
deploy_backend() {
    log_info "Deploying Backend on server..."
    cd "$BACKEND_DIR"

    # Check if .env exists
    if [ ! -f .env ]; then
        log_error ".env file not found in $BACKEND_DIR"
        log_info "Copy .env.example to .env and fill in your values"
        exit 1
    fi

    # Check required env vars (use grep instead of source to avoid parsing issues)
    if ! grep -q "^CF_TUNNEL_TOKEN=.\+" .env; then
        log_error "CF_TUNNEL_TOKEN not set in .env"
        exit 1
    fi
    if ! grep -q "^JWT_SECRET=.\+" .env; then
        log_error "JWT_SECRET not set in .env"
        exit 1
    fi

    # Load image if tar exists
    if [ -f /tmp/flexforge-api.tar.gz ]; then
        log_info "Loading Docker image from /tmp/flexforge-api.tar.gz..."
        docker load < /tmp/flexforge-api.tar.gz
    else
        log_warn "No image tar found at /tmp/flexforge-api.tar.gz"
        log_info "Building image locally instead..."
        docker compose -f docker-compose.prod.yml build
    fi

    # Stop existing container
    log_info "Stopping existing containers..."
    docker stop flexforge-api-prod 2>/dev/null || true
    docker rm flexforge-api-prod 2>/dev/null || true

    # Start containers
    log_info "Starting containers..."
    docker compose -f docker-compose.prod.yml up -d

    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 10

    # Check status
    log_success "Backend deployed!"
    docker compose -f docker-compose.prod.yml ps
}

# ============================================================================
# Database Migration (runs on remote server)
# ============================================================================
run_migrations() {
    log_info "Running database migrations on server..."

    # Get list of migration files
    MIGRATIONS=$(ls -1 "$BACKEND_DIR/src/database/migrations/"*.sql 2>/dev/null | sort)

    if [ -z "$MIGRATIONS" ]; then
        log_warn "No migration files found"
        return
    fi

    for migration in $MIGRATIONS; do
        filename=$(basename "$migration")
        log_info "Running migration: $filename"

        # Copy migration to server and run it
        scp "$migration" "$SERVER_USER@$SERVER_HOST:/tmp/$filename"
        ssh "$SERVER_USER@$SERVER_HOST" "docker exec -i flexforge-db-prod psql -U flexforge -d flexforge_prod < /tmp/$filename" || true
    done

    log_success "Migrations completed!"
}

# ============================================================================
# Edge Worker Deployment
# ============================================================================
deploy_worker() {
    log_info "Deploying Edge Worker..."
    cd "$WORKER_DIR"

    # Check if wrangler is installed
    if ! command -v npx &> /dev/null; then
        log_error "npx not found. Install Node.js first."
        exit 1
    fi

    # Install dependencies
    log_info "Installing dependencies..."
    npm install

    # Check if secrets are set (wrangler will prompt if not)
    log_warn "Make sure you have set these secrets with 'npx wrangler secret put <NAME>':"
    echo "  - JWT_SECRET"
    echo "  - CF_ACCESS_CLIENT_ID"
    echo "  - CF_ACCESS_CLIENT_SECRET"
    echo ""
    read -p "Have you set all secrets? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Set secrets first:"
        echo "  cd $WORKER_DIR"
        echo "  npx wrangler secret put JWT_SECRET"
        echo "  npx wrangler secret put CF_ACCESS_CLIENT_ID"
        echo "  npx wrangler secret put CF_ACCESS_CLIENT_SECRET"
        exit 1
    fi

    # Check if KV namespaces exist
    log_info "Checking KV namespaces..."
    if grep -q "REPLACE_WITH" wrangler.toml; then
        log_warn "KV namespace IDs not set in wrangler.toml"
        log_info "Creating KV namespaces..."

        echo "Run these commands and update wrangler.toml with the IDs:"
        echo "  npx wrangler kv namespace create VIDEO_CACHE"
        echo "  npx wrangler kv namespace create TRANSCRIPT_CACHE"
        echo "  npx wrangler kv namespace create DOC_CACHE"
        exit 1
    fi

    # Deploy
    log_info "Deploying to Cloudflare Workers..."
    npx wrangler deploy

    log_success "Edge Worker deployed!"
    log_info "Add custom domain 'api.flexforge.ai' in Cloudflare dashboard"
}

# ============================================================================
# Frontend Deployment
# ============================================================================
deploy_frontend() {
    log_info "Deploying Frontend..."
    cd "$FRONTEND_DIR"

    # Install dependencies
    log_info "Installing dependencies..."
    npm install

    # Build for production
    log_info "Building for production..."
    npm run build:prod

    # Deploy to Cloudflare
    log_info "Deploying to Cloudflare Workers..."
    npx wrangler deploy

    log_success "Frontend deployed!"
    log_info "Add custom domain 'app.flexforge.ai' in Cloudflare dashboard"
}

# ============================================================================
# Set Worker Secrets
# ============================================================================
set_worker_secrets() {
    log_info "Setting worker secrets..."
    cd "$WORKER_DIR"

    # Get JWT_SECRET from backend .env
    if [ -f "$BACKEND_DIR/.env" ]; then
        JWT_SECRET=$(grep "^JWT_SECRET=" "$BACKEND_DIR/.env" | cut -d'=' -f2-)
    fi

    if [ -z "$JWT_SECRET" ]; then
        log_error "JWT_SECRET not found. Set it manually:"
        echo "  npx wrangler secret put JWT_SECRET"
        exit 1
    fi

    echo "Setting JWT_SECRET..."
    echo "$JWT_SECRET" | npx wrangler secret put JWT_SECRET

    echo ""
    log_info "Now set CF Access secrets manually:"
    echo "  npx wrangler secret put CF_ACCESS_CLIENT_ID"
    echo "  npx wrangler secret put CF_ACCESS_CLIENT_SECRET"
}

# ============================================================================
# Deploy All
# ============================================================================
deploy_all() {
    log_info "Starting full deployment..."
    echo ""

    log_info "Step 1/4: Building and deploying backend..."
    deploy_backend_full
    echo ""

    log_info "Step 2/4: Running migrations..."
    run_migrations
    echo ""

    log_info "Step 3/4: Deploying edge worker..."
    deploy_worker
    echo ""

    log_info "Step 4/4: Deploying frontend..."
    deploy_frontend
    echo ""

    log_success "============================================"
    log_success "Full deployment completed!"
    log_success "============================================"
    echo ""
    echo "URLs:"
    echo "  - Frontend: https://app.flexforge.ai"
    echo "  - API:      https://api.flexforge.ai"
    echo "  - Backend:  https://api-backend.flexforge.ai (internal)"
    echo ""
    echo "Next steps:"
    echo "  1. Add custom domains in Cloudflare Workers dashboard"
    echo "  2. Verify tunnel is connected in Zero Trust dashboard"
    echo "  3. Test the endpoints"
}

# ============================================================================
# Show Help
# ============================================================================
show_help() {
    echo "FlexForge Deployment Script"
    echo ""
    echo "Usage: ./deploy.sh <command>"
    echo ""
    echo "Backend Commands:"
    echo "  build         Build backend Docker image locally"
    echo "  transfer      Transfer image to server via scp"
    echo "  backend       Deploy on server (load image + docker-compose up)"
    echo "  backend:full  Full pipeline: build + transfer + deploy"
    echo ""
    echo "Cloudflare Commands:"
    echo "  worker        Deploy edge worker to Cloudflare"
    echo "  frontend      Deploy frontend to Cloudflare"
    echo "  secrets       Set worker secrets"
    echo ""
    echo "Other Commands:"
    echo "  migrate       Run database migrations on server"
    echo "  all           Deploy everything"
    echo "  help          Show this help message"
    echo ""
    echo "Quick deploy:"
    echo "  ./deploy.sh backend:full   # Build, transfer, and deploy backend"
    echo "  ./deploy.sh worker         # Deploy edge worker"
    echo "  ./deploy.sh frontend       # Deploy frontend"
    echo ""
    echo "Server: $SERVER_USER@$SERVER_HOST"
}

# ============================================================================
# Main
# ============================================================================
case "${1:-help}" in
    all)
        deploy_all
        ;;
    build)
        build_backend
        ;;
    transfer)
        transfer_backend
        ;;
    backend)
        deploy_backend_remote
        ;;
    backend:full)
        deploy_backend_full
        ;;
    worker)
        deploy_worker
        ;;
    frontend)
        deploy_frontend
        ;;
    migrate)
        run_migrations
        ;;
    secrets)
        set_worker_secrets
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
