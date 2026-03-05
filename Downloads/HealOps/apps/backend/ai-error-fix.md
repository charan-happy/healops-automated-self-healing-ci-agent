# AI Error Fix Pipeline — Context

## Overview

Two independent pathways trigger AI error fixing:

1. **Webhook Pipeline** (production): GitHub webhook → guard chain → single batch queue job → fix agent per error
2. **Manual API** (testing): `POST /v1/healops/fix-request` → single queue job → fix agent

Both pathways converge at `FixAgentService.execute()` which runs a LangGraph state machine.

---

## Data Flow

```
GitHub Webhook (workflow_run failure)
  → GithubWebhookService.processEventAsync()
  → 6-check guard chain (validation callback, healops branch, healops commit, cooldown, budget)
  → dispatchAiFixJobs(buildErrors[], branch, commitSha)
  → FixRequestQueue.addBatchFixRequest()           ← ONE queue job for ALL errors
  → BullMQ: HEALOPS_FIX_REQUEST queue
  → FixRequestProcessor.processBatch()
  → For each error: FixAgentService.execute()

Manual API: POST /v1/healops/fix-request
  → FixRequestQueue.addFixRequest()                ← ONE queue job for ONE error
  → BullMQ: HEALOPS_FIX_REQUEST queue
  → FixRequestProcessor.processSingle()
  → FixAgentService.execute()
```

---

## Token Caching (two layers)

### Layer 1: Exact Duplicate (error_hash match) → 0 tokens
Before running the LangGraph agent, `FixAgentService.checkForCachedFix()` queries `fix_requests` by `error_hash`. If an identical error was already successfully fixed, it reuses the stored patch directly — **skips the entire graph** (no classify, no embedding, no generate, no evaluate).

```
FixAgentService.execute()
  → create fix_request row
  → checkForCachedFix(errorHash)
     → findByErrorHash() → found completed fix_request with jobId?
     → findJobById() → job status = 'success'?
     → findAttemptsByJob() → find accepted attempt (isCorrect=true)
     → findPatchByAttempt() → get stored diffContent
     → mark new fix_request as completed, link to existing job
     → return immediately — 0 tokens
```

### Layer 2: High Similarity (cosine ≥ 0.95) → minimal tokens
Only reached if Layer 1 found no exact match (different error message but semantically similar). After `classify` + `search_similar`, the `similarityRouter` checks the top match. If similarity >= 0.95 AND confidence >= 0.6, applies the cached fix from vector_memory directly — **skips generate_fix + evaluate_fix**.

Still uses tokens for classify (LLM) + embedding (search_similar), but saves the expensive generation + evaluation calls.

---

## LangGraph Agent Flow

```
START → classify → scope_check ──(out_of_scope)──→ END
                       │
                   (in_scope)
                       ↓
             search_similar → similarity_router ──(≥95% match)──→ apply_cached_fix → END
                  ↑                │                                (0 tokens used)
                  │           (no exact match)
                  │                ↓
                  │          generate_fix → evaluate_fix → decide
                  │                                          │
                  └──────────(retry if rejected)─────────────┘
                                                             │
                                                           (done)
                                                             ↓
                                                            END
```

**Nodes:**
- **classify**: `ErrorClassifierService` → LLM structured output → one of 10 error types + confidence
- **scope_check**: Routes to `search_similar` (in-scope) or `END` (out-of-scope)
- **search_similar**: `SimilarFixService` → embed error → pgvector HNSW cosine search → top 5 similar fixes
- **similarity_router**: If top match similarity >= `highSimilarityThreshold` (0.95) AND confidence >= `minConfidence` (0.6) → `apply_cached_fix`. Else → `generate_fix`
- **apply_cached_fix**: Applies stored fix directly from vector_memory — **0 LLM tokens used**, goes straight to END
- **generate_fix**: LLM structured output → fixedCode, summary, confidence, approach, reasoning
- **evaluate_fix**: LLM review → is_correct, confidence, feedback → accept or reject
- **retry_router**: If rejected AND attempts < max → back to `search_similar` (excluding used IDs)

**Retry Logic:**
- Max 3 attempts (configurable: `AI_FIX_MAX_ATTEMPTS`)
- Each retry excludes previously-used similar fix IDs to force different approaches
- Previous failed attempts + rejection reasons passed as context
- Fix accepted when `isCorrect=true` AND `confidence >= 0.6`

---

## File Map

### Queue Layer
| File | Purpose |
|------|---------|
| `src/background/constants/job.constant.ts` | `QueueName.HEALOPS_FIX_REQUEST`, `JobName.FIX_REQUEST`, `JobName.BATCH_FIX_REQUEST` |
| `src/background/queue/fix-request/fix-request.queue.ts` | `FixRequestPayload`, `BatchFixRequestPayload`, `addFixRequest()`, `addBatchFixRequest()` |
| `src/background/queue/fix-request/fix-request.processor.ts` | BullMQ worker (concurrency: 1), routes single vs batch, `FixResult`, `BatchFixResult` |
| `src/background/queue/fix-request/fix-request.controller.ts` | `POST /v1/healops/fix-request` — manual testing endpoint (`@Public()`) |
| `src/background/queue/fix-request/dto/fix-request.dto.ts` | Validation: errorMessage, codeSnippet, lineNumber, branch, commitSha, filePath?, language? |
| `src/background/queue/fix-request/fix-request-queue.module.ts` | Worker module: processor + agent services |
| `src/background/queue/fix-request/fix-request-api.module.ts` | API module: exports `FixRequestQueue` |

### Agent Layer
| File | Purpose |
|------|---------|
| `src/background/queue/fix-request/agent/state.ts` | `FixGraphState`, `AttemptRecord`, `SimilarFixEntry`, `SearchResultRecord`, `AgentLogEntry` |
| `src/background/queue/fix-request/agent/fix-graph.ts` | `buildFixGraph()` — LangGraph state machine with 6 nodes + 3 routers |
| `src/background/queue/fix-request/services/fix-agent.service.ts` | `FixAgentService.execute()` — orchestrator: duplicate check, runs graph, persists results, stores vector memory |
| `src/background/queue/fix-request/services/error-classifier.service.ts` | `ErrorClassifierService.classify()` — LLM classification into 10 types |
| `src/background/queue/fix-request/services/similar-fix.service.ts` | `SimilarFixService.findSimilarFixes()` — embed + pgvector HNSW search + partition used/excluded |
| `src/background/queue/fix-request/constants/error-types.constant.ts` | 10 `SupportedErrorType` definitions, `ErrorCategory` enum |

### Webhook Integration
| File | Purpose |
|------|---------|
| `src/github-webhook/github-webhook.service.ts` | `dispatchAiFixJobs()` — maps buildErrors → `addBatchFixRequest()` (one queue job for all errors) |

### Repositories (all under `src/db/repositories/healops/`)
| File | Purpose |
|------|---------|
| `fix-requests.repository.ts` | CRUD for `fix_requests` table — create, updateStatus, findByErrorHash |
| `jobs.repository.ts` | CRUD for `jobs`, `attempts`, `patches`, `validations` tables |
| `vector-memory.repository.ts` | `findSimilar()` (pgvector cosine), `createEntry()`, `incrementUsageCount()` |
| `audit-log.repository.ts` | `createAuditLog()` for `healops_audit_logs` table |

---

## Database Tables

### `fix_requests`
```
id                    uuid PK
error_message         text (max 8000)
code_snippet          text (max 50000)
line_number           integer
file_path             varchar(500)?
language              varchar(50)?
branch                varchar(255)
commit_sha            varchar(40)
error_hash            varchar(64)       ← SHA-256 of normalized error
classified_error_type varchar(100)?     ← set after classification
is_in_scope           boolean?
scope_reason          text?
status                varchar(50)       ← received → classifying → completed|failed|out_of_scope
job_id                uuid? FK→jobs
created_at            timestamptz
```
Indexes: error_hash, status, (branch, commit_sha)

### `jobs`
```
id                    uuid PK
failure_id            uuid? FK→failures   ← webhook repair pipeline
fix_request_id        uuid? FK→fix_requests ← fix-request pipeline
status                varchar(50)         ← queued|running|success|failed|escalated|superseded|budget_exceeded|circular_fix_detected
classified_failure_type varchar(100)?
confidence            real?
max_retries           integer (default 3)
current_retry         integer (default 0)
token_budget          integer (default 100000)
total_tokens_used     integer (default 0)
superseded_by_commit  varchar(40)?
started_at            timestamptz?
completed_at          timestamptz?
created_at            timestamptz
```

### `attempts`
```
id                    uuid PK
job_id                uuid FK→jobs
attempt_number        integer (1-based)
analysis_output       json               ← {summary, confidence, isCorrect, evaluationFeedback, approach, reasoning, rejectionReason, usedSimilarFixIds, discardedSimilarFixIds, searchResults}
fix_fingerprint       varchar(64)?        ← SHA-256 of diff for circular detection
secret_redactions_count integer (default 0)
validation_run_id     uuid? FK→pipeline_runs
input_tokens          integer
output_tokens         integer
total_tokens          integer
latency_ms            integer?
created_at            timestamptz
```

### `patches`
```
id                    uuid PK
attempt_id            uuid unique FK→attempts
diff_content          text                ← the corrected code
files_modified        json                ← [{path, additions, deletions}]
patch_size            integer
has_type_assertions   boolean
has_empty_catch       boolean
security_scan_status  varchar(50)?
created_at            timestamptz
```

### `vector_memory`
```
id                    uuid PK
repository_id         uuid? FK→repositories
job_id                uuid FK→jobs
error_embedding       vector(1536)        ← pgvector, OpenAI compatible
context_hash          varchar(64) unique   ← SHA-256(error+code+language)
failure_type          varchar(100)
language              varchar(50)
successful_patch      text
confidence            real
usage_count           integer (default 0)
last_used_at          timestamptz?
created_at            timestamptz
deleted_at            timestamptz?         ← soft delete
```
HNSW Index: `idx_vector_memory_embedding USING hnsw (error_embedding vector_cosine_ops) WITH (m=16, ef_construction=64)`

### `healops_audit_logs`
```
id                    uuid PK
entity_type           varchar(100)        ← 'fix_request'
entity_id             uuid
action                varchar(100)        ← created|duplicate_reused|agent.classify|agent.search_similar|agent.apply_cached_fix|agent.generate_fix|agent.evaluate_fix|agent.attempt_persisted|agent.vector_memory_stored|completed|graph_failed
actor_type            varchar(50)         ← 'system'
actor_id              varchar(255)?
old_value             json?
new_value             json?
metadata              json                ← action-specific data (usableCount, rejectionReason, approach, etc.)
created_at            timestamptz
```

---

## Supported Error Types (10)

**Code Errors (7):**
1. `syntax_error` — missing braces, parentheses, semicolons
2. `import_error` — cannot find module, incorrect paths
3. `dto_interface_error` — type mismatches, missing properties across interfaces
4. `type_error` — TypeScript compilation failures (TS2322, TS2345, etc.)
5. `export_error` — functions/classes not exported from modules
6. `build_error` — framework decorators, DI configuration, circular dependencies
7. `test_failure` — assertion failures, wrong expected values

**Dependency Issues (3):**
8. `missing_dependency` — package used but not in package.json
9. `version_conflict` — incompatible package versions
10. `package_json_error` — JSON syntax errors, malformed config

Anything outside these → `out_of_scope`

---

## Key Interfaces

```typescript
// Queue payloads
interface FixRequestPayload {
  errorMessage: string; codeSnippet: string; lineNumber: number;
  branch: string; commitSha: string; filePath?: string; language?: string;
}
interface BatchFixRequestPayload {
  buildErrors: FixRequestPayload[]; branch: string; commitSha: string;
}

// Agent I/O
interface FixAgentInput {
  errorMessage: string; codeSnippet: string; lineNumber: number;
  branch: string; commitSha: string; filePath?: string; language?: string;
}
interface FixAgentOutput {
  fixRequestId: string; jobId: string | null;
  status: 'completed' | 'failed' | 'out_of_scope';
  classifiedErrorType: string; isInScope: boolean; scopeReason: string;
  totalAttempts: number; fixSummary: string; fixedCode: string;
  fixConfidence: number; totalTokensUsed: number; logs: AgentLogEntry[];
}

// Processor results
interface FixResult { /* same fields as FixAgentOutput minus logs */ }
interface BatchFixResult {
  totalErrors: number; completed: number; failed: number; outOfScope: number;
  totalTokensUsed: number; results: FixResult[];
}

// Agent state types
interface AttemptRecord {
  attemptNumber: number; fixedCode: string; fixSummary: string;
  fixConfidence: number; isCorrect: boolean; evaluationFeedback: string;
  inputTokens: number; outputTokens: number;
  searchResults: SearchResultRecord[];
  usedSimilarFixIds: string[]; discardedSimilarFixIds: string[];
  aiReasoning: string; rejectionReason: string; approachDescription: string;
}
interface SimilarFixEntry {
  id: string; patch: string; errorType: string; confidence: number; similarity: number;
}
```

---

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `AI_FIX_MAX_ATTEMPTS` | 3 | Max retry attempts per error |
| `AI_FIX_MIN_CONFIDENCE` | 0.6 | Min confidence to accept a fix |
| `AI_FIX_SIMILARITY_THRESHOLD` | 0.7 | Min cosine similarity for vector search |
| `AI_FIX_EXACT_MATCH_THRESHOLD` | 0.95 | Similarity above which cached fix is applied directly (skips generate + evaluate) |

---

## Persistence Flow (inside FixAgentService.execute)

1. Create `fix_requests` row (status: `received`)
2. **Duplicate check** (`checkForCachedFix`): query `fix_requests` by `error_hash` for an existing `completed` entry with a successful job → if found, reuse its patch directly (**0 tokens**, skips entire graph, audit action: `duplicate_reused`)
3. Update status → `classifying`
4. Run LangGraph agent
5. Update `fix_requests` with classification + final status
6. If in-scope: create `jobs` row, link to fix_request
7. For each attempt: create `attempts` row (with `analysis_output` JSON) + `patches` row
8. If completed: generate embedding → store in `vector_memory` (dedup via contextHash)
9. Create `healops_audit_logs` at each step

---

## Batch vs Single Processing

| Aspect | Single (`FIX_REQUEST`) | Batch (`BATCH_FIX_REQUEST`) |
|--------|------------------------|------------------------------|
| Source | Manual API endpoint | GitHub webhook pipeline |
| Queue method | `addFixRequest()` | `addBatchFixRequest()` |
| Payload | One `FixRequestPayload` | `{buildErrors: FixRequestPayload[], branch, commitSha}` |
| Processor | `processSingle()` | `processBatch()` — loops over errors sequentially |
| DB records | 1 fix_request + 1 job + N attempts | M fix_requests + M jobs + N attempts each |
| Returns | `FixResult` | `BatchFixResult` (aggregate counts + individual results) |

---

## Testing

```bash
# Manual API test (single error)
curl -s -X POST http://localhost:4000/v1/healops/fix-request \
  -H "Content-Type: application/json" \
  -d '{"errorMessage":"...","codeSnippet":"...","lineNumber":1,"branch":"feat/x","commitSha":"abc123"}'

# Full test suite
cd apps/backend && ./scripts/test-fix-request.sh

# Retry examples
cd apps/backend && ./scripts/test-retry-examples.sh

# DB queries
SELECT status, COUNT(*) FROM fix_requests GROUP BY status;
SELECT id, failure_type, confidence, usage_count FROM vector_memory ORDER BY created_at DESC;
SELECT entity_id, action, metadata FROM healops_audit_logs WHERE action = 'agent.search_similar';
SELECT entity_id, action, metadata FROM healops_audit_logs WHERE action = 'duplicate_reused';

# Bull Board
http://localhost:4000/admin/queues
```

---

## Webhook Guard Chain (6 checks before dispatching)

1. **Validation callback?** — Skip healops-validation.yml runs
2. **HealOps branch?** — Skip `healops/fix/*` or `patchpilot/fix/*` branches (loop prevention)
3. **HealOps commit?** — Skip commits with `source='healops'` (loop prevention)
4. **Active cooldown?** — Skip if repo+branch is on cooldown
5. **Budget exhausted?** — Skip if org has no remaining budget
6. **All passed** → `dispatchAiFixJobs()` + `dispatchRepairJob()`
