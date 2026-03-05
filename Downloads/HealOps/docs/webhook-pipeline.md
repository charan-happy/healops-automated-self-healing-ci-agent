# Webhook Pipeline — End-to-End Flow

## Key Files
- `apps/backend/src/github-webhook/github-webhook.controller.ts` — HTTP endpoint
- `apps/backend/src/github-webhook/github-webhook.service.ts` — Async processing logic
- `apps/backend/src/github-webhook/validation-callback.handler.ts` — Validation callback
- `apps/backend/src/github-webhook/guards/webhook-rate-limit.guard.ts` — Rate limiting
- `apps/backend/src/background/queue/webhook-ingest/webhook-ingest-queue.processor.ts` — Async processor
- `apps/backend/src/background/queue/webhook-ingest/webhook-ingest-queue.service.ts` — Queue service
- `apps/backend/src/common/utils/hash.ts` — HMAC-SHA256 signature verification
- `apps/backend/src/common/route-names.ts` — Route constants

## Endpoint
- `POST /v1/healops/webhooks/github` — Main GitHub webhook
- `POST /v1/healops/webhooks/validation-complete` — Validation callback
- Controller: `@Public()` (no JWT), `@ApiExcludeController()` (hidden from Swagger)
- Route constant: `RouteNames.HEALOPS_WEBHOOKS`

## Required Headers
- `X-Hub-Signature-256` — HMAC-SHA256 of raw body (format: `sha256=<hex>`)
- `X-GitHub-Event` — Event type (e.g. `workflow_run`, `push`)
- `X-GitHub-Delivery` — Unique delivery ID (UUID, used for idempotency)

## Synchronous Path (< 10 seconds)
```
POST /v1/healops/webhooks/github
  → Validate headers
  → Verify HMAC-SHA256 signature (timing-safe)
  → Idempotent insert into webhook_events (ON CONFLICT DO NOTHING)
  → Enqueue to WebhookIngestQueue (BullMQ)
  → Return { received: true } → HTTP 200
```

## Async Processing (BullMQ Worker)
```
WebhookIngestQueueProcessor (concurrency: 3, timeout: 60s, attempts: 3)
  → Guard chain (6 checks):
    1. Is validation callback? → skip
    2. Is healops branch? (healops/fix/*, agent-fix/*) → skip (loop prevention)
    3. Is healops commit? (source=healops) → skip (loop prevention)
    4. Active cooldown? → skip
    5. Budget exhausted? → skip
    6. All passed → DISPATCH REPAIR
       → Resolve/create: branch, commit, pipeline_run records
       → Extract build errors from CI logs
       → Fetch source code for each error
       → Dispatch batch fix job to FixRequestQueue
```

## GitHub Payload Shape (workflow_run)
```typescript
{
  action: 'completed',
  workflow_run: {
    id: number,
    name: string,
    head_branch: string,
    head_sha: string,
    conclusion: 'failure' | 'success' | ...,
    html_url: string,
    head_commit: { author: { name }, message },
  },
  repository: {
    id: number,
    full_name: string,         // "owner/repo"
    default_branch: string,
    language: string,
    owner: { login: string },
  },
  installation: { id: number },
}
```

## Build Error Extraction
1. Fetch CI logs from GitHub API
2. Clean ANSI codes & timestamps
3. Find error lines matching `/error\s*TS\d+|Type error:/i`
4. Deduplicate (skip [WORKER] duplicates, keep [API])
5. Extract location (file, line number)
6. Fetch source code from GitHub at error line (±5 lines)
7. Dispatch to FixRequestQueue as batch job

## Rate Limiting
- Per-installation: 1000 requests / 60 seconds
- Redis key: `healops:ratelimit:webhook:{installationId}`

## Signature Verification
- Secret: `process.env.GITHUB_WEBHOOK_SECRET`
- Algorithm: HMAC-SHA256
- Comparison: timing-safe (`crypto.timingSafeEqual`)

## Validation Callback
- Route: `POST /v1/healops/webhooks/validation-complete`
- Auth: Bearer token (`HEALOPS_WEBHOOK_API_KEY`, timing-safe check)
- Idempotency: Redis NX key `healops:callback:{runId}` (TTL 3600s)
- Extracts job_id from branch name (UUID pattern)
- Anti-replay: cross-verifies via GitHub API
- Resumes waiting agent via Redis pub/sub channel `validation:{jobId}`

## Env Vars
- `GITHUB_WEBHOOK_SECRET` — HMAC secret for signature verification
- `HEALOPS_WEBHOOK_API_KEY` — Bearer token for validation-complete endpoint
- `GITHUB_INSTALLATION_ID` — Fallback installation ID
