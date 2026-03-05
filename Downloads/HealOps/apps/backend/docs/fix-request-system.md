# Fix Request System — Implementation Documentation

## Overview

The Fix Request System is a self-healing pipeline that automatically classifies, searches for similar past fixes, and generates code fixes for errors detected in the CI/CD pipeline. It uses RepairAgentService with retry logic, vector memory (pgvector), and comprehensive audit logging.

**Entry point:** `POST /v1/healops/fix-request` (HTTP 202 — async processing via BullMQ)

---

## Architecture

```
POST /v1/healops/fix-request
        |
        v
  FixRequestController --> FixRequestQueue.addFixRequest()
                            |  (BullMQ job queued)
                            v
                      FixRequestProcessor.process()    <-- worker picks up
                            |
                            v
                      FixAgentService.execute()
                            |
                            v
                      RepairAgentService.repairFromInput()
                            |
    START --> classify --> scope_check --(out_of_scope)--> END
                              |
                          (in_scope)
                              |
                              v
                       search_similar --> generate_fix --> evaluate_fix --> decide
                            ^                                                |
                            |___________________(retry)______________________|
                                                                             |
                                                                          (done)
                                                                             |
                                                                             v
                                                                            END
        |
        v
  Results persisted to DB:
    - fix_requests (request tracking)
    - jobs (execution record)
    - attempts (per-attempt details)
    - patches (generated code)
    - vector_memory (successful fixes for future reference)
    - healops_audit_logs (full audit trail)
```

---

## Files

### Core Files

| File | Purpose |
|------|---------|
| `src/background/queue/fix-request/fix-request.queue.ts` | Queue wrapper for adding fix request jobs |
| `src/background/queue/fix-request/fix-request.processor.ts` | BullMQ processor — invokes FixAgentService |
| `src/background/queue/fix-request/fix-request.controller.ts` | POST /v1/healops/fix-request endpoint |
| `src/background/queue/fix-request/fix-request-api.module.ts` | API-side module (controller + queue) |
| `src/background/queue/fix-request/fix-request-queue.module.ts` | Worker-side module (processor + services) |
| `src/background/queue/fix-request/fix-request-queue-ui.module.ts` | Bull Board UI registration |
| `src/background/queue/fix-request/services/fix-agent.service.ts` | Orchestration facade — creates DB records, invokes RepairAgentService, persists results, stores in vector memory |
| `src/background/queue/fix-request/dto/fix-request.dto.ts` | DTO for fix request validation |

### Supporting Files

| File | Purpose |
|------|---------|
| `src/ai/providers/openrouter.provider.ts` | OpenRouter AI provider (alternative to Claude/OpenAI) |
| `src/db/schema/fix-requests.ts` | Drizzle schema for `fix_requests` table |
| `src/db/repositories/healops/fix-requests.repository.ts` | Repository for fix_requests CRUD |
| `scripts/test-fix-request.sh` | E2E test — 10 error scenarios covering all supported types |

---

## Core Features

### 1. Error Classification

Uses RepairAgentService to classify errors into supported types:

| Category | Error Types |
|----------|-------------|
| Code Errors | `syntax_error`, `import_error`, `dto_interface_error`, `type_error`, `export_error`, `build_error`, `test_failure` |
| Dependency Issues | `missing_dependency`, `version_conflict`, `package_json_error` |
| Out of Scope | `out_of_scope` (DB errors, network issues, etc.) |

### 2. Vector Memory & Similar Fix Search

Strategy:
1. Generate embedding of `"errorType: errorMessage"` via AI provider
2. Cosine similarity search on `vector_memory` table (pgvector HNSW index)
3. Filter by minimum similarity threshold (default: 0.7, configurable via `AI_FIX_SIMILARITY_THRESHOLD`)
4. Successful fixes stored for future reference

### 3. Fix Generation

RepairAgentService handles the multi-attempt fix generation loop with:
- Error classification and scope checking
- Similar fix search with exclusions on retries
- LLM-based fix generation with structured output
- Fix evaluation and retry logic (up to 3 attempts)

### 4. Audit Logging

Every step emits audit logs via `healops_audit_logs` table:

| Action | When | Key Metadata |
|--------|------|-------------|
| `created` | Fix request created | errorHash, branch |
| `agent_failed` | Agent execution error | error message |
| `agent.vector_memory_stored` | After storing successful fix | jobId, classifiedErrorType, fixConfidence |
| `completed` | Final status | status, jobId, attempts, totalTokens, durationMs |

---

## Configuration

| Environment Variable | Default | Purpose |
|---------------------|---------|---------|
| `AI_FIX_MAX_ATTEMPTS` | `3` | Maximum retry attempts per fix request |
| `AI_FIX_MIN_CONFIDENCE` | `0.6` | Minimum confidence to accept a fix |
| `AI_FIX_SIMILARITY_THRESHOLD` | `0.7` | Minimum cosine similarity for vector memory search |
| `AI_DEFAULT_PROVIDER` | `claude` | AI provider (`claude`, `openai`, `openrouter`) |
| `OPENROUTER_API_KEY` | — | API key for OpenRouter provider |

---

## API

### POST /v1/healops/fix-request

**Auth:** Public (no JWT required)
**Response:** HTTP 202 (Accepted)

**Request body:**
```json
{
  "errorMessage": "SyntaxError: Unexpected end of input",
  "codeSnippet": "function foo() {\n  return 1;\n",
  "lineNumber": 3,
  "branch": "feat/my-feature",
  "commitSha": "abc123def456",
  "filePath": "src/app.ts",
  "language": "typescript"
}
```

**Response:**
```json
{
  "jobId": "42",
  "message": "Fix request queued. The AI agent will classify, search for similar fixes, and attempt resolution (up to 3 retries)..."
}
```

**Results available in:**
- Bull Board: `http://localhost:3000/admin/queues` (HealOps Fix Request Queue)
- Database: `fix_requests`, `jobs`, `attempts`, `patches`, `vector_memory`, `healops_audit_logs`
- Swagger: `http://localhost:3000/api/v1`

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `fix_requests` | Tracks each incoming fix request (error, branch, status, classification) |
| `jobs` | Execution record linked to fix_request (status, tokens, retries, timing) |
| `attempts` | Per-attempt data (analysis_output JSON with all tracking fields) |
| `patches` | Generated code patches per attempt |
| `vector_memory` | Successful fixes stored with pgvector embeddings for future retrieval |
| `healops_audit_logs` | Full audit trail of every agent step |

---

## Test Scripts

### E2E Test Scripts

```bash
# Full flow with 10 error types
bash scripts/test-fix-request.sh
```

**Prerequisites for E2E tests:**
- PostgreSQL running (port 5433)
- Redis running
- API + Worker running (`pnpm start:dev`)
- DB migrations applied (`pnpm db:migrate`)

---

## Performance

Measured from production runs:

| Scenario | Avg Duration | Token Usage |
|----------|-------------|-------------|
| 1 attempt (accepted) | ~17 seconds | ~1500-2500 tokens |
| 2 attempts (1 retry) | ~34 seconds | ~3000-4500 tokens |
| 3 attempts (2 retries) | ~47 seconds | ~4500-6000 tokens |
