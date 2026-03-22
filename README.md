<h1 align="center">HealOps</h1>

<p align="center">
  <strong>AI-Powered Self-Healing CI/CD Agent</strong>
</p>

<p align="center">
  <em>Detect. Diagnose. Heal. Verify. Ship.</em>
</p>

<p align="center">
  <a href="https://healops.online"><img src="https://img.shields.io/badge/Live-healops.online-00e5ff?style=for-the-badge&logo=vercel&logoColor=white" alt="Live" /></a>
  <a href="https://github.com/charan-happy/healops-automated-self-healing-ci-agent"><img src="https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" /></a>
  <a href="#license"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?style=flat-square&logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/BullMQ-Queue-FF6600?style=flat-square" alt="BullMQ" />
  <img src="https://img.shields.io/badge/Groq-LLM-4B32C3?style=flat-square" alt="Groq" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
</p>

---

## What is HealOps?

HealOps is an **autonomous CI/CD repair agent** that monitors your pipelines, diagnoses failures using LLMs, and opens draft pull requests with validated fixes -- all without human intervention.

When your CI pipeline breaks at 2 AM, HealOps detects the failure via webhook, parses the build logs, classifies the error into one of 26 categories, generates a targeted fix using AI, validates it through 15 deterministic quality gate rules and language-specific compile checks, and opens a draft PR for your team to review -- typically in under 3 minutes.

It is not a chatbot. It is not a code suggestion tool. It is a **fully automated repair pipeline** that runs as a background service, learns from every fix it makes, and gets smarter over time through vector memory (RAG with pgvector).

---

## The Problem

DevOps and engineering teams spend **15-25% of their time** resolving CI/CD failures. The vast majority of these failures fall into predictable, repetitive categories:

- **Syntax errors** and type mismatches
- **Broken imports** and missing modules
- **Dependency conflicts** and version mismatches
- **Test regressions** from refactors
- **Configuration drift** across environments
- **Security vulnerability** alerts blocking deploys

These failures are **algorithmically fixable** but require manual intervention -- a developer gets paged, context-switches, opens the logs, identifies the problem, writes a fix, pushes, waits for CI, and repeats if it fails again. Each incident costs ~$150 in developer time and 30-60 minutes of interrupted flow.

**HealOps eliminates this entire loop.**

---

## How It Works

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         THE HEALOPS REPAIR CYCLE                        │
│                                                                          │
│    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐      │
│    │  DETECT  │────>│ DIAGNOSE │────>│   HEAL   │────>│  VERIFY  │      │
│    └──────────┘     └──────────┘     └──────────┘     └──────────┘      │
│         │                │                │                │             │
│    CI webhook       Parse logs       Generate fix     Quality gate      │
│    received         Classify error   via LLM          15 rules +        │
│    Verify HMAC      Fetch source     RAG memory       compile check     │
│    Enqueue job       context         for past fixes                     │
│                                                            │             │
│                                                     ┌──────┴──────┐     │
│                                                     │             │     │
│                                                  PASS           FAIL    │
│                                                     │             │     │
│                                              ┌──────┴──┐   ┌─────┴──┐  │
│                                              │ Open PR  │   │ Retry  │  │
│                                              │ (draft)  │   │ or     │  │
│                                              └─────────┘   │Escalate│  │
│                                                             └────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Step-by-step pipeline:

1. **Webhook Received** -- GitHub sends a `workflow_run` event when CI fails. HealOps verifies the HMAC-SHA256 signature, normalizes the payload to a provider-agnostic format, and enqueues it via BullMQ.

2. **Guard Chain** (4 safety checks before processing):
   - Loop prevention: skip if branch is `healops/fix/*` (prevent fixing our own fixes)
   - Commit source: skip if the commit was authored by HealOps
   - Cooldown: skip if a recent fix attempt already failed on this branch
   - Budget: skip if the organization's monthly token budget is exhausted

3. **Log Parsing & Error Classification** -- CI logs are downloaded via the GitHub API, cleaned of ANSI codes, and parsed. Errors are classified into 26 categories (TYPE_ERROR, IMPORT_ERROR, SYNTAX_ERROR, DEPENDENCY_VERSION_CONFLICT, etc.). Source files and line numbers are extracted, and actual code is fetched from GitHub at the commit SHA.

4. **RAG Search** -- Before calling the LLM, HealOps searches pgvector for similar past fixes (cosine similarity). High-similarity matches (>0.95) are reused directly without an LLM call. Medium-similarity matches are included as examples in the prompt.

5. **AI Fix Generation** -- The LLM receives a structured 5-layer prompt: role definition, error-type-specific instructions, language context, classification data, and output schema. The fix is returned as structured JSON with diagnosis, strategy, diff, and confidence score.

6. **Quality Gate** -- Every generated fix passes through 15 deterministic rules (no `@ts-ignore`, no `eslint-disable`, no `as any`, no test file modifications unless it is a test error, no dependency changes unless it is a dependency error, compilation must pass, confidence above threshold).

7. **Push & PR** -- If all checks pass, HealOps creates an `agent-fix/{jobId}` branch, commits the fix with attribution, and opens a draft PR. The successful fix pattern is stored in vector memory for future RAG retrieval.

8. **Escalation** -- If 3 attempts fail quality gate, or the error type is marked non-auto-fixable (infrastructure errors, secrets detected, DB migrations), HealOps escalates: marks the job as `escalated`, sends a Slack notification with full diagnostics, and records everything in the audit log.

---

## Architecture

```
                                    ┌────────────────────────────┐
                                    │      GitHub / GitLab /     │
                                    │       Jenkins CI/CD        │
                                    └─────────────┬──────────────┘
                                                  │
                                    workflow_run failure webhook
                                    (HMAC-SHA256 verified)
                                                  │
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NestJS Backend (:4000)                            │
│                                                                             │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐                   │
│  │  CI Webhook   │───>│  BullMQ     │───>│  Repair      │                   │
│  │  Controller   │    │  Queue      │    │  Agent       │                   │
│  │              │    │  (Redis)    │    │  Service     │                   │
│  └──────────────┘    └─────────────┘    └──────┬───────┘                   │
│                                                 │                           │
│                    ┌────────────────────────────┼────────────────────┐      │
│                    │                            │                    │      │
│                    ▼                            ▼                    ▼      │
│         ┌──────────────┐            ┌──────────────┐     ┌──────────────┐  │
│         │  Log Parser  │            │  LLM Engine  │     │  Quality     │  │
│         │  + Classifier│            │  (Groq /     │     │  Gate        │  │
│         │  (26 types)  │            │   Claude /   │     │  (15 rules)  │  │
│         └──────────────┘            │   OpenAI /   │     └──────────────┘  │
│                                     │   Ollama)    │                       │
│                                     └──────────────┘                       │
│                                                                             │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐                   │
│  │  GitHub App  │    │  Vector     │    │  Validator   │                   │
│  │  (Octokit)   │    │  Memory     │    │  (11 langs)  │                   │
│  │  PR Creation │    │  (pgvector) │    │  tsc/go/py.. │                   │
│  └──────────────┘    └─────────────┘    └──────────────┘                   │
│                                                                             │
│  ┌──────────────┐    ┌─────────────┐    ┌──────────────┐                   │
│  │  Dashboard   │    │  Billing    │    │  Slack       │                   │
│  │  API         │    │  (Stripe)   │    │  Notifier    │                   │
│  └──────────────┘    └─────────────┘    └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────────┘
         │                    │                     │
         ▼                    ▼                     ▼
┌──────────────┐    ┌─────────────┐    ┌──────────────────────┐
│ PostgreSQL   │    │   Redis 7   │    │  Observability Stack │
│ 17 + pgvector│    │  (BullMQ +  │    │  Prometheus + Grafana│
│ (Drizzle ORM)│    │   Cache)    │    │  + Jaeger + Loki     │
└──────────────┘    └─────────────┘    └──────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                       Next.js 15 Frontend (:3000)                           │
│                                                                             │
│  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │  Dashboard   │  │ Projects │  │ Branches │  │ Commits  │  │Settings │ │
│  │  Metrics &   │  │ (GitHub  │  │ Explorer │  │ Timeline │  │ CI/SCM/ │ │
│  │  Trends      │  │  Repos)  │  │          │  │ + Diffs  │  │ Billing │ │
│  └──────────────┘  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│                                                                             │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────────┐                    │
│  │  Onboarding  │  │ Repair   │  │  Auth (JWT/OAuth  │                    │
│  │  5-step      │  │ Jobs     │  │  Google/GitHub)   │                    │
│  │  Wizard      │  │ Viewer   │  │  + MFA            │                    │
│  └──────────────┘  └──────────┘  └───────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Features

### GitHub App Integration
Install the HealOps GitHub App on your repositories. It automatically receives CI failure webhooks, accesses your code to understand context, and creates fix branches and draft PRs -- all through GitHub's native App authentication (no PATs needed).

### AI-Powered Issue Detection & Classification
Errors are classified into **26 categories** across **11+ languages**: TYPE_ERROR, IMPORT_ERROR, SYNTAX_ERROR, BUILD_ERROR, DEPENDENCY_VERSION_CONFLICT, MISSING_DEPENDENCY, TEST_FAILURE, SNAPSHOT_MISMATCH, LINT_ERROR, SECURITY_VULNERABILITY, RUNTIME_ERROR, and more. Each category has specialized prompt instructions to maximize fix accuracy.

### Multi-Language Validation
Before any PR is created, fixes are validated with language-specific compilers:

| Language | Validator | Check |
|----------|-----------|-------|
| TypeScript | `tsc --noEmit` | Strict type checking |
| JavaScript | `node --check` | Syntax verification |
| Python | `py_compile` | Bytecode compilation |
| Go | `go build` | Full compilation |
| Java | `javac` | Compilation check |
| Rust | `cargo check` | Borrow checker + types |
| C# | `dotnet build` | .NET compilation |
| Ruby | `ruby -c` | Syntax check |
| PHP | `php -l` | Lint check |
| Kotlin | `kotlinc` | Compilation |
| Swift | `swiftc -parse` | Syntax parsing |

Graceful degradation: if a compiler is not installed, the pre-check is skipped (not failed).

### Auto-Fix PR Creation with Confidence Scores
Every fix includes an LLM confidence score (0.0 to 1.0). Fixes below the configurable threshold (default: 0.55) are rejected. PRs include the diagnosis, fix strategy, confidence level, and error classification in the description.

### Code Review Automation
HealOps provides automated code review capabilities through the Reviews module, analyzing code changes for quality, security, and best practices.

### Repo Health Scoring
Scan repositories for health indicators across five dimensions: security posture, dependency freshness, code quality patterns, configuration correctness, and performance anti-patterns.

### Multi-Provider AI with Fallback Chain
Cascading AI provider support with circuit breaker pattern:
```
Configured Provider --> Claude --> OpenAI --> OpenRouter --> Local LLM (Ollama)
```
If a provider fails 3 consecutive times, it is automatically bypassed for 60 seconds. No single point of failure.

### RAG-Powered Fix Memory
Successful fixes are embedded and stored in pgvector. Similar past fixes (cosine similarity > 0.95) are reused without LLM calls. Medium-similarity fixes are included as examples in the LLM prompt. Reduces token usage and improves fix quality over time.

### Quality Gate (15 Deterministic Rules)
Every AI-generated fix passes through deterministic validation:
- No `@ts-ignore`, `@ts-nocheck`, or `eslint-disable` directives
- No `as any` type assertions
- No `.skip()`, `xit()`, or `xdescribe()` in tests
- No test file modifications (unless it is a test-related error)
- No dependency changes (unless it is a dependency error)
- Language-specific compilation must pass
- Confidence threshold enforcement
- Duplicate fix detection via diff fingerprinting
- Escalation-only error types blocked (ENV_CONFIG, SECRETS, DB_MIGRATION, INFRASTRUCTURE)

### DORA Metrics Tracking
Integration with InfraStream for tracking the four DORA metrics: Deployment Frequency, Lead Time for Changes, Change Failure Rate, and Mean Time to Recovery.

### Organization & Team Management
Multi-tenant architecture with organization-level settings, member management, role-based access control (RBAC), and per-organization token budgets.

### Multi-CI Provider Support
- **GitHub Actions** -- webhook signature verification, `workflow_run` events
- **GitLab CI** -- token verification, pipeline events
- **Jenkins** -- bearer token auth, notification events

### Slack Notifications
Real-time Slack alerts when fixes are ready, when jobs are escalated, or when deployments succeed/fail.

### Guided Onboarding
5-step setup wizard: Organization --> CI Provider --> Repositories --> AI Config --> Review. Per-step backend persistence with resume capability. Real GitHub App repository fetching.

### Grafana Dashboards
Pre-configured Grafana dashboards for production monitoring, including HealOps repair metrics and InfraStream integration dashboards.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Backend** | NestJS 11, TypeScript 5.9 (strict mode) | API server + worker process |
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS v4 | Dashboard SPA |
| **Database** | PostgreSQL 17 + pgvector (Drizzle ORM) | Data persistence + vector search |
| **Queue** | BullMQ + Redis 7 | Job queue for repair pipeline |
| **AI/LLM** | Groq (llama-3.3-70b), Claude, OpenAI, OpenRouter, Ollama | Fix generation + classification |
| **Vector DB** | pgvector (1536-dim HNSW index) | RAG memory for past fixes |
| **CI Integration** | GitHub App (Octokit), GitLab API, Jenkins API | Webhook ingestion + PR creation |
| **Auth** | JWT + OAuth (Google/GitHub) + MFA | Authentication & authorization |
| **Billing** | Stripe (checkout, portal, metered usage) | Subscription management |
| **Notifications** | Slack Webhooks, Email (SMTP), SMS | Alert delivery |
| **Observability** | Prometheus, Grafana 10.4, Jaeger 1.56, Loki | Metrics, dashboards, tracing, logs |
| **Infrastructure** | Oracle Cloud (OCI), Terraform, Nginx | Production hosting |
| **CI/CD** | GitHub Actions | Build, test, deploy pipeline |
| **Monorepo** | Nx 22, pnpm 10 | Workspace management |
| **UI Components** | Radix UI, Lucide Icons, Framer Motion | Design system |

---

## Self-Healing Workflow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   CI FAILS  │───>│  WEBHOOK    │───>│  BULLMQ     │───>│  REPAIR     │
│             │    │  RECEIVED   │    │  ENQUEUED    │    │  AGENT      │
│  GitHub     │    │  HMAC-256   │    │  Guard chain │    │  STARTS     │
│  Actions    │    │  verified   │    │  passes      │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                │
                   ┌────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  PARSE LOGS │───>│  RAG SEARCH │───>│  LLM FIX    │───>│  QUALITY    │
│             │    │             │    │  GENERATION  │    │  GATE       │
│  Classify   │    │  pgvector   │    │  5-layer     │    │  15 rules   │
│  26 types   │    │  similarity │    │  prompt      │    │  + compile  │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                │
                                                         ┌──────┴──────┐
                                                         │             │
                                                      PASSED        FAILED
                                                         │             │
                                                         ▼             ▼
                                                  ┌────────────┐ ┌──────────┐
                                                  │ PUSH BRANCH│ │  RETRY   │
                                                  │ + DRAFT PR │ │ (max 3)  │
                                                  │            │ │ or       │
                                                  │ Store in   │ │ ESCALATE │
                                                  │ RAG memory │ │ + Slack  │
                                                  └────────────┘ └──────────┘
```

---

## Quick Start

### Prerequisites

- Node.js 22+ (managed via fnm)
- pnpm 10+
- Docker Desktop (for PostgreSQL + Redis)
- A GitHub App (for repository integration)

### 1. Clone & Install

```bash
git clone https://github.com/charan-happy/healops-automated-self-healing-ci-agent.git
cd healops-development
pnpm install
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL (with pgvector) + Redis
docker compose up -d postgres redis
```

### 3. Configure Environment

```bash
cp apps/backend/.env.example apps/backend/.env
```

Edit `.env` with your credentials (see [Environment Variables](#environment-variables) below).

### 4. Run Migrations

```bash
cd apps/backend
pnpm db:migrate
pnpm db:seed
```

### 5. Start Development

```bash
# Backend API + Worker (from apps/backend)
pnpm start:dev

# Frontend (from apps/frontend, separate terminal)
pnpm dev
```

### 6. Access Services

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:3000 |
| **Backend API** | http://localhost:4000 |
| **Swagger API Docs** | http://localhost:4000/api/v1 |
| **Bull Board (Queues)** | http://localhost:4000/admin/queues |

### Docker (Full Stack)

```bash
# Run everything with a single command
docker compose up -d

# With observability stack (Prometheus + Grafana + Jaeger)
docker compose --profile observability up -d
```

| Service | URL |
|---------|-----|
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (admin/admin) |
| Jaeger UI | http://localhost:16686 |
| pgAdmin | http://localhost:5050 (dev profile) |

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (with pgvector) |
| `REDIS_URL` | Redis connection URL (or `REDIS_HOST` + `REDIS_PORT` + `REDIS_PASSWORD`) |
| `JWT_SECRET` | JWT signing secret |
| `GITHUB_APP_ID` | GitHub App numeric ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App RSA private key (base64 encoded) |
| `GITHUB_WEBHOOK_SECRET` | HMAC-SHA256 webhook verification secret |

### AI Provider (at least one required)

| Variable | Provider |
|----------|----------|
| `OPENROUTER_API_KEY` | OpenRouter (default: Claude Sonnet via OpenRouter) |
| `ANTHROPIC_API_KEY` | Claude (direct) |
| `OPENAI_API_KEY` | OpenAI GPT-4o |
| *No key needed* | Local LLM via Ollama (`http://localhost:11434`) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENROUTER_MODEL` | `anthropic/claude-sonnet-4-5` | Model to use via OpenRouter |
| `AI_DEFAULT_PROVIDER` | `openrouter` | Primary AI provider |
| `AGENT_MAX_RETRIES` | `3` | Max fix attempts per error |
| `AGENT_MIN_CONFIDENCE` | `0.55` | Min LLM confidence to apply fix |
| `AGENT_TOKEN_BUDGET_PER_JOB` | `100000` | Token limit per repair job |
| `MONTHLY_TOKEN_BUDGET` | `1000000` | Monthly token limit per org |
| `SLACK_WEBHOOK_URL` | -- | Slack incoming webhook URL |
| `SLACK_DEFAULT_CHANNEL` | `#eng-healops` | Default Slack channel |
| `STRIPE_SECRET_KEY` | -- | Stripe billing (optional) |
| `HEALOPS_PUBLIC_URL` | `http://localhost:4000` | Public URL for webhooks |
| `HEALOPS_WEBHOOK_API_KEY` | -- | Internal webhook API key |
| `FRONTEND_URL` | `http://frontend:3000` | Frontend URL for CORS |

---

## API Overview

All API routes are versioned under `/v1/healops/`.

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/healops/webhooks/ci/{provider}` | Receive CI failure webhooks (GitHub/GitLab/Jenkins) |
| `POST` | `/v1/healops/webhooks/github` | GitHub App webhook receiver |
| `GET` | `/v1/healops/dashboard/metrics` | Aggregate repair metrics (MTTR, success rate, cost savings) |
| `GET` | `/v1/healops/dashboard/recent-jobs` | Paginated list of repair jobs |
| `GET` | `/v1/healops/dashboard/trends` | Repair trend data (7d/30d/90d) |
| `GET` | `/v1/healops/dashboard/cost-breakdown` | Per-repo AI cost breakdown |
| `GET` | `/v1/healops/projects` | List connected GitHub repositories |
| `GET` | `/v1/healops/repair-jobs` | List repair job history |
| `GET` | `/v1/healops/reviews` | Code review results |
| `GET` | `/v1/healops/pipeline-status` | Pipeline run status |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/PUT` | `/v1/healops/settings/organization` | Organization settings |
| `GET/POST/DELETE` | `/v1/healops/settings/ci-providers` | CI provider configurations |
| `GET/POST/DELETE` | `/v1/healops/settings/scm-providers` | SCM provider configurations |
| `POST` | `/v1/healops/beta/signup` | Beta waitlist signup |
| `POST` | `/v1/healops/feedback` | User feedback submission |

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/healops/auth/register` | User registration |
| `POST` | `/v1/healops/auth/login` | Email/password login |
| `GET` | `/v1/healops/auth/github` | GitHub OAuth flow |
| `GET` | `/v1/healops/auth/google` | Google OAuth flow |

### Onboarding

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET/POST` | `/v1/healops/onboarding` | 5-step onboarding wizard state |

### Infrastructure

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (version-neutral) |
| `GET` | `/metrics` | Prometheus metrics endpoint |

---

## InfraStream Integration

HealOps integrates with [InfraStream](https://github.com/charan-happy/infrastream) to feed healing events into a centralized DORA metrics pipeline.

```
HealOps Repair Agent                    InfraStream
       │                                     │
       │  repair.completed event             │
       ├────────────────────────────────────>│
       │  {                                  │
       │    repo, error_type,               │
       │    fix_time_ms, confidence,        │  ──> Kafka Topic
       │    pr_url, outcome                 │  ──> PostgreSQL
       │  }                                  │  ──> Grafana Dashboard
       │                                     │
       │  Contributes to DORA metrics:       │
       │  - Mean Time to Recovery (MTTR)     │
       │  - Change Failure Rate              │
       │  - Deployment Frequency             │
       └─────────────────────────────────────┘
```

A pre-built Grafana dashboard (`infrastream-grafana.json`) is included for visualizing InfraStream data alongside HealOps metrics.

---

## Observability Stack

HealOps ships with a full observability stack, activated via Docker Compose profiles:

```bash
docker compose --profile observability up -d
```

### Components

| Service | Port | Purpose |
|---------|------|---------|
| **Prometheus** | 9090 | Metrics scraping (healops backend targets) |
| **Grafana** | 3001 | Dashboards (pre-provisioned HealOps + InfraStream boards) |
| **Jaeger** | 16686 | Distributed tracing (OpenTelemetry via OTLP) |

### Metrics Collected

- `healops_repair_jobs_total` -- total repair jobs by status
- `healops_repair_duration_seconds` -- repair pipeline duration histogram
- `healops_llm_tokens_used_total` -- LLM token consumption by provider
- `healops_quality_gate_pass_rate` -- quality gate pass/fail ratio
- `healops_webhook_received_total` -- inbound webhooks by provider
- HTTP request latency, error rates, and throughput

### Alerting

Pre-configured alert rules in `apps/backend/apm/`:
- `alerts.yml` -- infrastructure alerts
- `healops-alerts.yml` -- HealOps-specific alerts (high failure rate, queue depth, etc.)
- `rules.yml` -- recording rules for efficient dashboard queries

---

## CI/CD Pipeline

HealOps is deployed via GitHub Actions to an Oracle Cloud (OCI) instance.

### Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy-oci.yml` | Push to `main`/`development` | Rsync code + build + PM2 restart |
| `ci.yml` | Pull requests | Lint + type check + tests |
| `build.yml` | On demand | Docker image builds |
| `docker-push.yml` | On demand | Push images to GHCR |
| `db-migrate.yml` | On demand | Run database migrations |
| `security.yml` | Scheduled | Security scanning |
| `rollback.yml` | Manual dispatch | Production rollback |
| `terraform.yml` | Infrastructure changes | Terraform plan/apply |
| `healops-validation.yml` | On demand | Self-validation checks |

### Deploy Flow (`deploy-oci.yml`)

```
Push to main/development
        │
        ▼
  Rsync to OCI server (exclude node_modules, .next, dist, .env, .pem)
        │
        ▼
  SSH: pnpm install --frozen-lockfile (backend + frontend)
        │
        ▼
  SSH: pnpm build (backend + frontend)
        │
        ▼
  SSH: npx tsc-alias (backend path resolution)
        │
        ▼
  SSH: pnpm db:migrate
        │
        ▼
  SSH: pm2 restart healops-backend healops-worker healops-frontend
        │
        ▼
  Health check: curl http://127.0.0.1:4000/health
        │
        ▼
  Slack notification (success/failure)
```

---

## Project Structure

```
healops-development/
├── apps/
│   ├── backend/                        # NestJS API + BullMQ Worker
│   │   ├── src/
│   │   │   ├── main.ts                 # API entrypoint (:4000)
│   │   │   ├── worker.main.ts          # Worker entrypoint (BullMQ processor)
│   │   │   ├── app.module.ts           # Root module (all imports)
│   │   │   ├── worker.module.ts        # Worker module
│   │   │   │
│   │   │   ├── repair-agent/           # Core repair pipeline
│   │   │   │   ├── repair-agent.service.ts      # 7-stage pipeline orchestrator
│   │   │   │   ├── prompts/
│   │   │   │   │   └── error-type-prompts.ts    # Per-error-type LLM instructions
│   │   │   │   └── services/
│   │   │   │       ├── log-parser.service.ts    # CI log parsing & error extraction
│   │   │   │       ├── classifier.service.ts    # Error type classification
│   │   │   │       ├── prompt-builder.service.ts # 5-layer prompt assembly
│   │   │   │       └── quality-gate.service.ts  # 15 deterministic validation rules
│   │   │   │
│   │   │   ├── ai/                     # AI provider abstraction
│   │   │   │   ├── ai.service.ts       # Fallback chain orchestrator
│   │   │   │   ├── circuit-breaker.service.ts   # Provider failover
│   │   │   │   ├── providers/
│   │   │   │   │   ├── claude.provider.ts
│   │   │   │   │   ├── openai.provider.ts
│   │   │   │   │   ├── openrouter.provider.ts
│   │   │   │   │   └── local-llm.provider.ts   # Ollama
│   │   │   │   └── rag/                # RAG retrieval logic
│   │   │   │
│   │   │   ├── github/                 # GitHub API integration
│   │   │   │   ├── github.service.ts   # Octokit wrapper
│   │   │   │   └── services/
│   │   │   │       ├── pull-request.service.ts  # Draft PR creation
│   │   │   │       └── escalation.service.ts    # Issue creation on failure
│   │   │   │
│   │   │   ├── github-webhook/         # GitHub App webhook handler
│   │   │   ├── ci-webhook/             # Multi-provider CI webhook ingestion
│   │   │   │   ├── ci-webhook.controller.ts
│   │   │   │   ├── ci-webhook.service.ts
│   │   │   │   └── error-extractor.service.ts
│   │   │   │
│   │   │   ├── ci-provider/            # CI provider abstraction
│   │   │   │   ├── ci-provider.factory.ts
│   │   │   │   └── providers/
│   │   │   │       ├── github-ci.provider.ts
│   │   │   │       ├── gitlab-ci.provider.ts
│   │   │   │       └── jenkins-ci.provider.ts
│   │   │   │
│   │   │   ├── validator/              # Multi-language compile checks
│   │   │   ├── vector-memory/          # pgvector RAG storage
│   │   │   ├── cost-tracking/          # Per-job token usage tracking
│   │   │   ├── repair-jobs/            # Repair job CRUD
│   │   │   ├── pipeline-status/        # Pipeline run status
│   │   │   ├── reviews/                # Code review automation
│   │   │   ├── projects/               # Connected repo management
│   │   │   │
│   │   │   ├── dashboard/             # Dashboard metrics & trends API
│   │   │   │   ├── dashboard.controller.ts
│   │   │   │   ├── dashboard.service.ts
│   │   │   │   └── dto/               # MetricsQuery, TrendsQuery, CostBreakdown
│   │   │   │
│   │   │   ├── onboarding/            # 5-step setup wizard API
│   │   │   ├── settings/              # Organization & provider settings
│   │   │   │   ├── organization-settings.*
│   │   │   │   ├── ci-provider-settings.*
│   │   │   │   ├── scm-provider-settings.*
│   │   │   │   ├── feedback.controller.ts
│   │   │   │   └── beta-signup.controller.ts
│   │   │   │
│   │   │   ├── auth/                  # JWT + OAuth + MFA + RBAC
│   │   │   │   ├── guards/            # JwtAuthGuard, RolesGuard, PermissionsGuard
│   │   │   │   ├── strategies/        # JWT, Google, GitHub strategies
│   │   │   │   └── decorators/        # @CurrentUser, @Public, @Roles
│   │   │   │
│   │   │   ├── billing/              # Stripe integration
│   │   │   ├── slack/                # Slack webhook notifications
│   │   │   ├── users/                # User management
│   │   │   ├── notifications/        # In-app notifications
│   │   │   ├── email/                # Email service (SMTP)
│   │   │   ├── sms/                  # SMS service
│   │   │   ├── media/                # File uploads
│   │   │   ├── gateway/              # WebSocket gateway
│   │   │   │
│   │   │   ├── db/                   # Database layer
│   │   │   │   ├── schema/           # Drizzle schema (14 schema files)
│   │   │   │   ├── migrations/       # SQL migrations
│   │   │   │   ├── repositories/     # Data access layer
│   │   │   │   └── seeds/            # Database seeding
│   │   │   │
│   │   │   ├── background/           # BullMQ queue definitions
│   │   │   ├── otel/                 # OpenTelemetry instrumentation
│   │   │   ├── redis/                # Redis client module
│   │   │   ├── config/               # Environment config
│   │   │   ├── common/               # Shared utils, audit, route names
│   │   │   ├── logger/               # Structured logging
│   │   │   ├── middlewares/          # Metrics, cookies, dev-tools
│   │   │   └── interceptors/         # Logging, transform, API version
│   │   │
│   │   ├── apm/                      # Observability configs
│   │   │   ├── prometheus.yml.template
│   │   │   ├── grafana.json          # HealOps Grafana dashboard
│   │   │   ├── infrastream-grafana.json # InfraStream dashboard
│   │   │   ├── alerts.yml
│   │   │   ├── healops-alerts.yml
│   │   │   └── rules.yml
│   │   └── test/                     # Backend tests
│   │
│   └── frontend/                     # Next.js 15 Dashboard
│       └── src/
│           ├── app/
│           │   ├── page.tsx           # Landing page
│           │   ├── layout.tsx         # Root layout
│           │   ├── (dashboard)/       # Sidebar layout route group
│           │   │   ├── dashboard/     # Metrics, trends, recent activity
│           │   │   ├── projects/      # GitHub repos browser
│           │   │   ├── branches/      # Branch explorer
│           │   │   ├── commits/       # Commit timeline
│           │   │   ├── fix-details/   # Commit diff viewer
│           │   │   ├── repair-jobs/   # Repair job history
│           │   │   └── settings/      # Settings suite
│           │   │       ├── organization/
│           │   │       ├── ci-providers/
│           │   │       ├── scm-providers/
│           │   │       ├── ai-config/
│           │   │       ├── api-keys/
│           │   │       ├── billing/
│           │   │       └── notifications/
│           │   ├── onboarding/        # 5-step setup wizard
│           │   ├── login/             # Auth pages
│           │   ├── register/
│           │   ├── auth/              # OAuth callbacks
│           │   ├── pricing/           # Pricing page
│           │   ├── _components/       # Shared UI components
│           │   ├── _libs/             # API client, types, context
│           │   └── hooks/             # Custom React hooks
│           └── middleware.ts          # Onboarding redirect guard
│
├── Infrastructure/
│   ├── terraform/                    # AWS Terraform modules
│   ├── terraform-oci/                # Oracle Cloud Terraform
│   └── scripts/                      # Infrastructure automation
│
├── Docker/
│   ├── dockerfile.backend            # Multi-stage backend build
│   └── dockerfile.frontend           # Multi-stage frontend build
│
├── .github/workflows/
│   ├── deploy-oci.yml                # Deploy to OCI via rsync + PM2
│   ├── ci.yml                        # Lint + type check + tests
│   ├── build.yml                     # Docker image builds
│   ├── docker-push.yml               # Push to GHCR
│   ├── db-migrate.yml                # Database migrations
│   ├── security.yml                  # Security scanning
│   ├── rollback.yml                  # Production rollback
│   ├── terraform.yml                 # Infrastructure as Code
│   └── healops-validation.yml        # Self-validation
│
├── docker-compose.yml                # Full stack (dev)
├── docker-compose-prod.yml           # Production compose
├── ecosystem.config.js               # PM2 configuration
├── nx.json                           # Nx monorepo config
├── pnpm-workspace.yaml               # pnpm workspace
├── tsconfig.base.json                # Shared TypeScript config
└── Architecture.md                   # Detailed architecture document
```

---

## Security Model

- **Webhook verification**: HMAC-SHA256 for GitHub, token verification for GitLab/Jenkins
- **No host execution**: Validation runs in temp directories, cleaned up after each check
- **Secret scrubbing**: API keys and tokens are removed from CI logs before LLM processing
- **Loop prevention**: Branch name and commit source checks prevent infinite fix loops
- **Budget enforcement**: Per-job and monthly token limits prevent runaway costs
- **Never auto-merges**: All fixes are opened as draft PRs requiring human review
- **Least privilege**: Write access only to temporary branches, no direct access to `main`
- **Escalation-only types**: Infrastructure errors, secrets, DB migrations are never auto-fixed
- **Rate limiting**: Tiered throttling (30/min, 100/5min, 500/30min, 1000/hr)
- **Audit trail**: Every action logged with actor, entity, and metadata
- **RBAC**: Role-based access with JwtAuthGuard, RolesGuard, PermissionsGuard chain

---

## Performance

| Metric | Without HealOps | With HealOps |
|--------|-----------------|--------------|
| Mean Time to Recovery | 30-60 min | ~3 min |
| Cost per incident | ~$150 (developer time) | ~$0.05 (API tokens) |
| Developer interruption | High (context switch) | None (fully automated) |
| Night/weekend failures | Block releases until Monday | Auto-resolved |
| Fix success rate | -- | 85%+ |
| Quality gate pass rate | -- | 15 deterministic rules |

---

## The Story

HealOps was built by a DevOps engineer who has spent 4 years on the front lines of CI/CD operations -- watching the same types of failures repeat across dozens of repositories, getting paged at 2 AM for a missing semicolon, and spending sprint planning meetings explaining why 20% of team capacity went to "keeping the lights on."

The insight was simple: **most CI failures are not novel problems**. They are pattern-matchable, classifiable, and fixable with the right context. What was missing was an agent that could combine deterministic safety (quality gates, compile checks, budget limits) with AI reasoning (understanding code context, generating targeted patches) -- and do it all autonomously, in the background, without requiring a human in the loop.

HealOps is that agent. It is opinionated about safety (never auto-merge, always create draft PRs, 15 validation rules before any code is pushed) and pragmatic about AI (use it for what it is good at -- understanding context and generating patches -- but verify everything with code, not prompts).

---

## Roadmap

- [ ] **Multi-repository learning** -- cross-repo pattern recognition for organizations
- [ ] **Kubernetes integration** -- detect and heal k8s deployment failures
- [ ] **Custom rule engine** -- user-defined quality gate rules per repo
- [ ] **Webhook replay** -- replay failed webhooks for debugging
- [ ] **PR review bot** -- automated code review comments on all PRs (not just fixes)
- [ ] **Bitbucket support** -- extend CI/SCM adapters to Bitbucket Pipelines
- [ ] **Team analytics** -- per-developer and per-team repair metrics
- [ ] **SOC 2 compliance** -- audit log exports, data retention policies
- [ ] **Self-hosting guide** -- one-click deploy templates for AWS/GCP/Azure
- [ ] **VS Code extension** -- surface HealOps insights in the editor

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/charan-happy">Nagacharan G</a>
</p>

<p align="center">
  <a href="https://healops.online">healops.online</a> · <a href="https://github.com/charan-happy/healops-automated-self-healing-ci-agent">GitHub</a>
</p>
