# HealOps — Edge Cases Mapped to Pipeline Steps

> **53 edge cases** (28 functional + 17 architectural + 8 queue/deployment) mapped to pipeline steps.
>
> **How to use this document:** When implementing a pipeline step, go to that
> section and handle EVERY edge case listed under it. Each entry has a checkbox,
> the edge case ID (cross-references `EDGE-CASES.md`), priority level, and the
> exact code to write. Nothing is left to interpretation.

---

## Pipeline Overview

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           HEALOPS REPAIR PIPELINE                                │
│                                                                                  │
│  WEBHOOK ─▶ BullMQ Buffer (EC-29) ─▶ PROCESS ─▶ ENQUEUE ─▶ Redlock (EC-32) ─▶  │
│              Rate Limit (EC-42)       Supersede    Budget                         │
│              Push → Cancel (EC-40)    (EC-40)      Dedup                          │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐        │
│  │         LANGGRAPH STATE MACHINE (with checkpointing: EC-30)          │        │
│  │                                                                       │        │
│  │  [1] gatherContext (singleflight: EC-33, staleness: EC-43)           │        │
│  │       │                                                               │        │
│  │       ▼                                                               │        │
│  │  [2] diagnoseAndFix ◀──────────┐  (spans: EC-38, tokens: EC-38)     │        │
│  │       │                         │                                     │        │
│  │       ▼                         │                                     │        │
│  │  [3] qualityGate                │                                     │        │
│  │       │                         │                                     │        │
│  │       ▼                         │                                     │        │
│  │  [4] runPreCheck                │  RETRY (max 3)                      │        │
│  │       │                         │                                     │        │
│  │       ▼                         │                                     │        │
│  │  [5] pushBranch                 │                                     │        │
│  │       │                         │                                     │        │
│  │       ▼                         │                                     │        │
│  │  [6] waitForValidation ─────────┘  (timeout: EC-31, dedup: EC-37)    │        │
│  │       │                                                               │        │
│  │       ▼                                                               │        │
│  │  [7] createPR ──or── [8] escalate                                    │        │
│  └───────────────────────────────────────────────────────────────────────┘        │
│                                                                                  │
│  CRON ──▶ stalePrCleanup (15 min) │ softDeleteCleanup (weekly, EC-41)            │
│  QUEUES ──▶ healops-repair + DLQ routing (EC-46) │ healops-slack (EC-47)          │
│  INFRA ──▶ Prometheus metrics (EC-38) │ Tenant isolation (EC-39)                  │
│  WORKER ──▶ Orphan recovery on start (EC-30) │ Separate from API (EC-34)          │
│  DLQ ──▶ Real alerting: Sentry + Slack + DB (EC-48) │ Perms check (EC-52)         │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Step 0: Webhook Ingestion

**Service:** `GithubWebhookService.processGithubWebhook()`
**File:** `github-webhook/github-webhook.service.ts`

### Edge cases to handle at this step:

- [x] **Signature verification** — Reject invalid HMAC-SHA256 signatures
  ```
  IMPLEMENTED: github-webhook.service.ts:36-40
  Uses computeHmacSha256() + verifySignature() with timing-safe comparison
  ```

- [x] **Duplicate webhook (same deliveryId)** — Idempotent insert
  ```
  IMPLEMENTED: github-webhook.service.ts:43-55
  ON CONFLICT DO NOTHING on externalEventId. Returns early if null.
  ```

- [x] **Non-failure events** — Filter to only `workflow_run` + `completed` + `failure`
  ```
  IMPLEMENTED: github-webhook.service.ts:58-70
  Checks event type, action, and conclusion.
  ```

- [x] **EC-06 (partial): Infinite loop prevention** — Ignore failures on `healops/fix/*` branches
  ```
  IMPLEMENTED: github-webhook.service.ts:73-81
  if (headBranch?.startsWith('healops/fix/')) → skip
  ```

- [ ] **EC-08: Multiple errors in one build** — Extract all errors, not just the first
  ```
  ENHANCEMENT:
  After filtering to failure events:
    1. Fetch the CI run logs via GitHub API (logUrl from workflow_run payload)
    2. Parse with LogParserService.parseLog(rawLog) → get full errorSnippet (up to 50 lines)
    3. Create failure record with the FULL multi-error snippet
    4. One failure record per pipeline run (v1 approach — Claude sees all errors)

  Do NOT create multiple failure records per error in v1.
  The single errorSnippet contains all errors; Claude will fix them all in one pass.
  ```

- [ ] **Secret scrubbing** — Scrub logs before storing
  ```
  ENHANCEMENT:
  Before storing payload or extracted logs:
    const scrubbed = secretScrubberService.scrub(rawLog)
    // Store scrubbed.cleaned, record scrubbed.count
  ```

- [ ] **EC-29: Webhook ingestion buffer** — Durable BullMQ queue to prevent lost events
  ```
  MUST IMPLEMENT (P0):

  Current flow (fragile):
    GitHub → POST /webhook → full processing → return 200

  New flow (durable):
    GitHub → POST /webhook → verify HMAC only → enqueue raw event → return 200

  Controller:
    @Post('github')
    async handleGithubWebhook(@Req() req, @Body() body) {
      // 1. Verify HMAC signature (fail fast, no queue)
      const isValid = verifySignature(req.headers['x-hub-signature-256'], rawBody, secret);
      if (!isValid) throw new UnauthorizedException('Invalid signature');

      // 2. Enqueue raw event to durable BullMQ queue
      await this.rawWebhookQueue.add('process-webhook', {
        deliveryId: req.headers['x-github-delivery'],
        event: req.headers['x-github-event'],
        payload: body,
      }, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
        jobId: req.headers['x-github-delivery'],  // Dedup
      });

      return { status: 'accepted' };  // Return immediately
    }

  New processor (WebhookProcessorWorker):
    - Idempotent insert to webhook_events
    - Filter event type / action / conclusion
    - Loop prevention (healops/fix/* branches)
    - Log extraction + failure creation
    - Dispatch to healops-repair queue
  ```

- [ ] **EC-35: CI log size gate** — Prevent OOM from large CI logs
  ```
  MUST IMPLEMENT (P1):

  Before any log parsing at webhook processing:

  const MAX_RAW_LOG_SIZE = 5 * 1024 * 1024;  // 5MB
  if (rawLog.length > MAX_RAW_LOG_SIZE) {
    // Errors appear at start (compile) or end (runtime/test) — keep both
    rawLog = rawLog.slice(0, 2 * 1024 * 1024)
      + '\n... [TRUNCATED — log exceeds 5MB] ...\n'
      + rawLog.slice(-2 * 1024 * 1024);
  }
  ```

- [ ] **EC-40: Superseded job on push event** — Cancel active jobs when new code pushed
  ```
  MUST IMPLEMENT (P1):

  In webhook processing, handle 'push' events:

  if (input.event === 'push') {
    const branch = (input.payload['ref'] as string)?.replace('refs/heads/', '');
    const commitSha = input.payload['after'] as string;

    const activeJobs = await jobsRepository.findActiveJobsByBranch(repositoryId, branch);
    for (const job of activeJobs) {
      await jobsRepository.updateJobStatus(job.id, 'superseded');
      await jobsRepository.setSupersededByCommit(job.id, commitSha);
      await repairQueue.remove(job.id);
      await slackService.notify(job.id, 'superseded',
        `ℹ️ Job superseded — new commit pushed to ${branch}`);
    }
  }
  ```

- [ ] **EC-42: Webhook rate limiting** — Per-installation throttle
  ```
  MUST IMPLEMENT (P1):

  Apply BEFORE queueing (even before HMAC for DoS protection):

  @Injectable()
  export class WebhookRateLimitGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = context.switchToHttp().getRequest();
      const installationId = req.headers['x-github-hook-installation-target-id'];
      const key = `healops:ratelimit:webhook:${installationId}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 60);
      return count <= 1000;  // 1000 per minute per installation
    }
  }
  ```

---

## Step 1: Job Enqueue

**Service:** `RepairJobsService.enqueueRepair()`
**File:** `repair-jobs/repair-jobs.service.ts`

### Edge cases to handle at this step:

- [x] **Cooldown check** — Don't enqueue if cooling down from recent escalation
  ```
  IMPLEMENTED: repair-jobs.service.ts:32-40
  costTrackingRepository.isOnCooldown(repositoryId, branchName, failureType)
  ```

- [x] **Flaky skip** — Don't enqueue if error is confirmed flaky
  ```
  IMPLEMENTED: repair-jobs.service.ts:43-50
  failuresRepository.isFlakyConfirmed(repositoryId, errorHash)
  ```

- [x] **EC-06 (partial): Active job dedup** — Don't create duplicate for same failure
  ```
  IMPLEMENTED: repair-jobs.service.ts:53-57
  jobsRepository.findActiveJobByFailure(failureId) → return existing job ID
  ```

- [ ] **EC-06: Error hash dedup** — Two different webhooks, same commit, same error
  ```
  ENHANCEMENT (after active job check):

  // 4. Check for duplicate by error hash across active jobs
  const existingFailure = await this.failuresRepository.findFailureByErrorHash(input.errorHash);
  if (existingFailure && existingFailure.id !== input.failureId) {
    const activeJobForSameError = await this.jobsRepository.findActiveJobByFailure(existingFailure.id);
    if (activeJobForSameError) {
      this.logger.warn(`Duplicate error hash already being processed: ${input.errorHash}`);
      return activeJobForSameError.id;
    }
  }
  ```

- [ ] **Budget check** — Don't enqueue if organization budget exhausted
  ```
  ENHANCEMENT (after dedup check):

  // 5. Check organization budget
  const budgetExhausted = await this.costTrackingRepository.isBudgetExhausted(organizationId);
  if (budgetExhausted) {
    this.logger.warn(`Budget exhausted for org: ${organizationId}`);
    // Create job in budget_exceeded state for audit trail
    await this.jobsRepository.createJob({ failureId: input.failureId, status: 'budget_exceeded' });
    return null;
  }
  ```

- [ ] **EC-32: TOCTOU race in dedup** — Redis distributed lock around pre-flight + create
  ```
  MUST IMPLEMENT (P1):

  Two identical webhooks arriving within ms can both pass findActiveJobByFailure()
  before either creates a job. Use Redlock to serialize:

  import Redlock from 'redlock';

  async enqueueRepair(input: EnqueueRepairInput): Promise<string | null> {
    const lockKey = `healops:lock:enqueue:${input.repositoryId}:${input.branchName}:${input.errorHash}`;

    let lock: Awaited<ReturnType<Redlock['acquire']>>;
    try {
      lock = await this.redlock.acquire([lockKey], 5000);  // 5s TTL
    } catch {
      this.logger.warn('Could not acquire dedup lock — another enqueue in progress');
      return null;
    }

    try {
      // All existing pre-flight checks (cooldown, flaky, active job, budget)
      // ... existing code ...

      // Safe to create job — we hold the lock
      const job = await this.jobsRepository.createJob({
        failureId: input.failureId, status: 'queued'
      });
      await this.repairQueue.add('repair', { jobId: job.id, ... });
      return job.id;
    } finally {
      await lock.release();
    }
  }
  ```

---

## Step 2: BullMQ Processor (Job Start)

**Service:** `RepairJobsProcessor.process()`
**File:** `repair-jobs/repair-jobs.processor.ts`

### Edge cases to handle at this step:

- [ ] **EC-01 Checkpoint 1: Is pipeline still failing?** — Check before starting work
  ```
  MUST IMPLEMENT:

  async process(job: Job<RepairJobData>): Promise<void> {
    const { jobId, failureId, repositoryId } = job.data;
    await this.jobsRepository.updateJobStatus(jobId, 'running');

    // ── EC-01 CP-1: Pre-check — is main still broken? ──
    const repo = await this.platformRepository.findRepositoryById(repositoryId);
    const isStillFailing = await this.isPipelineStillFailing(repo);
    if (!isStillFailing) {
      await this.jobsRepository.updateJobStatus(jobId, 'aborted');
      await this.slackService.notify(jobId, 'user_fixed',
        'ℹ️ Pipeline is now green — someone already fixed it. Agent standing down.');
      return;
    }

    // ── Proceed to LangGraph agent ──
    await this.repairAgentService.runRepair(jobId, failureId);
  }
  ```

- [ ] **EC-06: Job already resolved while waiting in queue**
  ```
  Same as above — the isPipelineStillFailing() check at job start handles this.
  Jobs that sat in queue while another job fixed the issue will abort cleanly.
  ```

- [ ] **Slack: Fix attempt started notification**
  ```
  MUST IMPLEMENT:

  await this.slackService.notify(jobId, 'fix_attempt_started',
    `🔧 Attempt ${attemptNumber}/${maxRetries} — Fixing [${errorTypeCode}]`);
  ```

- [ ] **EC-30: Orphaned job recovery on startup** — Recover from worker crashes
  ```
  MUST IMPLEMENT (P0):

  In WorkerModule.onModuleInit() (runs once on worker process start):

  async onModuleInit(): Promise<void> {
    const orphanedJobs = await this.jobsRepository.findOrphanedJobs();
    // WHERE status = 'running' AND checkpointed_at < NOW() - INTERVAL '30 minutes'

    for (const job of orphanedJobs) {
      this.logger.warn(`Recovering orphaned job: ${job.id}, last node: ${job.lastCompletedNode}`);

      if (job.lastCompletedNode === 'pushBranch') {
        // Branch pushed but no PR — resume from waitForValidation or createPR
        await this.resumeFromNode(job, 'waitForValidation');
      } else if (job.lastCompletedNode === 'waitForValidation') {
        // Callback may have been lost — check workflow status directly
        const status = await this.githubService.getLatestWorkflowStatus(...);
        if (status === 'success' || status === 'failure') {
          await this.resumeWithValidationResult(job.id, status);
        } else {
          await this.repairQueue.add('repair', { jobId: job.id, resume: true });
        }
      } else {
        // For earlier nodes — restart the attempt
        await this.repairQueue.add('repair', { jobId: job.id, failureId: job.failureId });
      }
    }
  }
  ```

- [ ] **EC-30: State checkpointing after each node** — Persist to DB
  ```
  MUST IMPLEMENT (P0):

  After each LangGraph node completes, persist state:

  // In RepairAgentService, wrap each node:
  async executeNode(nodeName: string, state: AgentState): Promise<AgentState> {
    const result = await this.nodes[nodeName](state);

    // Checkpoint to DB
    await this.jobsRepository.checkpointState(state.jobId, {
      lastCompletedNode: nodeName,
      checkpointedAt: new Date(),
      stateSnapshot: JSON.stringify(result),
    });

    return result;
  }

  Schema addition to jobs table:
    last_completed_node VARCHAR(50)
    state_snapshot JSONB
    checkpointed_at TIMESTAMPTZ
  ```

- [ ] **EC-34: Worker/API process separation** — Verify module registration
  ```
  MUST IMPLEMENT (P0):

  Verify and enforce that:
  1. RepairJobsProcessor is ONLY in WorkerModule (not AppModule)
  2. RepairAgentModule is ONLY in WorkerModule
  3. AppModule imports RepairJobsModule (producer/enqueue API only)
  4. WorkerModule imports RepairJobsWorkerModule (consumer + processor)

  // repair-jobs.module.ts — shared (producer)
  @Module({
    imports: [BullModule.registerQueue({ name: 'healops-repair' })],
    providers: [RepairJobsService],
    exports: [RepairJobsService],
  })
  export class RepairJobsModule {}

  // repair-jobs-worker.module.ts — worker only
  @Module({
    imports: [RepairJobsModule, RepairAgentModule],
    providers: [RepairJobsProcessor],
  })
  export class RepairJobsWorkerModule {}
  ```

- [ ] **EC-46: healops-repair queue — DLQ routing + Bull Board** — Prevent silent job loss
  ```
  MUST IMPLEMENT (P0):

  PART A — Register in QueueName enum and QUEUE_LIST:
  // In background/constants/job.constant.ts:
  export enum QueueName {
    // ... existing ...
    HEALOPS_REPAIR = 'healops-repair',
  }

  // Add to QUEUE_LIST:
  { name: QueueName.HEALOPS_REPAIR, defaultJobOptions: {
    attempts: 3, backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  }}

  PART B — Add worker event handlers to RepairJobsProcessor:
  @OnWorkerEvent('failed')
  async onFailed(job: Job<RepairJobData>, error: Error): Promise<void> {
    this.logger.error(`Repair job ${job.data.jobId} failed: ${error.message}`);
    await this.deadLetterQueueService.addFailedJobToDLQ({
      queueName: QueueName.HEALOPS_REPAIR,
      jobId: job.id ?? 'unknown',
      jobName: job.name,
      jobData: job.data,
      failedReason: error.message,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts ?? 3,
      timestamp: new Date(),
    });
    // Escalate via Slack since repair DLQ is critical
    await this.slackService.notify(job.data.jobId, 'escalated',
      `DLQ: Repair job exhausted all retries. Error: ${error.message}`);
  }

  @OnWorkerEvent('stalled')
  async onStalled(jobId: string): Promise<void> {
    this.logger.warn(`Repair job stalled: ${jobId}`);
    await this.deadLetterQueueService.addFailedJobToDLQ({ ... });
  }
  ```

- [ ] **EC-47: Slack notification queue** — Async with retry
  ```
  MUST IMPLEMENT (P0):

  Replace fire-and-forget SlackService.notify() with a queue producer:

  // SlackService becomes a queue producer:
  async notify(jobId: string, type: string, message: string): Promise<void> {
    await this.slackQueue.add('send-notification', {
      jobId, type, message,
      webhookUrl: this.config.slack.webhookUrl,
    }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
    });
    // Record intent in DB (status: 'queued')
    await this.auditLogRepository.createSlackNotification({
      jobId, type, message, status: 'queued',
    });
  }

  // New processor:
  @Processor('healops-slack')
  export class SlackNotificationProcessor extends WorkerHost {
    async process(job: Job): Promise<void> {
      const response = await fetch(job.data.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildPayload(job.data)),
      });
      if (!response.ok) throw new Error(`Slack API error: ${response.status}`);
      // Update DB: status = 'sent'
    }
  }
  ```

---

## Node 1: gatherContext

**Where:** First node in LangGraph StateGraph
**Purpose:** Fetch file contents, classify error, search RAG, build prompt context

### Edge cases to handle at this node:

- [ ] **EC-04: Fresh pull between retries** — Always use latest code on retry
  ```
  MUST IMPLEMENT:

  if (state.attemptNumber > 1) {
    // Re-fetch latest commit SHA from default branch
    const latestSha = await githubService.getLatestCommitSha(repo, defaultBranch);

    // Re-fetch latest pipeline logs (they may have changed)
    const latestRun = await webhookEventsRepository.findRecentPipelineRuns(commitId, 1);
    if (latestRun[0]?.extractedLogSnippet) {
      const freshParsed = logParserService.parseLog(latestRun[0].extractedLogSnippet);
      state.errorSnippet = freshParsed.errorSnippet;
      state.affectedFile = freshParsed.affectedFile;
    }
  }

  Rule: WITHIN an attempt → work on snapshot (don't re-pull mid-fix)
        BETWEEN attempts → ALWAYS pull fresh code and fresh logs
  ```

- [ ] **EC-10: Cascading error awareness** — Provide root-cause hints in context
  ```
  MUST IMPLEMENT:

  When classifying the error:
  1. Parse all error lines from the snippet
  2. If 3+ error lines reference the SAME missing symbol/module:
     state.errorSnippet = `[ROOT CAUSE HINT: ${count} errors reference missing ` +
       `symbol "${symbol}" from module "${module}". Fix the source, not consumers.]\n` +
       state.errorSnippet;

  This gives Claude a hint without requiring complex clustering logic.
  ```

- [ ] **EC-17: Cross-file import context** — Fetch all files importing affected module
  ```
  SHOULD IMPLEMENT:

  When errorTypeCode is 'IMPORT_ERROR' or 'EXPORT_ERROR':
  1. Identify source module from error message
  2. Search repo tree for files that import from source module:
     const tree = await githubService.getRepoTree(installationId, owner, repo, sha);
     // Filter .ts/.js files, fetch those that import from affected module
     // Limit to 5 files to stay within token budget
  3. Add to state.fileContents

  This ensures Claude sees all consumers, not just the one that errored.
  ```

- [ ] **EC-28: Monorepo scope detection** — Identify which package the error belongs to
  ```
  SHOULD IMPLEMENT:

  1. Check if repo has workspace config (package.json "workspaces", pnpm-workspace.yaml)
  2. If monorepo, extract package scope from affectedFile:
     e.g., "packages/api/src/auth.ts" → scope = "packages/api"
  3. Store in state: state.monorepoScope = scope
  4. Pass to prompt builder as additional context
  ```

- [ ] **Secret scrubbing** — Scrub all file contents before passing to LLM
  ```
  MUST IMPLEMENT:

  for (const [path, content] of Object.entries(state.fileContents)) {
    state.fileContents[path] = secretScrubberService.scrub(content).cleaned;
  }
  state.errorSnippet = secretScrubberService.scrub(state.errorSnippet).cleaned;
  ```

- [ ] **EC-33: GitHub token singleflight** — Prevent thundering herd on token refresh
  ```
  MUST IMPLEMENT (P1):

  All GitHub API calls in gatherContext use installation tokens.
  If 10 concurrent jobs hit an expired token, they all race to refresh.

  Fix in GithubAppProvider.getInstallationToken():

  private refreshPromises = new Map<string, Promise<string>>();

  async getInstallationToken(installationId: string): Promise<string> {
    const cached = this.tokenCache.get(installationId);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      return cached.token;
    }

    // Singleflight: reuse in-flight refresh
    const inflight = this.refreshPromises.get(installationId);
    if (inflight) return inflight;

    const promise = this.doRefreshToken(installationId);
    this.refreshPromises.set(installationId, promise);
    try {
      return await promise;
    } finally {
      this.refreshPromises.delete(installationId);
    }
  }
  ```

- [ ] **EC-35: Smart log extraction** — Capture first AND last error locations
  ```
  SHOULD IMPLEMENT (P1):

  Enhance extractErrorSnippet() in LogParserService:

  const firstError = lines.findIndex(isErrorLine);
  const lastError = lines.findLastIndex(isErrorLine);

  if (lastError !== firstError && lastError - firstError > 200) {
    // Errors span large range — include both bookends
    return [
      ...lines.slice(Math.max(0, firstError - 20), firstError + 30),
      '... [TRUNCATED] ...',
      ...lines.slice(Math.max(0, lastError - 20), lastError + 30),
    ].join('\n');
  }
  ```

- [ ] **EC-43: Vector memory staleness** — Time-decay on RAG results
  ```
  SHOULD IMPLEMENT (P2):

  When searching vector memory for similar fixes:

  // In VectorMemoryRepository.findSimilar():
  // After cosine similarity search, apply staleness decay:
  const results = rawResults.map(entry => {
    const ageMonths = (Date.now() - entry.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000);
    const decayFactor = Math.max(0.5, 1.0 - (ageMonths * 0.02));  // 2% per month, min 50%

    // Also penalize framework version mismatch
    const versionPenalty = entry.frameworkVersion !== currentFrameworkVersion ? 0.8 : 1.0;

    return {
      ...entry,
      adjustedSimilarity: entry.rawSimilarity * decayFactor * versionPenalty,
    };
  });

  // Sort by adjustedSimilarity, return top-K
  results.sort((a, b) => b.adjustedSimilarity - a.adjustedSimilarity);

  Schema additions to vector_memory:
    framework_version VARCHAR(50)   -- e.g., 'nestjs@11.0'
    language_version VARCHAR(50)    -- e.g., 'typescript@5.9'
  ```

---

## Node 2: diagnoseAndFix

**Where:** Second node — calls OpenRouter/Claude
**Purpose:** Send structured prompt, receive JSON diagnosis + diff

### Edge cases to handle at this node:

- [ ] **EC-08: Multiple errors in prompt** — Claude must see all errors
  ```
  ALREADY HANDLED BY DESIGN:
  - errorSnippet contains up to 50 error lines (all errors from the run)
  - fileContents includes multiple files
  - Claude's output allows files_modified[] with multiple files
  - OUTPUT_SCHEMA supports multi-file unified diff

  No change needed — the prompt structure already supports this.
  ```

- [ ] **EC-11: Structural fix guidance** — Guide Claude toward root-cause fix
  ```
  HANDLED BY PROMPT:
  prompt-builder.service.ts already includes:
  - "Fix ONLY the reported error"
  - "Only include files that require changes in the diff"

  ENHANCEMENT: Add to system prompt:
  "If the SAME fix pattern appears in 3+ files, consider a STRUCTURAL
   solution instead (shared type, re-export, source module fix)."
  ```

- [ ] **EC-26: Version conflict early bail** — Low confidence for unresolvable conflicts
  ```
  MUST IMPLEMENT:

  After receiving Claude's response:
  if (state.errorTypeCode === 'DEPENDENCY_VERSION_CONFLICT' && output.confidence < 0.7) {
    // Version conflicts need higher confidence — escalate early
    state.finalStatus = 'escalate';
    return state;
  }
  ```

- [ ] **Token budget tracking** — Record usage for cost tracking
  ```
  MUST IMPLEMENT:

  After LLM call:
  await costTrackingService.recordUsage({
    organizationId, repositoryId,
    inputTokens: response.usage.prompt_tokens,
    outputTokens: response.usage.completion_tokens,
  });

  // Check if we exceeded per-job token budget
  const totalUsed = state.previousAttempts.reduce((sum, a) => sum + a.totalTokens, 0)
    + response.usage.total_tokens;
  if (totalUsed > config.agent.tokenBudgetPerJob) {
    state.finalStatus = 'escalate'; // budget_exceeded
    return state;
  }
  ```

- [ ] **LLM response parsing** — Handle malformed JSON from Claude
  ```
  MUST IMPLEMENT:

  try {
    const parsed = JSON.parse(responseText) as ClaudeFixOutput;
    state.claudeOutput = parsed;
  } catch {
    // Claude returned invalid JSON — count as failed attempt
    this.logger.error('Failed to parse LLM response as JSON');
    state.claudeOutput = {
      can_fix: false,
      cannot_fix_reason: 'LLM returned malformed JSON response',
      diagnosis: '', fix_strategy: '', confidence: 0, diff: '', files_modified: [],
    };
  }
  ```

- [ ] **EC-38: Per-node Jaeger spans** — Trace each LangGraph node
  ```
  SHOULD IMPLEMENT (P1):

  At diagnoseAndFix node (and all other nodes):

  const span = tracer.startSpan(`healops.node.diagnoseAndFix`, { childOf: parentSpan });
  span.setTag('job.id', state.jobId);
  span.setTag('attempt.number', state.attemptNumber);
  span.setTag('error.type', state.errorTypeCode);

  try {
    // ... LLM call ...
    span.setTag('confidence', output.confidence);
    span.setTag('can_fix', output.can_fix);
    span.setTag('tokens.input', response.usage.prompt_tokens);
    span.setTag('tokens.output', response.usage.completion_tokens);
  } finally {
    span.finish();
  }

  ```

- [ ] **EC-38: Structured audit events** — Write to healops_audit_logs after each node
  ```
  SHOULD IMPLEMENT (P1):

  After each LangGraph node completes, write a structured audit event:

  await this.auditLogRepository.createAuditLog({
    entityType: 'job',
    entityId: state.jobId,
    action: 'node_completed',
    actorType: 'system',
    metadata: {
      node: nodeName,                          // e.g., 'diagnoseAndFix'
      attemptNumber: state.attemptNumber,
      durationMs: Date.now() - nodeStartTime,
      // Node-specific attributes:
      // diagnoseAndFix: confidence, can_fix, tokens used
      // qualityGate: violations list, passed boolean
      // runPreCheck: buildStatus, error count
      // pushBranch: branch name, files pushed
    },
  });

  This enables dashboard queries like:
  "Show me all quality gate rejections in the last 7 days grouped by violation type"
  ```

---

## Node 3: qualityGate

**Where:** Third node — deterministic validation
**Service:** `QualityGateService.validate()`
**File:** `repair-agent/services/quality-gate.service.ts`

### Edge cases to handle at this node:

- [x] **EC-14: Suppress with @ts-ignore/any** — Prohibited pattern detection
  ```
  IMPLEMENTED: quality-gate.service.ts:22-30
  7 patterns + empty catch detection. 32 unit tests.
  ```

- [x] **EC-21: Same bad fix repeated** — Circular fix detection
  ```
  IMPLEMENTED: quality-gate.service.ts:111-118
  SHA-256 fingerprint comparison against previousFixFingerprints
  ```

- [ ] **EC-13: Test assertion change detection** — Catch when agent only changes assertions
  ```
  MUST IMPLEMENT in quality-gate.service.ts:

  // After existing checks, add:

  // 11. Test assertion-only change detection
  if (ctx.errorTypeCode === 'TEST_FAILURE') {
    const implFiles = output.files_modified.filter(
      f => !/\.(spec|test)\.(ts|js|tsx|jsx)$/.test(f)
    );
    const testFiles = output.files_modified.filter(
      f => /\.(spec|test)\.(ts|js|tsx|jsx)$/.test(f)
    );
    if (testFiles.length > 0 && implFiles.length === 0) {
      violations.push(
        'Fix modifies only test files without changing implementation. ' +
        'For TEST_FAILURE errors, prefer fixing the implementation code.'
      );
    }
  }
  ```

- [ ] **EC-15: Dependency version sanity** — Check for suspicious versions
  ```
  SHOULD IMPLEMENT in quality-gate.service.ts:

  // 12. Dependency version sanity check
  if (touchesPackageJson && DEPENDENCY_ERROR_TYPES.has(ctx.errorTypeCode)) {
    const preReleaseVersions = output.diff.match(/^\+.*"(0\.\d+\.\d+)"/gm);
    if (preReleaseVersions && preReleaseVersions.length > 0) {
      violations.push('Adds dependency with pre-1.0 version — likely incorrect');
    }
  }
  ```

- [ ] **EC-16/27: Lockfile consistency** — Flag package.json changes without lockfile
  ```
  MUST IMPLEMENT in quality-gate.service.ts:

  // 13. Lockfile consistency check
  if (touchesPackageJson) {
    const touchesLockfile = output.files_modified.some(f =>
      f.endsWith('package-lock.json') ||
      f.endsWith('yarn.lock') ||
      f.endsWith('pnpm-lock.yaml')
    );
    if (!touchesLockfile) {
      violations.push(
        'Modifies package.json but lockfile not updated. ' +
        'Lockfile regeneration required.'
      );
    }
  }
  ```

- [ ] **EC-20: Oscillation detection** — Same files modified as N-2 attempt
  ```
  SHOULD IMPLEMENT in quality-gate.service.ts:

  // 14. Oscillation detection (requires previousFilesModified in context)
  if (ctx.previousFilesModified && ctx.previousFilesModified.length >= 2) {
    const currentFiles = new Set(output.files_modified);
    const attemptNMinus2 = new Set(
      ctx.previousFilesModified[ctx.previousFilesModified.length - 2] ?? []
    );
    const overlap = [...currentFiles].filter(f => attemptNMinus2.has(f));
    if (overlap.length > 0 && overlap.length === currentFiles.size) {
      violations.push(
        'Potential oscillation — modifying same files as two attempts ago'
      );
    }
  }
  ```

- [ ] **EC-28: Monorepo scope validation** — Package.json in wrong scope
  ```
  SHOULD IMPLEMENT in quality-gate.service.ts:

  // 15. Monorepo scope check (requires monorepoScope in context)
  if (ctx.monorepoScope && touchesPackageJson) {
    const wrongScope = output.files_modified.some(f =>
      f.endsWith('package.json') && !f.startsWith(ctx.monorepoScope)
    );
    if (wrongScope) {
      violations.push(
        `Modifies package.json outside error scope (${ctx.monorepoScope})`
      );
    }
  }
  ```

### Updated QualityGateContext interface:

```typescript
interface QualityGateContext {
  errorTypeCode: string;
  previousFixFingerprints: string[];
  previousFilesModified?: string[][];  // NEW: per-attempt file lists
  monorepoScope?: string;              // NEW: package scope for monorepos
}
```

---

## Node 4: runPreCheck

**Service:** `ValidatorService.runPreCheck()`
**File:** `validator/validator.service.ts`

### Edge cases to handle at this node:

- [ ] **EC-12: Build + test validation** — Actually run compiler and tests
  ```
  MUST IMPLEMENT (currently TODO stub):

  async runPreCheck(input: PreCheckInput): Promise<PreCheckOutput> {
    let buildPassed = false;
    let buildOutput = '';

    switch (input.language) {
      case 'typescript': {
        // 1. Write patched files to temp directory
        // 2. Run: npx tsc --noEmit --skipLibCheck
        // 3. Capture stdout/stderr
        const result = await this.execInSandbox('npx tsc --noEmit --skipLibCheck', tempDir);
        buildPassed = result.exitCode === 0;
        buildOutput = result.stderr;
        break;
      }
      case 'python': {
        const result = await this.execInSandbox(
          `python -m py_compile ${affectedFiles.join(' ')}`, tempDir);
        buildPassed = result.exitCode === 0;
        buildOutput = result.stderr;
        break;
      }
      case 'go': {
        const result = await this.execInSandbox('go build ./...', tempDir);
        buildPassed = result.exitCode === 0;
        buildOutput = result.stderr;
        break;
      }
    }

    // Record result
    await this.jobsRepository.createValidation({
      attemptId: input.attemptId,
      stage: 'pre_check',
      buildStatus: buildPassed ? 'success' : 'failed',
      testStatus: 'skipped',  // Tests run in CI, not pre-check
      buildLogExcerpt: buildOutput.slice(0, 8000),
    });

    return { passed: buildPassed, buildOutput, errorMessage: buildPassed ? '' : buildOutput };
  }
  ```

- [ ] **EC-16/27: Lockfile regeneration** — Run package manager after package.json change
  ```
  SHOULD IMPLEMENT (v2 — requires sandbox):

  For v1: Quality gate at Node 3 already flags this.
  Agent will set can_fix: false if lockfile regen is needed.

  For v2: In the sandbox, after applying patch:
  if (patchTouchesPackageJson) {
    await this.execInSandbox('npm install --package-lock-only', tempDir);
    // Read updated lockfile
    // Include in the diff before pushing
  }
  ```

### If pre-check FAILS:

```
→ Do NOT proceed to pushBranch
→ Record validation as failed
→ Check: attemptNumber < maxRetries?
   YES → Go back to Node 2 (diagnoseAndFix) with pre-check error as context:
         state.previousAttempts.push({
           attemptNumber: state.attemptNumber,
           diagnosis: state.claudeOutput.diagnosis,
           fixStrategy: state.claudeOutput.fix_strategy,
           confidence: state.claudeOutput.confidence,
           diffContent: state.claudeOutput.diff,
           validationError: preCheckResult.buildOutput,
           stage: 'pre_check',
         });
         state.attemptNumber++;
   NO  → Go to Node 8 (escalate) with full attempt history
```

---

## Node 5: pushBranch

**Where:** Push the fix to a `healops/fix/{jobId}` branch on GitHub
**Service:** `GithubService.createBranch()` + `GithubService.pushFiles()`

### Edge cases to handle at this node:

- [ ] **EC-01 Checkpoint 2: Is pipeline still failing?** — Check before push
  ```
  MUST IMPLEMENT:

  // Before creating/pushing the branch:
  const isStillFailing = await this.isPipelineStillFailing(repo);
  if (!isStillFailing) {
    await this.jobsRepository.updateJobStatus(state.jobId, 'aborted');
    await this.slackService.notify(state.jobId, 'user_fixed',
      'ℹ️ Pipeline now green. Agent standing down — discarding fix.');
    state.finalStatus = 'aborted';
    return state;
  }
  ```

- [ ] **EC-05: Rebase check — new commits since agent started?**
  ```
  MUST IMPLEMENT:

  // Fetch current HEAD of default branch
  const currentMainSha = await githubService.getLatestCommitSha(repo, defaultBranch);

  if (currentMainSha !== state.startedAtCommitSha) {
    this.logger.warn('Main branch has moved forward since job started');

    // Option A (v1 — simple): Abort attempt, retry with fresh code
    state.previousAttempts.push({ ...currentAttempt, validationError: 'Main branch moved' });
    state.attemptNumber++;
    // Go back to gatherContext with fresh state

    // Option B (v2): Attempt merge via GitHub API
    // POST /repos/{owner}/{repo}/merges { base: agentBranch, head: defaultBranch }
    // If 201 → re-run pre-check → continue
    // If 409 (conflict) → abort attempt, retry fresh
  }
  ```

- [x] **EC-22: Branch name collision** — Handle pre-existing branch
  ```
  IMPLEMENTED: github.service.ts:104-106
  createBranch() returns true if branch already exists (idempotent).
  ```

- [ ] **EC-24: Merge conflict detection before PR** — Verify branch is mergeable
  ```
  SHOULD IMPLEMENT:

  // After push, before creating PR:
  // Use GitHub merge API as dry run (don't actually merge)
  try {
    await octokit.repos.merge({
      owner, repo,
      base: defaultBranch,
      head: agentBranch,
      commit_message: 'healops: merge check (dry run)',
    });
    // If we get here, merge is possible — delete the test merge commit
    // Actually: GitHub doesn't support dry-run merges.
    // Alternative: check PR mergeable status after creation (at Node 7)
  } catch (e) {
    if (e.status === 409) {
      this.logger.warn('Branch has merge conflicts with main');
      // Count as failed attempt → retry with fresh code
    }
  }
  ```

---

## Node 6: waitForValidation

**Where:** Suspend execution until GitHub Actions completes on the fix branch
**Trigger:** Validation callback via `POST /v1/healops/webhooks/validation-complete`

### Edge cases to handle at this node:

- [ ] **EC-09: Fix passed but revealed hidden error**
  ```
  MUST IMPLEMENT:

  When validation callback arrives:
  if (validationResult.status === 'failure') {
    // Parse the NEW error from validation logs
    const newParsed = logParserService.parseLog(validationResult.buildLog + validationResult.testLog);
    const newErrorHash = hashError(newParsed.errorSnippet);
    const originalErrorHash = state.originalErrorHash;

    if (newErrorHash !== originalErrorHash) {
      // DIFFERENT error — our fix worked for original but revealed new error
      this.logger.log('Fix worked for original error but revealed a new error');

      // Feed new error to next attempt
      state.previousAttempts.push({
        ...currentAttempt,
        validationError: `Original fix worked, but revealed new error: ${newParsed.errorSnippet}`,
        stage: 'runner',
      });
      state.errorSnippet = newParsed.errorSnippet;  // Update to NEW error
      state.affectedFile = newParsed.affectedFile;
      state.attemptNumber++;
      // Go back to Node 2 with enriched context
    } else {
      // SAME error — fix didn't actually work
      state.previousAttempts.push({
        ...currentAttempt,
        validationError: validationResult.buildLog,
        stage: 'runner',
      });
      state.attemptNumber++;
      // Go back to Node 1 (gatherContext) with fresh pull
    }
  }
  ```

- [ ] **EC-12: Build passed but tests failed**
  ```
  HANDLED BY ABOVE — the validation callback includes both buildLog and testLog.
  If build passed but tests failed, validationResult.status is still 'failure'.
  The new error snippet will contain the test failure details.
  Claude receives: "Your fix compiled, but broke these tests: {testLogExcerpt}"
  ```

- [ ] **Timeout handling** — What if GitHub Actions never calls back?
  ```
  MUST IMPLEMENT:

  Set a BullMQ job timeout or delayed job:
  - If no callback within 30 minutes → check workflow status via API
  - If workflow is still running → wait another 15 minutes
  - If workflow completed but callback was lost → fetch result directly
  - If workflow never started → escalate with reason 'validation_timeout'
  ```

- [ ] **EC-31: Timeout via BullMQ delayed job** — Prevent stuck jobs
  ```
  MUST IMPLEMENT (P0):

  When entering waitForValidation node, schedule a timeout:

  await repairQueue.add('validation-timeout', { jobId: state.jobId }, {
    delay: 30 * 60 * 1000,  // 30 minutes
    jobId: `timeout:${state.jobId}`,  // Dedup key
  });

  Timeout processor:
  async processTimeout(job: Job<{ jobId: string }>): Promise<void> {
    const healopsJob = await jobsRepository.findJobById(job.data.jobId);
    if (healopsJob.lastCompletedNode !== 'waitForValidation') return;  // Already moved on

    const status = await githubService.getLatestWorkflowStatus(...);
    if (status === 'success' || status === 'failure') {
      // Callback was lost — manually process result
      await this.resumeWithValidationResult(job.data.jobId, status);
    } else {
      // Still running — wait another 15 minutes
      await repairQueue.add('validation-timeout', { jobId: job.data.jobId }, {
        delay: 15 * 60 * 1000,
      });
    }
  }
  ```

- [ ] **EC-31: Race condition prevention** — Redis rendezvous point
  ```
  MUST IMPLEMENT (P0):

  Callback may arrive BEFORE the node starts listening. Use Redis:

  // When pushing branch (before waitForValidation):
  await redis.set(`healops:validation:${jobId}`, 'waiting', 'EX', 3600);

  // When callback arrives (from webhook endpoint):
  await redis.set(`healops:validation:${jobId}`, JSON.stringify(result), 'EX', 3600);

  // waitForValidation node polls Redis:
  async pollForResult(jobId: string): Promise<ValidationResult | null> {
    const maxWaitMs = 30 * 60 * 1000;
    const intervalMs = 10_000;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const stored = await redis.get(`healops:validation:${jobId}`);
      if (stored && stored !== 'waiting') {
        return JSON.parse(stored) as ValidationResult;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    return null;  // Timeout — handled by BullMQ delayed job
  }
  ```

- [ ] **EC-37: Validation callback idempotency** — Prevent double-processing
  ```
  MUST IMPLEMENT (P0):

  In the validation callback endpoint:

  async processValidationCallback(input: ValidationCallbackInput): Promise<void> {
    // Option A: Redis NX (fastest)
    const dedup = await redis.set(
      `healops:callback:${input.runId}`, '1', 'NX', 'EX', 3600
    );
    if (!dedup) {
      this.logger.debug(`Duplicate validation callback ignored: ${input.runId}`);
      return;
    }

    // Option B: DB uniqueness (alternative)
    // const existing = await jobsRepository.findValidationByRunId(input.runId);
    // if (existing) return;

    // ... process normally ...
  }
  ```

---

## Node 7: createPR

**Service:** `PullRequestService.createDraftPr()`
**File:** `github/services/pull-request.service.ts`

### Edge cases to handle at this node:

- [ ] **EC-01 Checkpoint 3: Is pipeline still failing?** — Final check before PR
  ```
  MUST IMPLEMENT:

  const isStillFailing = await this.isPipelineStillFailing(repo);
  if (!isStillFailing) {
    // Delete the remote branch we pushed
    await githubService.deleteBranch(installationId, owner, repo, agentBranch);
    await this.jobsRepository.updateJobStatus(state.jobId, 'aborted');
    await this.slackService.notify(state.jobId, 'user_fixed',
      'ℹ️ Pipeline now green before PR creation. Agent standing down.');
    return;
  }
  ```

- [ ] **EC-23: Duplicate PR for same error** — Check for existing open PR
  ```
  MUST IMPLEMENT:

  Before creating PR:
  // Check if there's already an open HealOps PR for this same error
  // (from a previous job that fixed the same errorHash)
  const failure = await failuresRepository.findFailureById(state.failureId);
  if (failure?.errorHash) {
    // Query: any open PR whose job's failure has the same errorHash?
    const existingPr = await pullRequestsRepository.findOpenPrByErrorHash(failure.errorHash);
    if (existingPr) {
      // Close old PR as superseded
      await pullRequestsRepository.supersedePullRequest(existingPr.id, latestCommitSha);
      // Close on GitHub too
      await githubService.closePr(installationId, owner, repo, existingPr.externalPrId,
        'Superseded by newer fix attempt.');
    }
  }
  ```

- [ ] **EC-25: Target branch validation** — Verify target branch exists
  ```
  MUST IMPLEMENT:

  let targetBranch = repo.defaultBranch ?? 'main';
  try {
    await octokit.git.getRef({ owner, repo: repoName, ref: `heads/${targetBranch}` });
  } catch (e) {
    if (e.status === 404) {
      // Fall back to whatever GitHub says is the default
      const { data } = await octokit.repos.get({ owner, repo: repoName });
      targetBranch = data.default_branch;
      this.logger.warn(`Original target branch gone. Using ${targetBranch}`);
    }
  }
  ```

- [ ] **EC-03: Add healops-agent label** — For cron job to find agent PRs
  ```
  MUST IMPLEMENT:

  After creating PR:
  await octokit.issues.addLabels({
    owner, repo: repoName,
    issue_number: prNumber,
    labels: ['healops-agent'],
  });
  ```

- [ ] **EC-03: PR description footer** — Warn about auto-close
  ```
  MUST IMPLEMENT:

  PR body must include:
  "⚠️ This PR was created by HealOps and will auto-close if the issue is
   resolved on the target branch."
  ```

- [ ] **Store fix in vector memory** — RAG for future similar errors
  ```
  MUST IMPLEMENT:

  After PR is created successfully:
  await vectorMemoryRepository.createEntry({
    repositoryId: state.repositoryId,
    jobId: state.jobId,
    errorEmbedding: await getEmbedding(state.errorSnippet),  // OpenAI embedding
    contextHash: hashContext(state.errorSnippet, state.language, state.errorTypeCode),
    failureType: state.errorTypeCode,
    language: state.language,
    successfulPatch: state.patchDiff,
    confidence: state.claudeOutput.confidence,
  });
  ```

- [ ] **Slack: PR created notification**
  ```
  MUST IMPLEMENT:

  await this.slackService.notify(state.jobId, 'pr_created',
    `✅ Fix applied — PR #${prNumber} ready for review: ${prUrl}`);
  ```

---

## Node 8: escalate

**Service:** `EscalationService.escalate()`
**File:** `github/services/escalation.service.ts`

### Edge cases to handle at this node:

- [ ] **EC-19: Rich escalation context** — Include all attempt diffs in GitHub Issue
  ```
  MUST IMPLEMENT:

  Enhance buildIssueBody() to include:
  1. Original error snippet (truncated to 2000 chars)
  2. For EACH attempt:
     - Attempt number
     - Diagnosis
     - Fix strategy
     - Result (what went wrong)
     - Diff attempted (in collapsible <details> block)
  3. Recommended next steps based on escalation type

  See EDGE-CASES.md EC-19 for the full buildIssueBody() implementation.
  ```

- [ ] **EC-20: Oscillation escalation** — Flag oscillation in issue
  ```
  SHOULD IMPLEMENT:

  If escalationType === 'circular_fix' and oscillation was detected:
  Add to issue body:
  "### Oscillation Detected
   The agent's fixes were contradictory — fixing file A broke file B,
   and fixing file B broke file A. This suggests a deeper architectural
   issue that requires human judgment."
  ```

- [x] **Cooldown creation** — Prevent re-triggering same error
  ```
  IMPLEMENTED: escalation.service.ts:51-58
  24-hour cooldown created for repositoryId + branchName + failureType
  ```

- [ ] **Slack: Escalation notification**
  ```
  MUST IMPLEMENT:

  await this.slackService.notify(state.jobId, 'escalated',
    `🚨 Agent failed after ${state.attemptNumber} attempts — ` +
    `human intervention needed.\n` +
    `Error: ${state.errorTypeCode}\n` +
    `Reason: ${escalationType}\n` +
    `Issue: ${issueUrl}`);
  ```

---

## Retry Edge (between nodes)

**Where:** Decision logic after any node failure
**Purpose:** Route to retry or escalate

### Edge cases to handle in retry logic:

- [ ] **EC-18: Contradictory fix prevention** — Pass retry history to prompt
  ```
  ALREADY HANDLED BY DESIGN:
  - prompt-builder.service.ts:131-148 includes buildRetryHistory()
  - Each previous attempt's diagnosis, strategy, and diff are shown
  - Claude is instructed: "Do NOT repeat a fix strategy that already failed"

  ENHANCEMENT: Add previous files_modified to QualityGateContext
  for oscillation detection (EC-20).
  ```

- [ ] **Max retry check**
  ```
  MUST IMPLEMENT:

  if (state.attemptNumber > config.agent.maxRetries) {
    state.finalStatus = 'escalate';
    // Route to Node 8 (escalate)
  } else {
    state.finalStatus = 'retry';
    // Route back to Node 1 (gatherContext) for fresh pull
  }
  ```

- [ ] **Confidence threshold check**
  ```
  MUST IMPLEMENT:

  if (state.claudeOutput && state.claudeOutput.confidence < config.agent.minConfidence) {
    // Don't waste retries on low-confidence fixes
    state.finalStatus = 'escalate';
    // escalationType = 'low_confidence'
  }
  ```

---

## Cron: Stale PR Cleanup

**Service:** NEW — `StalePrCleanupService`
**Schedule:** Every 15 minutes
**File:** Create in `background/cron/stale-pr-cleanup.service.ts`

### Edge cases handled by this cron:

- [ ] **EC-02: User fixes locally then pushes** — Close PR when main goes green
- [ ] **EC-03: Both user and agent fix same error** — Close redundant PR
- [ ] **EC-07: User pushes commits after PR opened** — Close PR with conflicts
- [ ] **EC-22: Stale branch cleanup** — Delete expired `healops/fix/*` branches

```
MUST IMPLEMENT:

@Cron('*/15 * * * *')  // Every 15 minutes
async checkStalePrs(): Promise<void> {
  // 1. Get all open PRs with label 'healops-agent'
  const openPrs = await pullRequestsRepository.findAllOpenAgentPrs();

  for (const pr of openPrs) {
    const job = await jobsRepository.findJobById(pr.jobId);
    const failure = await failuresRepository.findFailureById(job.failureId);
    const repo = await platformRepository.findRepositoryById(job.repositoryId);

    // ── CHECK 1: Is main green? ──
    const mainStatus = await githubService.getLatestWorkflowStatus(
      repo.githubInstallationId, owner, repoName, repo.defaultBranch);

    if (mainStatus === 'success') {
      // Pipeline is green — close PR
      await closePrWithComment(pr, 'Closing — the issue has been resolved on main.');
      await slackService.notify(pr.jobId, 'user_fixed',
        `ℹ️ PR #${pr.externalPrId} auto-closed — issue resolved on main`);
      continue;
    }

    // ── CHECK 2: Same error still exists? ──
    if (mainStatus === 'failure') {
      const latestLogs = await fetchLatestLogs(repo);
      const currentErrorHash = hashError(latestLogs);

      if (currentErrorHash !== failure.errorHash) {
        // Different error — original issue gone
        await closePrWithComment(pr,
          'Closing — the original error is gone. The current failure is a different issue.');
        continue;
      }
      // Same error — keep PR open
    }

    // ── CHECK 3: PR has merge conflicts? ──
    const prData = await octokit.pulls.get({ owner, repo: repoName, pull_number: pr.externalPrId });
    if (prData.data.mergeable === false) {
      await closePrWithComment(pr,
        'Closing — this PR has merge conflicts with main. ' +
        'If the issue persists, HealOps will create a fresh fix.');
      continue;
    }
  }

  // ── CHECK 4: Stale branch cleanup ──
  const expiredBranches = await platformRepository.findExpiredHealopsBranches();
  for (const branch of expiredBranches) {
    await githubService.deleteBranch(installationId, owner, repoName, branch.name);
    // Remove from DB
  }
}
```

- [ ] **EC-41: Soft-delete cleanup cron** — Prevent index bloat
  ```
  SHOULD IMPLEMENT (P3):

  Add to existing cron scheduler:

  @Cron(CronExpression.EVERY_WEEK)
  async cleanupSoftDeletes(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);  // 90 days

    // Hard-delete soft-deleted records older than 90 days
    await db.delete(vectorMemory).where(
      and(isNotNull(vectorMemory.deletedAt), lt(vectorMemory.deletedAt, cutoff))
    );

    // Rebuild HNSW index after bulk deletes
    await db.execute(sql`REINDEX INDEX idx_vector_memory_embedding`);

    // Clean expired cooldowns
    await costTrackingRepository.deleteExpiredCooldowns();

    this.logger.log('Soft-delete cleanup completed');
  }
  ```

---

## Cross-Cutting: Infrastructure

These edge cases apply across the entire pipeline, not to a single node.

- [ ] **EC-36: Database connection pooling** — Separate pool configs for API vs Worker
  ```
  SHOULD IMPLEMENT (P2):

  In DBService or DBModule configuration:

  // For API process:
  const apiPool = new Pool({
    max: 20, min: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // For Worker process:
  const workerPool = new Pool({
    max: 50, min: 10,  // Higher — worker is DB-intensive
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Export pool metrics to Prometheus:
  // pool.totalCount, pool.idleCount, pool.waitingCount
  ```

- [ ] **EC-38: Prometheus metrics for HealOps** — Full observability layer
  ```
  MUST IMPLEMENT (P1):

  Create HealopsMetricsService with these counters/histograms:

  healops_jobs_total{status, error_type}          — counter per job outcome
  healops_attempts_total{outcome, error_type}      — counter per attempt outcome
  healops_quality_gate_violations_total{violation}  — counter per violation type
  healops_confidence_score{error_type}             — histogram of Claude confidence
  healops_tokens_used{direction}                   — histogram (input/output)
  healops_fix_latency_seconds{error_type}          — histogram per error type
  healops_escalation_total{reason}                 — counter per escalation type

  Call from each LangGraph node via:
    this.metricsService.recordNodeCompletion(nodeName, duration, outcome);
    this.metricsService.recordTokenUsage(inputTokens, outputTokens);
  ```

- [ ] **EC-39: Tenant isolation** — AsyncLocalStorage-based org scoping
  ```
  SHOULD IMPLEMENT (P2):

  @Injectable()
  export class TenantContextService {
    private readonly store = new AsyncLocalStorage<{ organizationId: string }>();

    run<T>(organizationId: string, fn: () => T): T {
      return this.store.run({ organizationId }, fn);
    }

    getOrganizationId(): string {
      const ctx = this.store.getStore();
      if (!ctx) throw new Error('No tenant context — query outside request scope');
      return ctx.organizationId;
    }
  }

  // Middleware sets context from JWT/API key:
  return tenantContext.run(orgId, () => next.handle());

  // ALL repository queries MUST scope by org:
  async findRepositories(): Promise<Repository[]> {
    const orgId = this.tenantContext.getOrganizationId();
    return this.db.select().from(repositories).where(eq(repositories.organizationId, orgId));
  }
  ```

- [ ] **EC-44: Secret scrubber test vectors** — Comprehensive CI gate
  ```
  SHOULD IMPLEMENT (P2):

  Create test-vectors/secret-patterns.ts with patterns for:
  - AWS (Access Key, Secret Key)
  - GitHub (PAT classic, fine-grained, App token)
  - Anthropic / OpenAI API keys
  - Database URLs (PostgreSQL, Redis)
  - Private keys (RSA, EC)
  - JWT / Bearer tokens
  - Slack tokens
  - Negative cases (normal code, short hex strings)

  MISSING PATTERNS to add to secret-scrubber.ts:
  - Anthropic keys: /sk-ant-[\w-]+/g
  - AWS access keys: /AKIA[0-9A-Z]{16}/g
  - AWS secret keys: /[A-Za-z0-9/+=]{40}/ (near AWS context)
  - Slack tokens: /xox[baprs]-[\w-]+/g

  Run as part of unit test suite. Any new secret pattern discovered
  in production should be added as a test vector + scrubber pattern.
  ```

- [ ] **EC-45: SLA/SLO definitions** — Performance targets
  ```
  SHOULD IMPLEMENT (P3):

  Define and instrument:
  | Metric                  | SLO Target | Prometheus Query |
  |-------------------------|-----------|-----------------|
  | Time to first attempt   | < 5 min   | healops_fix_latency_seconds{quantile="0.95"} |
  | Fix success rate (code) | > 60%     | rate(healops_jobs_total{status="success"}) |
  | Escalation rate         | < 40%     | rate(healops_escalation_total) |
  | Mean time to PR         | < 10 min  | (webhook → pr_created) |
  | Quality gate pass rate  | > 80%     | (attempts passing QG / total) |
  | Agent availability      | 99.9%     | Standard infra monitoring |

  Set Prometheus alerting rules for SLO breaches.
  ```

---

## Cross-Cutting: Queue & DLQ

These edge cases affect the entire queue topology and error handling patterns.

- [ ] **EC-47: GitHub API error propagation** — Stop returning null on errors
  ```
  MUST IMPLEMENT (P1):

  In GithubService — change all methods from swallowing to propagating:

  // BEFORE (dangerous — caller silently continues):
  } catch (error) {
    this.logger.error(`Failed: ${error.message}`);
    return null;
  }

  // AFTER (safe — let BullMQ retry the job):
  } catch (error) {
    if (error.status === 404) {
      // Expected for "file not found" — return null (acceptable)
      return null;
    }
    this.logger.error(`GitHub API error: ${error.message}`);
    throw error;  // Propagate to caller → BullMQ retries the job
  }

  Apply to: createBranch, pushFiles, createPR, createIssue,
  getWorkflowRunLogs, getLatestWorkflowStatus
  Keep null-return only for: getFileContent (404), getRepoTree (404)
  ```

- [ ] **EC-47: Cost tracking error isolation** — Don't crash repair jobs
  ```
  MUST IMPLEMENT (P1):

  In CostTrackingService.recordUsage():

  async recordUsage(input: RecordUsageInput): Promise<void> {
    try {
      await this.costTrackingRepository.upsertMonthlyCost({ ... });
    } catch (error) {
      // Non-fatal — repair should continue even if cost tracking fails
      this.logger.error(`Cost tracking failed (non-fatal): ${error.message}`);
      this.metricsService.incrementCounter('healops_cost_tracking_errors_total');
    }
  }
  ```

- [ ] **EC-48: DLQ processor alerting** — Stop just logging, actually alert
  ```
  MUST IMPLEMENT (P1):

  Enhance DeadLetterProcessor.process():

  async process(job: Job<IDLQFailedJobData>): Promise<void> {
    const { queueName, jobId, failedReason, attemptsMade } = job.data;

    // 1. Persist to DB for querying
    await this.auditLogRepository.createAuditLog({
      entityType: 'dlq', entityId: jobId,
      action: 'job_failed_permanently', actorType: 'system',
      metadata: { queueName, failedReason, attemptsMade },
    });

    // 2. Alert ops for critical queues
    const critical = ['healops-repair', 'webhook'];
    if (critical.includes(queueName)) {
      await this.slackService.notifyOps(
        `DLQ Alert: ${queueName} job ${jobId} failed after ${attemptsMade} attempts`);
    }

    // 3. Prometheus counter
    this.metricsService.incrementCounter('dlq_jobs_total', { queue: queueName });
  }
  ```

- [ ] **EC-49: media-upload queue audit** — Create processor or remove dead queue
  ```
  SHOULD IMPLEMENT (P2):

  1. Search codebase: grep -r "media-upload\|MEDIA_UPLOAD\|addMediaUploadJob" src/
  2. If no callers → remove from QueueName, QUEUE_LIST, and IMediaUploadJob interface
  3. If callers exist → create MediaUploadProcessor with proper error handling
  4. Clean orphaned Redis jobs: queue.obliterate({ force: true })
  ```

---

## Cross-Cutting: Deployment & Operations

- [ ] **EC-50: API version response header** — Track API contract version
  ```
  SHOULD IMPLEMENT (P2):

  @Injectable()
  export class ApiVersionInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const response = context.switchToHttp().getResponse();
      response.setHeader('X-HealOps-API-Version', '1.0.0');
      return next.handle();
    }
  }

  // Register in app.module.ts:
  { provide: APP_INTERCEPTOR, useClass: ApiVersionInterceptor }
  ```

- [ ] **EC-51: Blue/green deployment safety** — BullMQ job versioning
  ```
  SHOULD IMPLEMENT (P3):

  Add version field to all BullMQ job data:
  interface RepairJobData {
    version: number;  // Increment on breaking changes
    jobId: string;
    failureId: string;
  }

  In processor:
  if (job.data.version !== CURRENT_JOB_VERSION) {
    this.logger.warn(`Job version mismatch: ${job.data.version} vs ${CURRENT_JOB_VERSION}`);
    // Backwards-compatible: process normally
    // Breaking change: fail with descriptive error
  }

  In WorkerModule.onModuleDestroy():
  - worker.pause() — stop accepting new jobs
  - Wait for in-flight jobs to finish (30s timeout)
  - Then shutdown
  ```

- [ ] **EC-52: GitHub App permission scope verification** — Fail-fast on missing perms
  ```
  MUST IMPLEMENT (P1):

  In GithubAppProvider.onModuleInit():

  async onModuleInit(): Promise<void> {
    const { permissions } = await this.getInstallationInfo(installationId);
    const required = ['contents', 'pull_requests', 'issues', 'actions'];
    const missing = required.filter(p => !permissions[p]);
    if (missing.length > 0) {
      this.logger.error(`GitHub App missing permissions: ${missing.join(', ')}`);
      throw new Error('Insufficient GitHub App permissions');
    }
    this.logger.log('GitHub App permissions verified');
  }

  Required scopes:
  | Permission     | Access       | Why |
  |---------------|-------------|-----|
  | Contents      | Read & Write | Read files, push branches |
  | Pull requests | Read & Write | Create/close PRs |
  | Issues        | Read & Write | Create escalation issues |
  | Actions       | Read-only    | Workflow status + logs |
  | Checks        | Read-only    | Pipeline status |
  ```

- [ ] **EC-53: Secrets management infrastructure** — Beyond .env files
  ```
  SHOULD IMPLEMENT (P3):

  v1: Startup validation that all required secrets are present
  v2: AWS Secrets Manager / HashiCorp Vault integration

  Document rotation procedures for:
  - GitHub App private key
  - OpenRouter API key
  - Slack webhook URL
  - Database credentials (use AWS RDS auto-rotation)
  ```

---

## AgentState Additions

The `AgentState` interface needs these additions to carry edge case context:

```typescript
export interface AgentState {
  // ── Existing fields ──
  jobId: string;
  failureId: string;
  repositoryId: string;
  attemptNumber: number;
  errorSnippet: string;
  affectedFile: string;
  language: string;
  errorTypeCode: string;
  fileContents: Record<string, string>;
  ragExamples: string[];
  previousAttempts: PreviousAttempt[];
  claudeOutput: ClaudeFixOutput | null;
  patchDiff: string | null;
  preCheckResult: PreCheckResult | null;
  validationResult: ValidationResult | null;
  finalStatus: 'success' | 'escalate' | 'retry' | 'aborted';  // CHANGED: added 'aborted'

  // ── New fields for edge case handling ──
  startedAtCommitSha: string;          // EC-05: track main HEAD when job started
  originalErrorHash: string;           // EC-09: compare against fresh errors
  monorepoScope: string | null;        // EC-28: package scope in monorepos
  previousFilesModified: string[][];   // EC-20: per-attempt file lists for oscillation detection
  organizationId: string;              // Budget tracking
  installationId: string;              // GitHub API calls
  owner: string;                       // GitHub API calls
  repoName: string;                    // GitHub API calls
  defaultBranch: string;               // Target branch

  // ── New fields for infrastructure resilience (EC-29–EC-45) ──
  lastCompletedNode: 'gatherContext' | 'diagnoseAndFix' | 'qualityGate' |
    'runPreCheck' | 'pushBranch' | 'waitForValidation' | null;  // EC-30: crash recovery
  checkpointedAt: Date | null;         // EC-30: when state was last persisted
}
```

---

## Quick Reference: Edge Case → Node Mapping

| EC | Description | Node(s) | Priority |
|----|------------|---------|----------|
| 01 | User fixes before agent | **Processor, Node 5, Node 7** | P0 |
| 02 | User fixes locally, doesn't push | **Cron** | P1 |
| 03 | Both fix same error | **Node 7, Cron** | P1 |
| 04 | User pushes partial fix | **Node 1** | P0 |
| 05 | User pushes new commit mid-fix | **Node 5** | P1 |
| 06 | Two failures back-to-back | **Step 1 (Enqueue)** | P1 |
| 07 | User pushes after PR opened | **Cron** | P1 |
| 08 | Multiple errors in one build | **Step 0 (Webhook), Node 2** | P0 |
| 09 | Fix reveals hidden error | **Node 6** | P2 |
| 10 | Cascading errors | **Node 1** | P1 |
| 11 | Same error across files | **Node 2 (prompt)** | P1 |
| 12 | Fix passes build, breaks test | **Node 4, Node 6** | P0 |
| 13 | Agent fixes assertion not code | **Node 3** | P1 |
| 14 | @ts-ignore / as any | **Node 3** | DONE |
| 15 | Wrong dependency version | **Node 3** | P2 |
| 16 | No lockfile regeneration | **Node 3, Node 4** | P0 |
| 17 | Import/export cross-file | **Node 1** | P2 |
| 18 | Contradictory fix | **Retry edge (prompt)** | P2 |
| 19 | Max retries → escalation | **Node 8** | P1 |
| 20 | Fix oscillation loop | **Node 3** | P2 |
| 21 | Same bad fix repeated | **Node 3** | DONE |
| 22 | Branch name collision | **Node 5** | DONE |
| 23 | Duplicate PRs | **Node 7** | P2 |
| 24 | Merge conflicts | **Node 5, Cron** | P1 |
| 25 | Deleted target branch | **Node 7** | P2 |
| 26 | No valid version resolution | **Node 2** | P2 |
| 27 | No lockfile regeneration | **Node 3, Node 4** | P0 |
| 28 | Monorepo wrong package.json | **Node 1, Node 3** | P3 |
| | | | |
| **Infrastructure & Resilience** | | | |
| 29 | Webhook ingestion SPOF | **Step 0 (Webhook)** | P0 |
| 30 | Agent state crash recovery | **Processor (all nodes)** | P0 |
| 31 | waitForValidation timeout/race | **Node 6** | P0 |
| 32 | TOCTOU race in job dedup | **Step 1 (Enqueue)** | P1 |
| 33 | GitHub token thundering herd | **Node 1, Node 5** | P1 |
| 34 | Worker/API process separation | **Processor** | P0 |
| 35 | CI log size — smart extraction | **Step 0, Node 1** | P1 |
| 36 | DB connection pooling | **Cross-cutting** | P2 |
| 37 | Validation callback idempotency | **Node 6** | P0 |
| 38 | Agent observability (metrics) | **Cross-cutting (all nodes)** | P1 |
| | | | |
| **Enterprise & Operations** | | | |
| 39 | Tenant isolation | **Cross-cutting** | P2 |
| 40 | Superseded job trigger on push | **Step 0 (Webhook)** | P1 |
| 41 | Soft-delete cleanup cron | **Cron** | P3 |
| 42 | Webhook rate limiting | **Step 0 (Webhook)** | P1 |
| 43 | Vector memory staleness | **Node 1** | P2 |
| 44 | Secret scrubber test vectors | **Cross-cutting** | P2 |
| 45 | SLA/SLO definitions | **Cross-cutting** | P3 |
| | | | |
| **Queue & DLQ Infrastructure** | | | |
| 46 | healops-repair DLQ + Bull Board | **Processor** | P0 |
| 47 | Fire-and-forget patterns (Slack, GitHub, cost) | **Cross-cutting** | P0/P1 |
| 48 | DLQ processor real alerting | **Cross-cutting** | P1 |
| 49 | media-upload queue audit | **Cross-cutting** | P2 |
| | | | |
| **Deployment & Operations** | | | |
| 50 | API version response header | **Cross-cutting** | P2 |
| 51 | Blue/green deploy + job versioning | **Cross-cutting** | P3 |
| 52 | GitHub App permission scopes | **Cross-cutting** | P1 |
| 53 | Secrets management infrastructure | **Cross-cutting** | P3 |

---

*Document Version: 3.0*
*This document is the implementation companion to `EDGE-CASES.md`.*
*When implementing a node, handle every checkbox in that node's section.*
*Incorporates 17 architectural findings + 8 queue/DLQ infrastructure gaps (EC-29 through EC-53).*
