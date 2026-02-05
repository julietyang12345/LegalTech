#!/bin/bash
# FlexForge Backend Deployment Script
# Run this from the flexforge-backend directory

set -e

echo "=== Deploying FlexForge Backend ==="

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo "Error: .env.production file not found!"
    echo "Copy deploy/.env.production.example to .env.production and configure it."
    exit 1
fi

# Load environment variables
export $(cat .env.production | grep -v '^#' | xargs)

# Pull latest changes (if using git)
if [ -d ".git" ]; then
    echo "Pulling latest changes..."
    git pull origin main || git pull origin master || true
fi

# Build and start API container (keep tunnel running)
echo "Building and starting API container..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api

# Ensure tunnel is running
echo "Ensuring tunnel is running..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d cf-tunnel

# Wait for health check
echo "Waiting for application to start..."
sleep 10

# Check health
if curl -s http://localhost:4000/api/v1/health | grep -q "ok"; then
    echo ""
    echo "=== Deployment Successful ==="
    echo "API is running at http://localhost:4000"
    echo "Health check: http://localhost:4000/api/v1/health"
else
    echo ""
    echo "=== Warning: Health check failed ==="
    echo "Check logs with: docker compose -f docker-compose.prod.yml logs -f api"
fi
