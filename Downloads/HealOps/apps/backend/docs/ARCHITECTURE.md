# HealOps — Architecture & Workflow Documentation

## Overview

HealOps is an AI-powered CI/CD auto-repair system. When a GitHub Actions workflow fails, HealOps receives a webhook, classifies the error, runs a LangGraph StateGraph agent (calling Claude Sonnet via OpenRouter) to generate a fix, pushes the fix to a `healops/fix/{jobId}` branch, waits for a validation CI run to confirm the fix, then either creates a draft PR or escalates to a GitHub Issue.

**Tech Stack:** NestJS 11, TypeScript 5.9 (maximum strict), Drizzle ORM (SQL-first), PostgreSQL 17 with pgvector, Redis + BullMQ, LangGraph.js, OpenRouter (Claude Sonnet), Octokit (GitHub App), pnpm

---

## End-to-End Workflow

```
Consumer Repo (GitHub Actions workflow fails)
  │
  ├─ 1. GitHub sends workflow_run webhook
  │
  ▼
POST /v1/healops/webhooks/github
  │
  ├─ 2. Verify HMAC-SHA256 signature
  ├─ 3. Idempotent insert → webhook_events (ON CONFLICT DO NOTHING)
  ├─ 4. Filter: only workflow_run + completed + failure
  ├─ 5. Loop prevention: skip if branch starts with healops/fix/
  │
  ▼
RepairJobsService.enqueueRepair()
  │
  ├─ 6.  Pre-flight: cooldown check (job_cooldowns)
  ├─ 7.  Pre-flight: flaky skip (flaky_failure_registry)
  ├─ 8.  Pre-flight: active job dedup (jobs WHERE status IN queued/running)
  ├─ 9.  Create job record (status=queued)
  ├─ 10. Enqueue to BullMQ healops-repair queue
  │
  ▼
RepairJobsProcessor (BullMQ worker)
  │
  ├─ 11. Update job status → running
  │
  ▼
RepairAgentService.runRepair() — LangGraph StateGraph (8 nodes)
  │
  ├─ Node 1: gatherContext
  │   ├─ Fetch failure record from DB
  │   ├─ Fetch affected file contents via GitHub API
  │   ├─ RAG: find similar past fixes (pgvector cosine similarity)
  │   ├─ Parse CI logs (LogParserService)
  │   └─ Classify error type (ClassifierService)
  │
  ├─ Node 2: diagnoseAndFix
  │   ├─ Scrub secrets from all content (SecretScrubber)
  │   ├─ Build structured prompt (PromptBuilderService)
  │   ├─ Call OpenRouter API (Claude Sonnet)
  │   └─ Parse response: {diagnosis, fix_strategy, confidence, can_fix, diff, files_modified}
  │
  ├─ Node 3: qualityGate
  │   ├─ Reject: as any / @ts-ignore
  │   ├─ Reject: empty catch blocks
  │   ├─ Detect: circular fix (same diff hash seen before)
  │   └─ Check: confidence >= AGENT_MIN_CONFIDENCE
  │
  ├─ Node 4: runPreCheck
  │   ├─ Language-aware compilation check (tsc / py_compile / go build)
  │   └─ Record validation (stage=pre_check)
  │
  ├─ Node 5: pushBranch
  │   ├─ Create branch: healops/fix/{jobId}
  │   └─ Push files via Git Data API (blob → tree → commit → updateRef)
  │
  ├─ Node 6: waitForValidation
  │   ├─ GitHub Actions runs healops-validation.yml on fix branch
  │   └─ Callback: POST /v1/healops/webhooks/validation-complete
  │
  ├─ Node 7: createPR (on success)
  │   ├─ Create draft PR via GitHub API (always draft)
  │   ├─ Record in pull_requests table
  │   └─ Slack notification: pr_created
  │
  └─ Node 8: escalate (on failure / retries exhausted)
      ├─ Create escalation record
      ├─ Set 24-hour cooldown
      ├─ Create GitHub Issue with diagnostic context
      └─ Slack notification: escalated

Post-success:
  ├─ Store fix pattern in vector_memory (embedding for future RAG)
  ├─ Record token usage in cost_tracking
  └─ Audit log all state changes
```

---

## Project Structure

```
apps/backend/
├── src/
│   ├── app.module.ts                    # Root module — imports all modules
│   ├── main.ts                          # API entrypoint (HTTP server)
│   ├── worker.main.ts                   # Worker entrypoint (BullMQ processors)
│   │
│   ├── github-webhook/                  # Inbound GitHub webhook ingestion
│   │   ├── github-webhook.module.ts
│   │   ├── github-webhook.controller.ts # POST /v1/healops/webhooks/github
│   │   ├── github-webhook.service.ts    # HMAC verification, idempotent insert, filtering
│   │   └── validation-callback.handler.ts # POST /v1/healops/webhooks/validation-complete
│   │
│   ├── repair-jobs/                     # BullMQ repair queue management
│   │   ├── repair-jobs.module.ts
│   │   ├── repair-jobs.service.ts       # Pre-flight checks, enqueue
│   │   └── repair-jobs.processor.ts     # BullMQ worker — invokes agent
│   │
│   ├── repair-agent/                    # LangGraph state machine (core brain)
│   │   ├── repair-agent.module.ts
│   │   ├── repair-agent.service.ts      # StateGraph orchestrator (8 nodes)
│   │   ├── interfaces/
│   │   │   └── agent-state.interface.ts # AgentState, ClaudeFixOutput, PreviousAttempt
│   │   ├── prompts/
│   │   │   └── error-type-prompts.ts    # Per-error-type prompt templates
│   │   └── services/
│   │       ├── prompt-builder.service.ts # 5-layer structured prompt assembly
│   │       ├── log-parser.service.ts     # CI log extraction and noise filtering
│   │       ├── classifier.service.ts     # Error type pattern matching (26 categories)
│   │       └── quality-gate.service.ts   # 15-rule validation gate
│   │
│   ├── github/                          # Octokit wrapper + PR/escalation
│   │   ├── github.module.ts
│   │   ├── github.service.ts            # getFileContent, createBranch, pushFiles, getWorkflowRunLogs
│   │   ├── providers/
│   │   │   └── github-app.provider.ts   # GitHub App JWT auth + installation token cache (50min)
│   │   └── services/
│   │       ├── pull-request.service.ts   # Draft PR creation (always draft)
│   │       └── escalation.service.ts     # GitHub Issue creation + cooldown
│   │
│   ├── validator/                       # Language-aware pre-check validation
│   │   ├── validator.module.ts
│   │   └── validator.service.ts         # tsc --noEmit / py_compile / go build
│   │
│   ├── slack/                           # Slack notifications with threading
│   │   ├── slack.module.ts
│   │   └── slack.service.ts             # Block Kit messages, thread_ts threading
│   │
│   ├── vector-memory/                   # pgvector RAG for fix pattern retrieval
│   │   ├── vector-memory.module.ts
│   │   └── vector-memory.service.ts     # Store/retrieve fix embeddings (cosine similarity)
│   │
│   ├── cost-tracking/                   # Token budget enforcement
│   │   ├── cost-tracking.module.ts
│   │   └── cost-tracking.service.ts     # Budget checks, usage recording, cooldowns
│   │
│   ├── db/
│   │   ├── db.module.ts                 # Global module — registers all 21 repositories
│   │   ├── db.service.ts                # Drizzle ORM + pg Client connection
│   │   ├── schema/                      # 21 tables across 7 tiers
│   │   │   ├── index.ts                 # Barrel re-export
│   │   │   ├── platform.ts             # Tier 1: organizations, repositories, repository_settings, branches, commits
│   │   │   ├── ingestion.ts            # Tier 2: webhook_events, pipeline_runs, error_types
│   │   │   ├── analysis.ts             # Tier 3: failures, flaky_failure_registry
│   │   │   ├── agent.ts                # Tier 4: jobs, attempts, patches, validations
│   │   │   ├── outputs.ts              # Tier 5: pull_requests, escalations
│   │   │   ├── intelligence.ts         # Tier 6: vector_memory (pgvector 1536-dim)
│   │   │   └── operations.ts           # Tier 7: slack_notifications, healops_audit_logs, cost_tracking, job_cooldowns
│   │   ├── repositories/healops/        # 9 HealOps repository files
│   │   │   ├── platform.repository.ts
│   │   │   ├── webhook-events.repository.ts
│   │   │   ├── failures.repository.ts
│   │   │   ├── jobs.repository.ts
│   │   │   ├── pull-requests.repository.ts
│   │   │   ├── escalations.repository.ts
│   │   │   ├── vector-memory.repository.ts
│   │   │   ├── cost-tracking.repository.ts
│   │   │   └── audit-log.repository.ts
│   │   ├── drizzle/
│   │   │   ├── migrate.ts               # Migration runner
│   │   │   └── migrations/              # 15 SQL migration files (0000-0014)
│   │   └── seeds/
│   │       ├── error-types.ts           # 26 error type definitions (3 tiers)
│   │       └── seed-error-types.ts      # Idempotent seed runner
│   │
│   ├── config/
│   │   └── healops.config.ts            # HealOps configuration namespace
│   │
│   ├── common/
│   │   ├── route-names.ts               # Centralized route name enum
│   │   ├── utils/
│   │   │   ├── hash.ts                  # HMAC-SHA256, error/diff/context hashing
│   │   │   └── secret-scrubber.ts       # Redact secrets before LLM calls
│   │   └── guards/
│   │       ├── webhook-signature.guard.ts
│   │       └── webhook-rate-limit.guard.ts
│   │
│   ├── auth/                            # JWT + OAuth + MFA + API Keys
│   ├── users/                           # User CRUD with RBAC
│   ├── media/                           # File uploads (S3/Cloudinary)
│   ├── email/                           # Templated emails (SMTP/SES)
│   ├── sms/                             # SMS + OTP (Twilio/SNS)
│   ├── notifications/                   # Multi-channel (FCM push, in-app)
│   ├── ai/                              # Claude/OpenAI, RAG pipeline, Agent framework
│   ├── webhooks/                        # Outbound webhooks with HMAC
│   ├── gateway/                         # WebSocket gateway (Socket.IO)
│   ├── background/                      # BullMQ queues + cron jobs
│   │   ├── queue/repair/                # RepairQueueProcessor + RepairQueueModule
│   │   ├── queue/webhook-ingest/        # WebhookIngestQueue — durable webhook event processing
│   │   ├── queue/fix-request/           # Fix Request Queue — async error classification + fix generation
│   │   │   ├── fix-request.controller.ts  # POST /v1/healops/fix-request
│   │   │   ├── fix-request.queue.ts       # BullMQ queue wrapper
│   │   │   ├── fix-request.processor.ts   # BullMQ worker processor
│   │   │   ├── services/fix-agent.service.ts # Orchestration facade → RepairAgentService
│   │   │   └── dto/fix-request.dto.ts     # Request validation DTO
│   │   └── services/
│   │       └── crash-recovery.service.ts # OnApplicationBootstrap — recovers orphaned jobs
│   └── api/                             # Infrastructure endpoints
│       ├── health/                      # Health checks (DB, Redis, memory)
│       ├── metrics/                     # Prometheus metrics
│       ├── tracing/                     # OpenTelemetry distributed tracing
│       └── dev-tools/                   # Developer tools dashboard
│
├── drizzle.config.ts                    # Drizzle Kit configuration
├── docker-compose.yml                   # PostgreSQL (pgvector) + Redis + observability
├── .env.healops.example                 # HealOps environment variables template
└── CLAUDE.md                            # Developer guide for Claude Code
```

---

## Database Schema (21 Tables, 7 Tiers)

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 1: Platform Foundation                                         │
│                                                                     │
│  organizations ──1:N──► repositories ──1:1──► repository_settings   │
│                              │                                      │
│                         ├─1:N──► branches                           │
│                         └─1:N──► commits ◄── branches               │
└─────────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 2: Event Ingestion                                             │
│                                                                     │
│  repositories ──1:N──► webhook_events                               │
│  commits ──1:N──► pipeline_runs ◄── webhook_events                  │
│  error_types (seed table — 26 categories)                           │
└─────────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 3: Failure Analysis                                            │
│                                                                     │
│  pipeline_runs ──1:N──► failures ◄── error_types                    │
│  repositories ──1:N──► flaky_failure_registry                       │
└─────────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 4: Agent Execution                                             │
│                                                                     │
│  failures ──1:N──► jobs ──1:N──► attempts ──1:1──► patches          │
│                                      │                              │
│                                 ├─1:2──► validations (pre_check +   │
│                                 │        runner per attempt)         │
│                                 └── FK ──► pipeline_runs            │
└─────────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 5: Outputs                                                     │
│                                                                     │
│  jobs ──1:1──► pull_requests                                        │
│  jobs ──1:N──► escalations                                          │
└─────────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 6: Intelligence                                                │
│                                                                     │
│  repositories ──1:N──► vector_memory ◄── jobs                       │
│  (pgvector 1536-dim embeddings + HNSW index)                        │
└─────────────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────────────┐
│ TIER 7: Operations                                                  │
│                                                                     │
│  jobs ──1:N──► slack_notifications                                  │
│  healops_audit_logs (entity-based audit trail)                      │
│  organizations ──1:N──► cost_tracking ◄── repositories              │
│  repositories ──1:N──► job_cooldowns ◄── jobs                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Table Details

#### Tier 1: Platform Foundation (`platform.ts`)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `organizations` | id, name, plan, slack_webhook_url, monthly_job_limit, monthly_token_budget | Soft delete via deleted_at |
| `repositories` | id, organization_id (FK), provider, external_repo_id, github_installation_id | UNIQUE(provider, external_repo_id) |
| `repository_settings` | id, repository_id (FK, UNIQUE), max_retries, token_budget_per_job, validation_workflow_file, auto_merge_threshold | 1:1 with repositories |
| `branches` | id, repository_id (FK), name, is_healops_branch, auto_delete_after | UNIQUE(repository_id, name); cleanup index on healops branches |
| `commits` | id, repository_id (FK), branch_id (FK), commit_sha, source | source = 'developer' or 'healops'; UNIQUE(repository_id, commit_sha) |

#### Tier 2: Event Ingestion (`ingestion.ts`)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `webhook_events` | id, repository_id (FK), external_event_id, payload, signature_valid, processed | UNIQUE(external_event_id) — idempotency key |
| `pipeline_runs` | id, commit_id (FK), external_run_id, status, extracted_log_snippet | Max 8k tokens for log snippet |
| `error_types` | id, code (UNIQUE), severity, is_auto_fixable | Seed table — 26 categories |

#### Tier 3: Failure Analysis (`analysis.ts`)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `failures` | id, pipeline_run_id (FK), error_type_id (FK), error_hash, language | UNIQUE(pipeline_run_id, error_hash) |
| `flaky_failure_registry` | id, repository_id (FK), error_hash, distinct_commits, flaky_confirmed | 3+ distinct_commits = flaky confirmed |

#### Tier 4: Agent Execution (`agent.ts`)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `jobs` | id, failure_id (FK), status, confidence, total_tokens_used | Status: queued/running/success/failed/escalated/superseded/flaky_skipped/budget_exceeded/circular_fix_detected |
| `attempts` | id, job_id (FK), attempt_number, analysis_output (JSON), fix_fingerprint | Circular fix detection via fix_fingerprint |
| `patches` | id, attempt_id (FK, UNIQUE), diff_content, has_type_assertions, has_empty_catch | 1:1 with attempts; quality gate flags |
| `validations` | id, attempt_id (FK), stage, build_status, test_status | UNIQUE(attempt_id, stage) — one pre_check + one runner per attempt |

#### Tier 5: Outputs (`outputs.ts`)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `pull_requests` | id, job_id (FK), external_pr_id, source_branch, is_draft | SAFETY: is_draft always true; source_branch = healops/fix/{jobId} |
| `escalations` | id, job_id (FK), escalation_type, reason, resolved_at | Types: max_retries/circular_fix/budget_exceeded/unfixable_type/low_confidence |

#### Tier 6: Intelligence (`intelligence.ts`)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `vector_memory` | id, repository_id (FK), job_id (FK), error_embedding (vector 1536), context_hash, successful_patch | HNSW index for cosine similarity; soft delete |

#### Tier 7: Operations (`operations.ts`)

| Table | Key Columns | Notes |
|-------|-------------|-------|
| `slack_notifications` | id, job_id (FK), type, slack_thread_ts, payload | Thread_ts from first message enables threaded follow-ups |
| `healops_audit_logs` | id, entity_type, entity_id, action, actor_type | Compliance trail for all state changes |
| `cost_tracking` | id, organization_id (FK), repository_id (FK nullable), period_month, total_input_tokens, budget_exhausted | UNIQUE(org, repo, period_month); null repo = org-level aggregate |
| `job_cooldowns` | id, repository_id (FK), branch_name, failure_type, cooldown_until | Prevents re-triggering after escalation (default 24h) |

---

## Module Architecture

### HealOps Modules (9 modules registered in AppModule)

```
AppModule
  │
  ├── GithubWebhookModule        # Webhook ingestion
  │     ├── GithubWebhookController
  │     └── GithubWebhookService
  │
  ├── RepairJobsModule            # Job queue management
  │     ├── RepairJobsService     # Pre-flight checks + enqueue
  │     └── RepairJobsProcessor   # BullMQ worker
  │
  ├── FixRequestApiModule         # Async fix request endpoint (POST /v1/healops/fix-request)
  │     ├── FixRequestController  # HTTP 202 — queues job
  │     └── FixRequestQueue       # BullMQ queue wrapper
  │
  ├── RepairAgentModule           # LangGraph agent (core brain)
  │     ├── RepairAgentService    # StateGraph orchestrator
  │     ├── PromptBuilderService  # 5-layer structured prompt
  │     ├── LogParserService      # CI log parsing
  │     ├── ClassifierService     # Error categorization (26 types)
  │     └── QualityGateService    # 15-rule validation gate
  │
  ├── GithubModule                # GitHub API operations
  │     ├── GithubAppProvider     # JWT auth + token cache
  │     ├── GithubService         # Core Octokit operations
  │     ├── PullRequestService    # Draft PR creation
  │     └── EscalationService     # Issue creation + cooldown
  │
  ├── ValidatorModule             # Pre-check compilation
  │     └── ValidatorService
  │
  ├── SlackModule                 # Notifications
  │     └── SlackService
  │
  ├── VectorMemoryModule          # RAG fix patterns
  │     └── VectorMemoryService
  │
  └── CostTrackingModule          # Budget enforcement
        └── CostTrackingService

WorkerModule (BackgroundModule)
  │
  └── FixRequestQueueModule       # Worker-side processor
        ├── FixRequestProcessor   # BullMQ worker — picks up jobs
        └── FixAgentService       # Orchestration → RepairAgentService
```

### Data Flow Between Modules

```
Path A — GitHub Webhook → Repair Pipeline:

  GithubWebhookModule
          │ dispatches to
          ▼
  RepairJobsModule (BullMQ queue: healops-repair)
          │ invokes
          ▼
  RepairAgentModule
          │ uses
          ├──► GithubModule        (fetch files, push branches, create PRs/issues)
          ├──► ValidatorModule     (pre-check compilation)
          ├──► VectorMemoryModule  (RAG: find similar fixes, store successful fixes)
          ├──► SlackModule         (send notifications)
          └──► CostTrackingModule  (check budget, record usage)

Path B — Fix Request API → Fix Pipeline:

  FixRequestApiModule
          │ queues to
          ▼
  FixRequestQueueModule (BullMQ queue: healops-fix-request)
          │ FixRequestProcessor → FixAgentService
          ▼
  RepairAgentService.repairFromInput()
          │ uses
          └──► VectorMemoryModule  (RAG: search + store)
```

### Repository Layer (Centralized in DBModule)

All 9 HealOps repositories are globally registered via `DBModule`:

| Repository | Tables | Key Methods |
|------------|--------|-------------|
| `PlatformRepository` | organizations, repositories, repository_settings, branches, commits | findRepositoryByProviderAndExternalId, upsertSettings, findExpiredHealopsBranches |
| `WebhookEventsRepository` | webhook_events, pipeline_runs | createWebhookEvent (ON CONFLICT DO NOTHING), markProcessed, createPipelineRun |
| `FailuresRepository` | failures, flaky_failure_registry, error_types | createFailure, isFlakyConfirmed, upsertFlakyRegistry, findErrorTypeByCode |
| `HealopsJobsRepository` | jobs, attempts, patches, validations | createJob, updateJobStatus, hasCircularFix, createValidation |
| `HealopsPullRequestsRepository` | pull_requests | createPullRequest, supersedePullRequest |
| `EscalationsRepository` | escalations | createEscalation, findOpenEscalations, resolveEscalation |
| `VectorMemoryRepository` | vector_memory | createEntry, findSimilar (pgvector cosine), findByContextHash |
| `CostTrackingRepository` | cost_tracking, job_cooldowns | upsertMonthlyCost, isBudgetExhausted, isOnCooldown, createCooldown |
| `HealopsAuditLogRepository` | healops_audit_logs, slack_notifications | createAuditLog, findSlackThreadTs (threading) |

---

## API Endpoints

### HealOps Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/healops/webhooks/github` | Public (HMAC verified) | Receive GitHub workflow_run webhooks |
| POST | `/v1/healops/webhooks/validation-complete` | Bearer token | Receive CI validation callbacks |
| POST | `/v1/healops/fix-request` | Public | Submit error for async AI fix generation (HTTP 202) |

### Existing Boilerplate Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/auth/register` | Public | User registration |
| POST | `/v1/auth/login` | Public | User login |
| POST | `/v1/auth/refresh` | Public | Token refresh |
| POST | `/v1/auth/logout` | JWT | Logout |
| GET | `/v1/auth/google` | Public | Google OAuth |
| GET | `/v1/auth/github` | Public | GitHub OAuth |
| POST | `/v1/auth/mfa/setup` | JWT | Setup TOTP MFA |
| POST | `/v1/auth/mfa/verify` | JWT | Verify TOTP |
| GET/POST | `/v1/users/*` | JWT + RBAC | User CRUD |
| POST | `/v1/media/*` | JWT | File uploads |
| GET/POST | `/v1/notifications/*` | JWT | Push + in-app notifications |
| POST | `/v1/ai/*` | JWT | AI agents + RAG |
| GET/POST | `/v1/webhooks/*` | JWT | Outbound webhooks |

### Infrastructure Endpoints (VERSION_NEUTRAL — no /v1/ prefix)

| Path | Purpose |
|------|---------|
| `/health` | Health checks (DB, Redis, memory, HTTP) |
| `/metrics` | Prometheus metrics |
| `/tracing` | OpenTelemetry traces |
| `/dev-tools` | Developer tools dashboard |
| `/admin/queues` | Bull Board queue management |
| `/api/v1` | Swagger docs (v1) |

---

## Agent Pipeline Details

### LangGraph StateGraph (8 Nodes)

```
                    ┌─────────────┐
                    │gatherContext │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │diagnoseAndFix│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
              ┌─────│ qualityGate  │─────┐
              │     └──────┬──────┘     │
              │ reject     │ pass       │ circular
              │            │            │
       ┌──────▼─────┐ ┌───▼────┐  ┌────▼────┐
       │   retry     │ │runPre  │  │escalate │
       │(attempt < 3)│ │Check   │  │         │
       └──────┬──────┘ └───┬────┘  └─────────┘
              │            │
              │  ┌─────────▼─────────┐
              │  │   pushBranch      │
              │  └─────────┬─────────┘
              │            │
              │  ┌─────────▼─────────┐
              │  │waitForValidation  │
              │  └─────────┬─────────┘
              │            │
              │     ┌──────┴──────┐
              │     │             │
              │  success       failure
              │     │             │
              │ ┌───▼────┐  ┌────▼────┐
              │ │createPR │  │  retry  │
              │ │(draft)  │  │or       │
              │ └─────────┘  │escalate │
              │              └────┬────┘
              └───────────────────┘
```

### Agent State Interface

```typescript
interface AgentState {
  jobId: string;
  failureId: string;
  repositoryId: string;
  attemptNumber: number;

  // Context gathered in Node 1
  errorSnippet: string;
  affectedFile: string;
  language: string;              // ts/js/python/go
  errorTypeCode: string;         // e.g. SYNTAX_ERROR
  fileContents: Record<string, string>;
  ragExamples: string[];         // Similar past fixes from vector_memory
  previousAttempts: PreviousAttempt[];

  // LLM output from Node 2
  claudeOutput: ClaudeFixOutput | null;

  // Patch from Node 3-4
  patchDiff: string | null;
  preCheckResult: PreCheckResult | null;

  // Validation from Node 6
  validationResult: ValidationResult | null;

  // Final decision
  finalStatus: 'success' | 'escalate' | 'retry';
}
```

### Claude Output Schema (Expected JSON)

```json
{
  "diagnosis": "The import path './utils/helper' is missing...",
  "fix_strategy": "Add the missing import statement...",
  "confidence": 0.92,
  "can_fix": true,
  "cannot_fix_reason": "",
  "diff": "--- a/src/app.ts\n+++ b/src/app.ts\n@@ ...",
  "files_modified": ["src/app.ts"]
}
```

### Prompt Structure (PromptBuilderService)

The prompt is assembled in a 5-layer structure:

**System Message (3 layers):**
1. Role definition + absolute constraints (no `as any`, no `@ts-ignore`, no empty catches, unified diff only, `can_fix: false` if uncertain, minimal fix)
2. Language-specific context + error-type-specific guidance (from `prompts/error-type-prompts.ts`)
3. JSON output schema (7 fields)

**User Message (2 layers):**
4. RAG examples — similar past fixes (labelled "adapt, do not copy blindly") + retry history — previous failed attempts with diffs ("do NOT repeat the same fix")
5. Affected file content + related files + CI failure log snippet

---

## Safety Mechanisms

### Loop Prevention
- **Branch check:** Skip any failure on branches starting with `healops/fix/` (checked in GithubWebhookService before processing)
- **Branch tracking:** `branches.is_healops_branch` boolean for database-level identification
- **Commit source:** `commits.source` tracks `developer` vs `healops` origin

### Circular Fix Detection
- `attempts.fix_fingerprint` = SHA-256 of normalized diff
- `HealopsJobsRepository.hasCircularFix(jobId, fingerprint)` checks if same diff was already produced
- If circular: immediately escalate with `circular_fix` type

### Quality Gates
- **No `as any` / `@ts-ignore`:** `patches.has_type_assertions` flag — reject if true
- **No empty catch blocks:** `patches.has_empty_catch` flag — reject if true
- **Confidence threshold:** `AGENT_MIN_CONFIDENCE` (default 0.55) — escalate if below
- **Pre-check validation:** Language-specific compilation check before pushing

### Budget Controls
- **Per-job token budget:** `jobs.token_budget` (default 100,000 tokens)
- **Monthly organization budget:** `cost_tracking.budget_limit_usd` with `budget_exhausted` flag
- **Monthly job limits:** `organizations.monthly_job_limit`
- **Per-repo daily limits:** `repository_settings.max_jobs_per_day`
- **Cooldowns:** `job_cooldowns` prevents re-triggering after escalation (default 24h)

### Secret Protection
- `SecretScrubber` redacts API keys, GitHub tokens, passwords, private keys, Slack tokens before any content enters the LLM
- `attempts.secret_redactions_count` tracks how many secrets were scrubbed per attempt

### Draft PR Safety
- `pull_requests.is_draft` always defaults to `true`
- All AI-generated PRs are created as GitHub draft PRs — cannot be auto-merged

---

## Error Classification (26 Categories, 3 Tiers)

### Tier A — Fully Auto-Fixable (19 types)

| Code | Severity | Description |
|------|----------|-------------|
| `SYNTAX_ERROR` | high | Missing braces, parentheses, or semicolons |
| `IMPORT_ERROR` | high | Missing imports or incorrect module paths |
| `TYPE_ERROR` | high | TypeScript compilation type violations |
| `DTO_INTERFACE_ERROR` | medium | Type mismatches or missing interface properties |
| `EXPORT_ERROR` | medium | Functions or classes not exported from modules |
| `BUILD_CONFIGURATION_ERROR` | high | Framework decorators or configuration errors |
| `TEST_FAILURE` | medium | Incorrect assertions or wrong expected values |
| `MISSING_DEPENDENCY` | high | Package used but not in package.json |
| `DEPENDENCY_VERSION_CONFLICT` | high | Incompatible package peer dependency versions |
| `PACKAGE_JSON_ERROR` | high | Syntax errors or malformed package.json |
| `RUNTIME_ERROR` | high | Unhandled exceptions or runtime crashes |
| `LINT_ERROR` | low | ESLint/Prettier rule violations |
| `TEST_TIMEOUT` | medium | Test execution exceeded time limit |
| `DOCKER_BUILD_ERROR` | high | Dockerfile syntax or build stage failures |
| `CI_YAML_ERROR` | high | GitHub Actions workflow YAML errors |
| `CSS_STYLE_ERROR` | low | CSS/SCSS compilation or PostCSS errors |
| `GRAPHQL_CODEGEN_ERROR` | medium | GraphQL schema or codegen failures |
| `NEXT_BUILD_ERROR` | high | Next.js build errors (SSR, pages, app router) |
| `MONOREPO_CONFIG_ERROR` | medium | Nx/Turborepo workspace configuration errors |

### Tier B — Partially Auto-Fixable (2 types)

| Code | Severity | Description |
|------|----------|-------------|
| `SECURITY_VULNERABILITY` | critical | Known CVE in dependencies (patch version bump) |
| `SNAPSHOT_MISMATCH` | low | Jest snapshot out of date |

### Tier C — Escalation-Only (5 types)

| Code | Severity | Description |
|------|----------|-------------|
| `ENV_CONFIG_ERROR` | high | Missing environment variables or secrets |
| `COVERAGE_THRESHOLD` | medium | Code coverage below required threshold |
| `DATABASE_MIGRATION_ERROR` | critical | Schema migration failures |
| `SECRET_DETECTED` | critical | Secrets committed to repository |
| `INFRASTRUCTURE_ERROR` | critical | Cloud/infra provisioning failures |

---

## Escalation Triggers

| Type | Trigger Condition |
|------|-------------------|
| `max_retries` | All 3 attempts exhausted without a passing validation |
| `circular_fix` | Same diff hash (fix_fingerprint) produced twice |
| `budget_exceeded` | Job token usage exceeds token_budget |
| `unfixable_type` | `error_types.is_auto_fixable = false` |
| `low_confidence` | Claude confidence score below `AGENT_MIN_CONFIDENCE` |

On escalation:
1. Escalation record created in `escalations` table
2. 24-hour cooldown set in `job_cooldowns` (prevents re-triggering for same repo/branch/failure_type)
3. GitHub Issue created with full diagnostic context (all attempted diffs, validation errors, recommended next steps)
4. Slack notification sent (`escalated` type)

---

## Flaky Failure Detection

1. Each failure's `error_hash` (SHA-256 of normalized error text) is tracked in `flaky_failure_registry`
2. On each occurrence: `occurrence_count` and `distinct_commits` are incremented
3. When `distinct_commits >= 3`: `flaky_confirmed = true`
4. Confirmed flaky failures are skipped during pre-flight checks in `RepairJobsService`
5. Optional `suppressed_until` timestamp for temporary suppression

---

## Configuration Reference

### HealOps Config (`src/config/healops.config.ts`)

```
healops.openRouter.apiKey          OPENROUTER_API_KEY
healops.openRouter.baseUrl         OPENROUTER_BASE_URL       (default: https://openrouter.ai/api/v1)
healops.openRouter.model           OPENROUTER_MODEL           (default: anthropic/claude-sonnet-4-5)
healops.openRouter.maxTokens       OPENROUTER_MAX_TOKENS      (default: 4096)
healops.openRouter.temperature     OPENROUTER_TEMPERATURE     (default: 0.1)

healops.github.appId               GITHUB_APP_ID
healops.github.privateKey          GITHUB_APP_PRIVATE_KEY     (\\n → \n conversion)
healops.github.webhookSecret       GITHUB_WEBHOOK_SECRET

healops.slack.webhookUrl           SLACK_WEBHOOK_URL
healops.slack.defaultChannel       SLACK_DEFAULT_CHANNEL      (default: #eng-healops)

healops.api.publicUrl              HEALOPS_PUBLIC_URL
healops.api.webhookApiKey          HEALOPS_WEBHOOK_API_KEY

healops.agent.maxRetries           AGENT_MAX_RETRIES          (default: 3)
healops.agent.minConfidence        AGENT_MIN_CONFIDENCE       (default: 0.55)
healops.agent.tokenBudgetPerJob    AGENT_TOKEN_BUDGET_PER_JOB (default: 100000)
healops.agent.maxLogSnippetTokens  AGENT_MAX_LOG_SNIPPET_TOKENS (default: 8000)

healops.cost.monthlyTokenBudget    MONTHLY_TOKEN_BUDGET       (default: 1000000)
healops.cost.monthlyJobLimit       MONTHLY_JOB_LIMIT          (default: 500)
healops.cost.inputPricePerToken    COST_INPUT_PRICE_PER_TOKEN (default: 0.000003)
healops.cost.outputPricePerToken   COST_OUTPUT_PRICE_PER_TOKEN (default: 0.000015)
```

---

## Infrastructure

### Docker Compose Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| postgres-db | `pgvector/pgvector:pg17` | 5433 | PostgreSQL with pgvector extension |
| redis | `redis:latest` | 6379 | BullMQ job queue + cache (AOF persistence) |
| prometheus | `prom/prometheus:latest` | 9090 | Metrics scraping |
| grafana | `grafana/grafana:latest` | 3001 | Dashboards |
| jaeger | `jaegertracing/all-in-one:latest` | 16686 (UI), 4318 (OTLP) | Distributed tracing |
| loki | `grafana/loki:2.7.0` | 3100 | Log aggregation |
| promtail | `grafana/promtail:latest` | 9080 | Log shipping |
| node-exporter | `prom/node-exporter:latest` | 9100 | Host metrics |
| prometheus-push-gateway | `prom/pushgateway:latest` | 9091 | Push metrics |

### Database Migrations

15 migration files (0000-0014) applied via `pnpm db:migrate`:

| Migration | Tables Created |
|-----------|---------------|
| 0000-0013 | Boilerplate (users, roles, permissions, auth, media, notifications, documents, conversations, webhooks) |
| **0014_healops_tables** | **All 21 HealOps tables + pgvector extension + HNSW index** |

### Key Scripts

```bash
pnpm start:dev          # Start API + Worker (development)
pnpm type-check         # TypeScript strict check
pnpm db:migrate         # Apply all SQL migrations
pnpm db:seed:healops    # Seed 26 error types (idempotent)
pnpm db:studio          # Open Drizzle Studio (https://local.drizzle.studio)
pnpm local:up           # Full local setup: docker + migrate + start
```

---

## Global Guard Stack

Request processing order:

```
Request → ThrottlerGuard → JwtAuthGuard → RolesGuard → PermissionsGuard → Controller
```

- `@Public()` — bypasses JwtAuthGuard (used by webhook endpoints, health, metrics)
- `@Roles('admin')` — OR logic (any role matches)
- `@Permissions('users:read')` — AND logic (all required)
- `@ApiKeyAuth()` — for API key authenticated routes

---

## Hashing Functions (`src/common/utils/hash.ts`)

| Function | Input | Output | Used For |
|----------|-------|--------|----------|
| `hashError(text)` | Error text | SHA-256 | `failures.error_hash`, flaky dedup |
| `hashDiff(diff)` | Diff content | SHA-256 | `attempts.fix_fingerprint`, circular fix detection |
| `hashContext(error, lang, type)` | Error+lang+type | SHA-256 | `vector_memory.context_hash`, embedding dedup |
| `computeHmacSha256(payload, secret)` | Payload + secret | `sha256=HMAC` | GitHub webhook signature verification |
| `verifySignature(computed, received)` | Two signatures | boolean | Timing-safe comparison (prevents timing attacks) |

Normalization strips: timestamps, git SHAs, line:col references, collapses whitespace.

---

## Slack Notification Types

| Type | When Sent |
|------|-----------|
| `pipeline_failed` | New CI failure detected |
| `pre_check_failed` | Compilation pre-check failed |
| `runner_failed` | GitHub Actions validation failed |
| `pr_created` | Draft PR submitted for review |
| `escalated` | Manual intervention required |
| `superseded` | New developer commit supersedes fix |
| `budget_exceeded` | Token budget depleted |
| `flaky_detected` | Flaky failure pattern detected |

All notifications for a job are threaded under the first message via `slack_thread_ts`.

---

## GitHub App Required Permissions

| Permission | Access | Purpose |
|------------|--------|---------|
| Contents | Read & Write | Read files, push fix branches |
| Pull Requests | Read & Write | Create draft PRs |
| Issues | Read & Write | Create escalation issues |
| Actions | Read | Read workflow run logs |
| Metadata | Read | Repository metadata |
| Checks | Read | Read check run results |

### Subscribed Events
- `workflow_run` — trigger on CI failure
- `push` — detect developer commits (supersede active fixes)
- `pull_request` — track PR status changes

---

## Vector Memory (RAG)

### How It Works

1. **Store:** After a successful fix, the error context is embedded (1536-dim via OpenAI `text-embedding-3-small`) and stored in `vector_memory` alongside the successful patch
2. **Retrieve:** Before generating a fix, cosine similarity search finds the top-3 most similar past fixes
3. **Context hash** (`SHA-256 of error+language+failureType`) prevents duplicate embeddings
4. **HNSW index** (`m=16, ef_construction=64`) enables fast approximate nearest neighbor search
5. **Minimum similarity** threshold (default 0.7) filters out irrelevant matches
6. **Usage tracking:** `usage_count` and `last_used_at` track how often each pattern is reused

### SQL Query (Cosine Similarity)

```sql
SELECT *, 1 - (error_embedding <=> $1::vector) AS similarity
FROM vector_memory
WHERE 1 - (error_embedding <=> $1::vector) > $min_similarity
ORDER BY error_embedding <=> $1::vector
LIMIT $limit
```
