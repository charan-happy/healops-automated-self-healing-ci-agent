#!/bin/bash
# ─── HealOps Pre-Deploy Checklist ────────────────────────────────────────────
# Run this before deploying to production to verify all critical components.
# Usage: bash scripts/pre-deploy-check.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
PASS=0
FAIL=0
WARN=0

check() {
  if eval "$2" > /dev/null 2>&1; then
    echo -e "  ${GREEN}[PASS]${NC} $1"
    ((PASS++))
  else
    echo -e "  ${RED}[FAIL]${NC} $1"
    ((FAIL++))
  fi
}

warn() {
  if eval "$2" > /dev/null 2>&1; then
    echo -e "  ${GREEN}[PASS]${NC} $1"
    ((PASS++))
  else
    echo -e "  ${YELLOW}[WARN]${NC} $1"
    ((WARN++))
  fi
}

echo ""
echo "═══════════════════════════════════════════════════"
echo "  HealOps Pre-Deploy Checklist"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── 1. Build Checks ─────────────────────────────────────────────
echo "1. BUILD CHECKS"
check "Frontend TypeScript compiles" "cd apps/frontend && npx tsc --noEmit"
check "Backend TypeScript compiles" "cd apps/backend && npx tsc --noEmit"
check "Frontend builds successfully" "cd apps/frontend && npx next build"
echo ""

# ─── 2. Docker ────────────────────────────────────────────────────
echo "2. DOCKER"
check "Docker is running" "docker info"
check "Backend Dockerfile exists" "test -f Docker/dockerfile.backend"
check "Frontend Dockerfile exists" "test -f Docker/dockerfile.frontend"
check "docker-compose-prod.yml exists" "test -f docker-compose-prod.yml"
echo ""

# ─── 3. Required Files ───────────────────────────────────────────
echo "3. REQUIRED FILES"
check "GitHub deploy workflow exists" "test -f .github/workflows/deploy.yml"
check "Rollback workflow exists" "test -f .github/workflows/rollback.yml"
check "Backend .env.example exists" "test -f apps/backend/.env.example"
echo ""

# ─── 4. Critical Environment Variables ───────────────────────────
echo "4. ENVIRONMENT VARIABLES (check .env or secrets)"
warn "DATABASE_URL is set" "grep -q 'DATABASE_URL' apps/backend/.env 2>/dev/null"
warn "REDIS_HOST is set" "grep -q 'REDIS_HOST' apps/backend/.env 2>/dev/null"
warn "JWT_SECRET is set" "grep -q 'JWT_SECRET' apps/backend/.env 2>/dev/null"
warn "STRIPE_SECRET_KEY is set" "grep -q 'STRIPE_SECRET_KEY' apps/backend/.env 2>/dev/null"
warn "STRIPE_WEBHOOK_SECRET is set" "grep -q 'STRIPE_WEBHOOK_SECRET' apps/backend/.env 2>/dev/null"
echo ""

# ─── 5. Infrastructure ───────────────────────────────────────────
echo "5. INFRASTRUCTURE"
warn "AWS CLI configured" "aws sts get-caller-identity"
warn "ECR login works" "aws ecr get-login-password --region ap-south-1"
warn "Terraform state exists" "test -d Infrastructure/terraform/.terraform"
echo ""

# ─── Summary ─────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════"
echo -e "  Results: ${GREEN}${PASS} passed${NC}, ${YELLOW}${WARN} warnings${NC}, ${RED}${FAIL} failed${NC}"
echo "═══════════════════════════════════════════════════"
echo ""

if [ $FAIL -gt 0 ]; then
  echo -e "${RED}Deploy blocked: Fix all failures before deploying.${NC}"
  exit 1
elif [ $WARN -gt 0 ]; then
  echo -e "${YELLOW}Deploy possible but check warnings (env vars may be in CI secrets).${NC}"
  exit 0
else
  echo -e "${GREEN}All checks passed. Ready to deploy!${NC}"
  exit 0
fi
