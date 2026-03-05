# 🏗 HealOps Architecture

## 🧬 System Philosophy

HealOps is built as a **Stateful Agentic Remediation System**.

It separates:
- **Detection** (CI failure events)
- **Reasoning** (LLM-driven diagnosis & patch generation)
- **Validation** (Isolated sandbox testing)
- **Orchestration** (Deterministic retry control)

This separation ensures reliability, extensibility, and production safety.

![Architecture diagram](image.png)

---

# 🔄 High-Level System Overview

HealOps operates as a distributed, event-driven system:

```
CI Provider
│
▼
Webhook Listener (NestJS)
│
▼
Failure Preprocessor (Log-Sparser)
│
▼
Agentic Brain (LangGraph + LLM)
│
▼
Docker Sandbox Validation
│
├── Success → Create Pull Request
├── Retry → Feed Logs Back to Agent
└── Escalate → Create Issue with Audit Trail
```


The system maintains state across retries to avoid repeating failed strategies.

---

# 🧩 Core Architecture Layers

---

## 1️⃣ Detection Layer (DevOps Interface)

### Responsibilities
- Receive CI failure events via webhook
- Fetch raw build logs
- Extract relevant error data
- Trigger remediation workflow

### Components

#### Webhook Controller (NestJS)
Handles:
- `workflow_run` failure events
- Authentication & validation
- Provider routing via adapter pattern

#### Log-Sparser (Preprocessor)
CI logs can contain thousands of lines.  
The Log-Sparser:

- Extracts stack traces
- Removes noise (install logs, warnings, timestamps)
- Identifies failure boundaries
- Reduces token usage
- Improves LLM precision

This is critical for cost and reasoning quality.

---

## 2️⃣ Agentic Brain (AI Layer)

### Core Responsibilities
- Classify failure type
- Generate patch
- Maintain retry memory
- Improve strategy between attempts

### LLM Engine
- Local Ollama server
- Llama 3.1 (8B by default)
- LangChain.js for structured prompting
- LangGraph for stateful execution

### Stateful Agent Loop

The system runs a structured cycle:

`Analyze → Generate Patch → Validate → Observe Result → Adjust Strategy`


Each attempt:
- Stores logs
- Stores patch diff
- Stores validation outcome
- Prevents duplicate fix attempts

---

## 3️⃣ Orchestrator (State Management)

HealOps uses a **deterministic state machine** powered by XState.

### State Definitions

- `Detecting`
- `Analyzing`
- `Fixing`
- `Validating`
- `Retry`
- `Success`
- `Escalate`

### Transition Logic

| Current State | Condition | Next State |
|---------------|----------|-----------|
| Validating | Exit Code = 0 | Success |
| Validating | Exit Code ≠ 0 & retries < 3 | Retry |
| Retry | New strategy generated | Fixing |
| Validating | retries ≥ 3 | Escalate |

This ensures:
- No infinite loops
- Predictable behavior
- Clear audit trail

---

## 4️⃣ DevOps Sandbox (Validation Layer)

### Isolation Model

Each fix attempt runs inside a fresh Docker container:

1. Spin up clean container
2. Mount modified repository as volume
3. Install dependencies
4. Run `npm run build` or `npm test`
5. Capture exit code and logs

### Exit Code Rules

- `0` → Validation Success
- `Non-zero` → Failure, logs captured and returned to agent

### Safety Controls

- CPU & memory limits
- Execution timeouts
- Filesystem isolation
- No host modification

This guarantees host stability and secure execution.

---

# 🛡 Security Model

- HealOps never auto-merges
- PR approval required from human reviewer
- Least privilege access:
  - Write access only to temporary branches
  - No direct access to `main`
- Retry limit capped (default: 3)
- Escalation instead of forced automation

Safety > automation aggressiveness.

---

# 🔌 Adapter Architecture (CI & SCM Agnostic)

To ensure provider flexibility, HealOps uses the **Adapter Pattern**.

---

## CI Provider Interface (`ICIProvider`)

Methods:
- `getFailureLogs()`
- `getWorkflowMetadata()`
- `rerunWorkflow()`

Implementations:
- GitHub Actions Adapter
- GitLab CI Adapter
- Jenkins Adapter (planned)

---

## SCM Provider Interface (`ISCMProvider`)

Methods:
- `createPullRequest()`
- `createIssue()`
- `createBranch()`
- `commitChanges()`

Implementations:
- GitHub
- GitLab
- Bitbucket (planned)

Core logic never depends on provider-specific APIs.

---

# 🗄 Database Architecture

Using Prisma with SQLite (local-first).

## Tables

### Sessions
- `id`
- `repo_url`
- `ci_provider`
- `scm_provider`
- `status`
- `created_at`
- `updated_at`

### FixAttempts
- `id`
- `session_id`
- `attempt_number`
- `patch_content`
- `validation_result`
- `logs`

### KnowledgeBase
- `id`
- `error_pattern`
- `fix_template`
- `success_rate`

The KnowledgeBase enables recurring pattern recognition for dependency conflicts and common failures.

---

# 📊 Data Flow (Step-by-Step)

1. CI fails
2. Webhook triggers NestJS controller
3. Logs fetched and sparsified
4. Agent analyzes failure
5. Patch generated
6. Docker validation executed
7. Result evaluated:
   - Success → PR created
   - Failure → Retry
   - Max retries → Issue created
8. Telemetry sent to dashboard

---

# 📡 Real-Time Telemetry

The Next.js dashboard displays:

- Active repair sessions
- Retry attempts
- Failure classification
- Validation logs
- Success metrics

API communicates via:
- REST endpoints
- Event-driven updates (extensible to WebSockets)

---

# 🚀 Scalability Strategy

HealOps scales horizontally via:

- Independent validation containers
- Non-blocking NestJS workers
- Queue-based job handling (future enhancement)
- Per-repository session isolation

The system can monitor multiple microservices concurrently without shared state conflicts.

---

# ⚙️ Performance Considerations

- Log-Sparser reduces token usage significantly
- Container warm-pooling reduces startup latency
- Retry limit prevents resource exhaustion
- Resource quotas prevent runaway builds

---

# 🏗 Folder Structure Reference

```
/
├── apps/
│ ├── api/
│ └── web/
│
├── libs/
│ ├── adapters/
│ │ ├── ci/
│ │ └── scm/
│ ├── llm/
│ ├── sandbox/
│ ├── state-machine/
│ ├── shared/
│ └── database/
│
├── docs/
├── tools/
└── package.json
```


---

# 🎯 Design Principles

1. Deterministic over heuristic
2. Validate before commit
3. Never auto-merge
4. Isolate everything
5. Fail safely
6. Preserve audit trails
7. Remain provider-agnostic
8. Optimize for developer trust

---

# 🔮 Future Architectural Enhancements

- Distributed worker queue (BullMQ / Redis)
- Multi-LLM strategy routing
- Embedding-based similarity search
- Cross-repository learning layer
- Distributed validation runners
- Persistent vector store for fix retrieval
- Enterprise observability stack (OpenTelemetry)

---

# 🧠 Architectural Summary

HealOps is not just an LLM wrapper.

It is a:

- Stateful agent system  
- Deterministic remediation engine  
- Secure DevOps sandbox  
- Provider-agnostic integration layer  
- Production-safe automation framework  

It transforms CI/CD from reactive maintenance to autonomous recovery.

