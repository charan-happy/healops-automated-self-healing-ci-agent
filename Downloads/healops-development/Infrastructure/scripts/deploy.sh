#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HealOps — EC2 Deployment Script
# Usage: ./deploy.sh [IMAGE_TAG]
# Example: ./deploy.sh sha-abc1234
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

IMAGE_TAG="${1:-latest}"
APP_DIR="/home/ubuntu/healops"
REGISTRY="ghcr.io"
OWNER="deepanshugoyal10"
BACKEND_IMAGE="${REGISTRY}/${OWNER}/healops-backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${REGISTRY}/${OWNER}/healops-frontend:${IMAGE_TAG}"

echo "Deploying HealOps — Backend: ${BACKEND_IMAGE}, Frontend: ${FRONTEND_IMAGE}"

cd "${APP_DIR}"

# Pull latest images
BACKEND_IMAGE="${BACKEND_IMAGE}" FRONTEND_IMAGE="${FRONTEND_IMAGE}" \
  docker compose -f docker-compose-prod.yml pull backend frontend

# Run DB migrations (idempotent) — uses compiled JS, not ts-node
echo "Running database migrations..."
docker compose -f docker-compose-prod.yml run --rm backend \
  node dist/db/drizzle/migrate.js

# Seed error types (idempotent)
echo "Seeding error types..."
docker compose -f docker-compose-prod.yml run --rm backend \
  node dist/db/seeds/seed-error-types.js

# Rolling restart
BACKEND_IMAGE="${BACKEND_IMAGE}" FRONTEND_IMAGE="${FRONTEND_IMAGE}" \
  docker compose -f docker-compose-prod.yml up -d \
  --no-deps --force-recreate backend worker frontend

# Health check on backend /health endpoint (VERSION_NEUTRAL, no /v1/ prefix)
echo "Waiting for backend to start..."
sleep 20

MAX_RETRIES=5
RETRY=0
until curl -sf http://localhost:4000/health > /dev/null 2>&1; do
  RETRY=$((RETRY + 1))
  if [ "$RETRY" -ge "$MAX_RETRIES" ]; then
    echo "Health check failed after $MAX_RETRIES attempts"
    echo "--- Backend logs ---"
    docker compose -f docker-compose-prod.yml logs --tail=50 backend
    exit 1
  fi
  echo "Health check attempt $RETRY/$MAX_RETRIES failed, retrying in 10s..."
  sleep 10
done

echo "Health check passed"
docker image prune -f
echo "Deployment complete: ${IMAGE_TAG}"
