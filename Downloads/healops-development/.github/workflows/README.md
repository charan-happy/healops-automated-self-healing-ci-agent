# GitHub Actions Workflows

This directory contains all CI/CD automation workflows for HealOps.

---

## 📋 Workflows Overview

### Build & Test
- **[build.yml](build.yml)** - Builds backend and frontend, uploads artifacts
- **[ci.yml](ci.yml)** - Full CI pipeline: linting, tests, Docker build validation
- **[security.yml](security.yml)** - Dependency audit, Trivy scan, secret detection

### Deployment
- **[deploy.yml](deploy.yml)** - Build → GHCR → Deploy to EC2
  - **Trigger**: Push to `development`, manual dispatch
  - **Process**: Build images, push to GHCR, deploy to EC2, run migrations, health checks
  - **Services**: Backend API, Worker, Frontend

- **[rollback.yml](rollback.yml)** - Rollback to previous deployment
  - **Trigger**: Manual dispatch only
  - **Required inputs**:
    - `image_tag`: Tag to rollback to (e.g., `sha-abc1234`, `latest`)
    - `services`: Services to rollback (`all`, `backend,worker`, `frontend`)
    - `skip_migrations`: Skip DB migrations for quick rollback
  - **Safety**: Validates image exists before rollback, keeps `.env.previous` backup

### Infrastructure
- **[terraform.yml](terraform.yml)** - Provision AWS infrastructure (EC2, RDS, VPC, etc.)
  - **Trigger**: Changes to `Infrastructure/terraform/**`, manual dispatch
  - **Process**: Plan on PR (posted as comment), auto-apply on push to `development`

### Database
- **[db-migrate.yml](db-migrate.yml)** - Manual database migration runner
  - **Trigger**: Manual dispatch with environment selection (staging/production)
  - **Process**: Runs `pnpm db:migrate` and seeds HealOps error types

### HealOps Validation
- **[healops-validation.yml](healops-validation.yml)** - Validates HealOps-generated PRs
  - **Trigger**: Push to `healops/fix/**` branches
  - **Process**: Type-check, lint, tests, notify HealOps API of results

---

## 🚀 Common Operations

### Deploy to Production
```bash
# Automatic: Push to development branch
git push origin development

# Manual: Trigger from GitHub UI
# Actions tab → Deploy → Run workflow
```

### Rollback Deployment
```bash
# Via GitHub UI (recommended)
# Actions tab → Rollback Deployment → Run workflow
# - image_tag: sha-abc1234  (or latest)
# - services: all
# - skip_migrations: false

# Quick backend-only rollback (skip migrations)
# - image_tag: sha-abc1234
# - services: backend,worker
# - skip_migrations: true
```

### Find Available Tags for Rollback
```bash
# List recent image tags from GHCR
gh api /orgs/deepanshugoyal10/packages/container/healops-backend/versions \
  --jq '.[].metadata.container.tags[]' | head -10

# Check what was previously deployed (after SSH to EC2)
ssh ubuntu@<EC2_HOST>
cd /home/ubuntu/healops
cat .env.previous  # Shows last deployed image tags
```

### Trigger Database Migration
```bash
# Via GitHub UI
# Actions tab → Database Migration → Run workflow
# - environment: production (or staging)
```

---

## 🔐 Required GitHub Secrets

### Infrastructure & Deployment
```bash
EC2_HOST                    # EC2 public IP or DNS
EC2_SSH_KEY                 # SSH private key for ubuntu user
AWS_ACCESS_KEY_ID           # For Terraform & GHCR
AWS_SECRET_ACCESS_KEY       # For Terraform
```

### Application Runtime (Terraform Variables)
```bash
TF_POSTGRES_PASSWORD        # RDS password
TF_REDIS_PASSWORD           # ElastiCache/Redis password
TF_JWT_SECRET               # App JWT secret
GITHUB_APP_ID               # HealOps GitHub App ID
GITHUB_APP_PRIVATE_KEY      # GitHub App private key (base64)
GITHUB_WEBHOOK_SECRET       # Webhook secret
OPENROUTER_API_KEY          # AI model access
SLACK_WEBHOOK_URL           # Slack notifications
HEALOPS_WEBHOOK_API_KEY     # Internal webhook auth
GRAFANA_ADMIN_PASSWORD      # Grafana UI password
NEXTAUTH_SECRET             # Next.js auth secret
```

### Database (for manual migrations)
```bash
DATABASE_URL                # Full PostgreSQL connection string
HEALOPS_PUBLIC_URL          # HealOps API base URL
```

---

## 📊 Workflow Dependencies

```
deploy.yml
  ├─→ build-and-push (GHCR)
  └─→ deploy (EC2)
       ├─→ SCP docker-compose-prod.yml
       ├─→ Pull images
       ├─→ Run migrations
       ├─→ Rolling restart
       └─→ Health checks

rollback.yml
  ├─→ Validate image exists
  ├─→ SCP docker-compose-prod.yml
  └─→ Rollback
       ├─→ Backup current .env → .env.previous
       ├─→ Pull rollback images
       ├─→ Run migrations (unless skipped)
       ├─→ Rolling restart
       └─→ Health checks

terraform.yml
  ├─→ Plan (on PR)
  └─→ Apply (on push to development)
```

---

## 🛡️ Safety Features

### Deploy Workflow
- ✅ Health checks after deployment (backend + frontend)
- ✅ Automatic backup of previous image tags to `.env.previous`
- ✅ Slack notifications on success/failure
- ✅ Database migrations run before app restart

### Rollback Workflow
- ✅ Image existence validation before rollback
- ✅ Option to skip migrations for quick rollback
- ✅ Granular service selection (all, backend only, etc.)
- ✅ Health checks after rollback
- ✅ Slack notifications

### CI Workflow
- ✅ Docker build validation before merge
- ✅ Lint, type-check, and test enforcement
- ✅ Security scans (Trivy, dependency audit, secret scanning)

---

## 📝 Notes

- **Image Tags**: Format is `sha-XXXXXXX` (first 7 chars of commit SHA)
- **Rollback Window**: GHCR retains unlimited versions by default
- **Migration Safety**: Rollback workflow can skip migrations for instant rollback
- **Service Isolation**: Can rollback individual services without affecting others
- **Zero-Downtime**: All deployments use rolling restarts with health checks

---

## 🔗 Related Documentation

- [Infrastructure Setup](../../Infrastructure/terraform/README.md) (if exists)
- [Production Deployment Guide](../../apps/backend/docker-compose-prod.yml)
- [Backend README](../../apps/backend/README.md)
- [Frontend README](../../apps/frontend/README.md)
