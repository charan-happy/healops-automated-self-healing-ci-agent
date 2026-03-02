# HealOps — Edge Case Specification & Implementation Audit

> **53 edge cases** across 10 categories (28 functional + 17 architectural +
> 8 queue/deployment). Each entry documents the scenario, current implementation
> status, code references, and the enhancement spec required to close the gap.

---

## Table of Contents

1. [Category A — Race Conditions: User vs Agent (7)](#category-a--race-conditions-user-vs-agent)
2. [Category B — Same Error, Multiple Causes (4)](#category-b--same-error-multiple-causes)
3. [Category C — Agent Fix Quality (6)](#category-c--agent-fix-quality)
4. [Category D — Retry & Loop (4)](#category-d--retry--loop)
5. [Category E — Git & PR (4)](#category-e--git--pr)
6. [Category F — Dependency-Specific (3)](#category-f--dependency-specific)
7. [Category G — Infrastructure & Resilience (10)](#category-g--infrastructure--resilience)
8. [Category H — Enterprise & Operations (7)](#category-h--enterprise--operations)
9. [Category I — Queue & DLQ Infrastructure (4)](#category-i--queue--dlq-infrastructure)
10. [Category J — Deployment & Operations (4)](#category-j--deployment--operations)
11. [Cross-Cutting Gaps](#cross-cutting-gaps)
12. [Enhancement Priority Matrix](#enhancement-priority-matrix)

---

## Category A — Race Conditions: User vs Agent

### EC-01: User fixes and pushes before agent completes

**Scenario:** Developer pushes a fix to `main` while the agent is mid-diagnosis
or mid-fix. The agent's work becomes redundant.

**Risk:** Wasted compute, unnecessary PR, confusing team notifications.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `GithubService.getLatestWorkflowStatus()` | EXISTS but unused | `github.service.ts` |
| Pre-check checkpoint before diagnosis | MISSING | — |
| Pre-check checkpoint before push | MISSING | — |
| Pre-check checkpoint before PR creation | MISSING | — |
| `ABORTED` job status | MISSING | `agent.ts:30` only has `queued/running/success/failed/escalated/superseded/flaky_skipped/budget_exceeded/circular_fix_detected` |
| Slack "user already fixed" notification | MISSING | `slack.service.ts` has no `user_fixed` type |

**Enhancement Spec:**

```
Service: RepairAgentService (repair-agent.service.ts)
Method:  isPipelineStillFailing(repositoryId, branch) → boolean

Logic:
  1. Call GithubService.getLatestWorkflowStatus(installationId, owner, repo, branch)
  2. If status === 'success' → return false (pipeline is green)
  3. If status === 'failure' → return true
  4. If status === null     → return true (assume still failing, proceed cautiously)

Checkpoints (3 places in the LangGraph state machine):
  CP-1: Before gatherContext node  → if green, set job.status='aborted', reason='USER_FIXED_BEFORE_AGENT'
  CP-2: Before pushBranch node     → if green, discard branch, set job.status='aborted'
  CP-3: Before createPR node       → if green, delete remote branch, set job.status='aborted'

Each checkpoint:
  - Calls isPipelineStillFailing()
  - If false → abort job, send Slack: "Pipeline is now green — someone already fixed it. Agent standing down."
  - If true  → continue

Schema change:
  - Add 'aborted' to jobs.status enum comment (agent.ts:29)
  - No column change needed — varchar(50) already flexible

Slack notification type to add:
  - 'user_fixed' — "ℹ️ Pipeline is now green — someone already fixed it. Agent standing down."
```

---

### EC-02: User fixes locally but doesn't push

**Scenario:** User fixes on their machine. Agent can't know. Agent opens PR.
Later, user pushes their fix. Now there's a redundant open PR.

**Risk:** Stale PRs accumulating, developer confusion.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Cron infrastructure | EXISTS | `background/cron/cron.scheduler.ts` uses `@Cron` decorator |
| PR status tracking | EXISTS | `pull_requests.status` = open/merged/closed/superseded |
| `findOpenPrByTargetBranch()` | EXISTS | `pull-requests.repository.ts:30` |
| `updatePullRequestStatus()` | EXISTS | `pull-requests.repository.ts:43` |
| Auto-stale PR closer cron job | MISSING | Current cron only runs `addDailyMailJob()` |
| Error hash comparison logic | MISSING | — |

**Enhancement Spec:**

```
Service: NEW — StalePrCleanupService (or add to existing cron.scheduler.ts)
Schedule: Every 15 minutes (@Cron('*/15 * * * *'))

Method: checkAndCloseStaleAgentPrs()

Logic:
  FOR each open PR WHERE sourceBranch STARTS WITH 'healops/fix/':

    1. Get the job record for this PR → get failureId → get failure.errorHash
    2. Get the repository → get installationId, owner, repo, defaultBranch
    3. Call GithubService.getLatestWorkflowStatus(installationId, owner, repo, defaultBranch)

    CASE A — Pipeline is GREEN on default branch:
      → Close PR via GitHub API with comment:
        "Closing — the original issue has been resolved on main."
      → Update pull_requests.status = 'closed'
      → Slack: "ℹ️ PR #{prNumber} auto-closed — issue resolved on main"

    CASE B — Pipeline is RED with SAME error hash:
      → Keep PR open (fix still needed)

    CASE C — Pipeline is RED with DIFFERENT error hash:
      → Close PR via GitHub API with comment:
        "Closing — the original error is gone. A new, different error exists."
      → Update pull_requests.status = 'closed'
      → Slack: "ℹ️ PR #{prNumber} auto-closed — original error gone, new error is different"

    CASE D — Cannot determine pipeline status (API error):
      → Skip this PR, retry next cycle

Error hash comparison:
  - Get latest pipeline run → extract logs → run LogParserService.parseLog()
  - Hash with hashError() from common/utils/hash.ts
  - Compare against stored failure.errorHash

Dependencies:
  - GithubService (workflow status check)
  - LogParserService (re-parse latest logs)
  - HealopsPullRequestsRepository (PR status update)
  - FailuresRepository (get original error hash)
  - SlackService (notification)
```

---

### EC-03: Agent creates PR, user also pushes fix to main

**Scenario:** Both agent and user fix the same error independently.
User pushes to main, agent has an open PR. Duplicate fix.

**Risk:** Messy history, confusing team.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| PR label `self-healing-agent` | NOT IMPLEMENTED | Only in concept docs |
| `supersedePullRequest()` repo method | EXISTS | `pull-requests.repository.ts:59` |
| Auto-detection of user fix | MISSING | — |

**Enhancement Spec:**

```
Handled by EC-02's cron job (StalePrCleanupService).

Additional enhancement:
  - When creating PR via PullRequestService.createDraftPr(), always add label: 'healops-agent'
  - PR description must include footer:
    "⚠️ This PR will auto-close if the issue is resolved on main."
  - The cron job from EC-02 queries PRs with this label

GitHub API call to add label:
  octokit.issues.addLabels({ owner, repo, issue_number: prNumber, labels: ['healops-agent'] })
```

---

### EC-04: User pushes partial fix

**Scenario:** Pipeline has 3 errors. User fixes error 1 and pushes. Pipeline
re-runs, now showing only errors 2 and 3. Agent must work on fresh state.

**Risk:** Agent re-fixes error 1 that the user already fixed.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Error hash normalization | EXISTS | `hash.ts:11` — `normaliseErrorText()` strips line numbers, timestamps, SHAs |
| Fresh logs in prompt | EXISTS | `prompt-builder.service.ts:195` — passes latest `errorSnippet` |
| Previous attempt intelligence | EXISTS | `prompt-builder.service.ts:189` — `buildRetryHistory()` |
| "Always pull fresh main between attempts" | NOT ENFORCED | `repair-agent.service.ts` is TODO stub |

**Enhancement Spec:**

```
Rule (enforced in LangGraph orchestrator):
  BETWEEN attempts → ALWAYS:
    1. Fetch latest commit SHA from default branch via GitHub API
    2. Get latest pipeline run status for that commit
    3. Re-parse logs with LogParserService.parseLog()
    4. Compare new error list against previous attempt's errors
    5. Skip errors that no longer appear in fresh logs

Implementation in RepairAgentService.runRepair():
  At the start of each attempt (attemptNumber > 1):
    const latestLogs = await fetchLatestPipelineLogs(repositoryId, branch)
    const freshParsed = logParserService.parseLog(latestLogs)
    const freshErrorHash = hashError(freshParsed.errorSnippet)
    if (freshErrorHash !== originalFailure.errorHash) {
      // Error landscape changed — re-classify, re-diagnose
      agentState.errorSnippet = freshParsed.errorSnippet
      agentState.affectedFile = freshParsed.affectedFile
    }

Key rule: WITHIN an attempt → work on snapshot (no pulling mid-fix)
          BETWEEN attempts → always pull fresh
```

---

### EC-05: User pushes NEW commit while agent is mid-fix

**Scenario:** Agent started fixing commit `abc123`. User pushes `def456` to
main. Agent's fix branch is now behind main.

**Risk:** Agent's PR has merge conflicts or misses context from new commit.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Branch creation from SHA | EXISTS | `github.service.ts:85` — `createBranch(sha)` |
| Latest commit retrieval | EXISTS | `github.service.ts:128` — gets latest commit on branch before push |
| Rebase logic | MISSING | — |
| New-commits-since-start check | MISSING | — |
| Conflict detection | MISSING | — |

**Enhancement Spec:**

```
Service: RepairAgentService (in pushBranch node)
Method:  rebaseAndValidate(agentState) → { success: boolean; conflicted: boolean }

Logic (before pushing fix branch):
  1. Record agentState.startedAtCommitSha when job starts
  2. Before push, fetch current HEAD of default branch:
     const currentMainSha = await githubService.getLatestCommitSha(repo, defaultBranch)
  3. If currentMainSha !== agentState.startedAtCommitSha:
     // Main has moved forward since we started
     a. Attempt to create merge commit via GitHub API:
        POST /repos/{owner}/{repo}/merges
        { base: agentBranch, head: defaultBranch, commit_message: "Merge main into fix branch" }
     b. If merge succeeds (HTTP 201):
        - Re-run pre-check validation on merged state
        - If pre-check passes → continue to push/PR
        - If pre-check fails → count as failed attempt, retry
     c. If merge fails with conflict (HTTP 409):
        - Abort this attempt
        - Count as a failed attempt
        - Log: "Rebase conflict — will retry with fresh code"
        - Next attempt starts from scratch on latest main
  4. If currentMainSha === agentState.startedAtCommitSha:
     // No new commits — proceed normally

Schema addition:
  jobs table: add startedAtCommitSha varchar(40) — the SHA when job began
```

---

### EC-06: Two pipeline failures back-to-back

**Scenario:** Webhook #1 arrives for commit `abc` (syntax error). While agent
processes it, webhook #2 arrives for commit `def` (import error).

**Risk:** Agent overwhelmed, duplicate work, race conditions.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| BullMQ queue (one-at-a-time) | EXISTS | `repair-jobs.service.ts:24` — `@InjectQueue('healops-repair')` |
| Webhook dedup by deliveryId | EXISTS | `github-webhook.service.ts:43` — ON CONFLICT DO NOTHING on `externalEventId` |
| Active job dedup by failureId | EXISTS | `repair-jobs.service.ts:52` — `findActiveJobByFailure()` |
| Pre-check before starting Job #2 | PARTIAL | Uses CP-1 from EC-01 (not yet implemented) |
| Dedup by commit+error hash | MISSING | Two webhooks for same commit + same error both pass current dedup |

**Enhancement Spec:**

```
Enhancement to RepairJobsService.enqueueRepair():
  After existing flaky/cooldown/active-job checks, add:

  // 5. Check for duplicate by error hash on same branch
  const existingFailure = await failuresRepository.findFailureByErrorHash(input.errorHash)
  if (existingFailure) {
    const existingJob = await jobsRepository.findActiveJobByFailure(existingFailure.id)
    if (existingJob) {
      this.logger.warn(`Duplicate error hash on active job: ${input.errorHash}`)
      return existingJob.id  // Return existing job, don't create new
    }
  }

This prevents: two webhooks for the same commit with the same error creating
two separate jobs that both try to fix the same thing.
```

---

### EC-07: Agent opens PR, user pushes more commits before merging

**Scenario:** Agent opens PR #123. Over the next 30 minutes, user pushes
commits A and B to main. Now PR #123 is outdated or has conflicts.

**Risk:** PR can't merge, confusing for reviewers.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| PR `superseded` status | EXISTS | `outputs.ts:34` — `supersededAt`, `supersededByCommit` |
| `supersedePullRequest()` | EXISTS | `pull-requests.repository.ts:59` |
| Merge conflict detection | MISSING | — |
| Auto-close on conflict | MISSING | — |

**Enhancement Spec:**

```
Handled by EC-02's cron job (StalePrCleanupService).

Additional check in the 15-minute cron:
  FOR each open healops PR:
    1. Check mergeable status via GitHub API:
       GET /repos/{owner}/{repo}/pulls/{prNumber}
       → response.mergeable (true/false/null)
       → response.mergeable_state ('clean'/'dirty'/'unstable'/'blocked')

    2. If mergeable_state === 'dirty' (has conflicts):
       → Close PR with comment:
         "Closing — this PR has merge conflicts with latest main.
          If the issue persists, HealOps will create a fresh fix."
       → Update pull_requests.status = 'closed'
       → Slack: "ℹ️ PR #{prNumber} auto-closed — merge conflicts detected"

    3. If mergeable_state === 'clean' → keep open (handled by error hash check)

v1 approach: Do NOT auto-update/rebase the PR. If there's a conflict, close it.
If the pipeline still fails, a new webhook fires → new job → fresh fix.
```

---

## Category B — Same Error, Multiple Causes

### EC-08: Build fails with multiple errors at once

**Scenario:** Pipeline outputs 3 errors: missing import in `auth.ts`, type
error in `user.ts`, syntax error in `config.ts`. Agent must fix all.

**Risk:** Agent only fixes the first error, ignoring the rest.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `failures` table supports multiple per pipeline run | EXISTS | `analysis.ts` — FK to `pipelineRunId` |
| `findFailuresByPipelineRun()` | EXISTS | `failures.repository.ts` |
| `LogParserService.parseLog()` extracts up to 50 error lines | EXISTS | `log-parser.service.ts:52` |
| Multi-failure orchestration | MISSING | One job processes one failure |
| Error grouping / batching | MISSING | — |

**Enhancement Spec:**

```
TWO APPROACHES (v1 chooses Approach A):

APPROACH A — Single Job, Multi-Error Context (RECOMMENDED for v1):
  The agent receives ALL errors from one pipeline run in its prompt.
  Claude generates a single unified diff that fixes all errors.

  Implementation:
    1. GithubWebhookService extracts ALL errors via LogParserService
    2. Creates ONE failure record with the full error snippet (up to 50 lines)
    3. Creates ONE job for that failure
    4. PromptBuilderService.buildPrompt() already sends the full errorSnippet
       which contains all error lines — Claude sees all errors
    5. Claude generates one diff touching multiple files
    6. Quality gate validates the combined diff

  This is the simplest approach. If Claude misses an error, the pipeline
  will fail again after PR merge, and the next webhook triggers a new job
  that sees only the remaining errors.

APPROACH B — Multi-Job (FUTURE — if v1 proves insufficient):
  1. Parse log → extract N distinct errors → create N failure records
  2. Group by root cause (see EC-10)
  3. Create one job per group
  4. Process sequentially via BullMQ
  5. Before each job: re-check if error still exists (fresh logs)

Current prompt context already supports this:
  - errorSnippet contains multiple error lines
  - fileContents is Record<string, string> (multiple files)
  - files_modified is string[] (multiple outputs)

NO SCHEMA CHANGE NEEDED for Approach A.
```

---

### EC-09: Fixing one error reveals a hidden error underneath

**Scenario:** Error A masks Error B at compile time. Agent fixes A, but now B
appears in the next pipeline run.

**Risk:** Agent declares success, but pipeline still fails.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Retry with previous attempt context | EXISTS | `prompt-builder.service.ts:131` — `buildRetryHistory()` |
| Validation stage tracking | EXISTS | `validations` table has `stage: 'pre_check' | 'runner'` |
| Re-diagnosis loop | MISSING | No state graph edge: "fix passed pre-check but runner revealed new errors" |

**Enhancement Spec:**

```
This is NATURALLY HANDLED by the existing webhook-driven architecture:

Flow:
  1. Agent fixes Error A → pushes to branch → creates PR
  2. GitHub Actions runs on the PR branch
  3. If new Error B is discovered in the PR branch CI:
     → GitHub sends a NEW workflow_run webhook with conclusion=failure
     → BUT: this is on a healops/fix/* branch
     → github-webhook.service.ts:74 BLOCKS this (loop prevention)

  Therefore, hidden errors on the FIX BRANCH are handled by:
  - The validation callback (processValidationCallback)
  - If validation fails → agent re-enters retry loop with new error context

Enhancement to LangGraph state machine:
  After pushBranch → waitForValidation:
    IF validation.conclusion === 'failure':
      1. Fetch the new CI logs from the validation run
      2. Parse with LogParserService
      3. Compare error hash with original:
         - SAME error hash → same bug, fix didn't work → retry with feedback
         - DIFFERENT error hash → fix worked for original, but revealed new error
           → Feed new error to Claude as additional context
           → This is attempt N+1 with enriched context:
             "Your fix for Error A worked, but it revealed Error B. Fix Error B."
      4. Apply new fix on top of existing branch (additive)
      5. Push updated branch → re-trigger validation

  Max total attempts = agent.maxRetries (3). Counts across both original
  and revealed errors.
```

---

### EC-10: Cascading errors — one root cause creates 5 symptoms

**Scenario:** `utils/common.ts` fails to export `formatDate()`. Five other
files that import it each produce an IMPORT_ERROR. The root cause is one
missing `export` keyword.

**Risk:** Agent creates 5 separate fixes instead of 1. Wastes tokens,
creates messy diffs.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Error hash dedup on `(pipelineRunId, errorHash)` | EXISTS | `analysis.ts:44` — unique index |
| Flaky failure registry | EXISTS | `analysis.ts:55-83` |
| Root-cause grouping | MISSING | No clustering logic |
| Error relationship detection | MISSING | — |

**Enhancement Spec:**

```
APPROACH: Prompt-level guidance (v1) + future pattern-based grouping.

v1 — Prompt Enhancement:
  Add to SYSTEM_PROMPT_ROLE in prompt-builder.service.ts:

  "8. Cascading Error Awareness
     - If multiple errors reference the SAME missing symbol, module, or export,
       identify the ROOT CAUSE and fix it once.
     - Do NOT apply the same fix to multiple files when a single fix at the
       source would resolve all downstream errors.
     - Example: if 5 files fail with 'Cannot find export X from module Y',
       fix the export in module Y — do NOT patch 5 import statements."

v1 — Quality Gate Enhancement:
  Add to QualityGateService.validate():

  // 11. Repetitive fix detection
  if (output.files_modified.length > 3) {
    // Check if all modified files have the same type of change
    // (e.g., all add the same import line)
    // Flag as warning: "Consider fixing the root cause instead of
    // patching {N} files with the same change"
  }

FUTURE (v2) — Pattern-based grouping:
  After parsing all errors, cluster them:
  1. Extract the "missing symbol" from each error message
  2. If 3+ errors reference the same symbol from the same source module →
     group them under a single "root cause" record
  3. Agent receives the group, not individual errors
  4. Requires: new grouping table or JSON field on failures
```

---

### EC-11: Same error type across multiple files in one commit

**Scenario:** Developer adds a new TypeScript strict mode rule. 8 files now
have type errors. All are TYPE_ERROR but in different files.

**Risk:** Agent makes 8 separate per-file fixes when a structural change
(e.g., adding a shared type definition) would be cleaner.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `files_modified` is array | EXISTS | `agent-state.interface.ts:21` |
| Multi-file `fileContents` in prompt | EXISTS | `prompt-builder.service.ts:157` |
| Structural fix guidance | MISSING | Prompt doesn't guide toward structural solutions |

**Enhancement Spec:**

```
Prompt Enhancement (prompt-builder.service.ts):
  Add to SYSTEM_PROMPT_ROLE, section 6 (Multi-File Awareness):

  "6. Multi-File Awareness
     - Only include files that require changes in the diff.
     - Do NOT return unchanged files.
     - Do NOT rewrite entire files — only the blocks that need to change.
     - If the SAME fix pattern appears in 3+ files, consider a STRUCTURAL
       solution instead:
       a. Add a shared type definition / interface
       b. Fix the source module's type signature
       c. Add a re-export barrel file
     - Prefer one fix at the source over N fixes at the consumers."

No schema changes needed. The multi-file diff output format already
supports this — Claude just needs better guidance.
```

---

## Category C — Agent Fix Quality

### EC-12: Agent's fix passes build but breaks a test

**Scenario:** Agent fixes a type error. `tsc --noEmit` passes. But a unit test
that asserts specific behavior now fails because the fix changed the logic.

**Risk:** Silent regression introduced by the agent.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `validations` table with `buildStatus` + `testStatus` | EXISTS | `agent.ts:129-131` |
| `stage` field: `pre_check` / `runner` | EXISTS | `agent.ts:127` |
| `ValidatorService.runPreCheck()` | EXISTS as stub — returns success always | `validator.service.ts:29` (TODO on line 32) |
| Actual `tsc --noEmit` execution | MISSING | — |
| Actual test execution (`jest`, `pytest`, `go test`) | MISSING | — |
| Feedback loop: test failure → re-diagnose | MISSING | — |

**Enhancement Spec:**

```
Service: ValidatorService (validator.service.ts)
Method:  runPreCheck(input: PreCheckInput) → PreCheckOutput

PHASE 1 — Build Check (must implement):
  switch (input.language) {
    case 'typescript':
      // 1. Create temp directory
      // 2. Clone repo (or use GitHub API to get file tree)
      // 3. Apply patch to temp directory
      // 4. Run: npx tsc --noEmit --skipLibCheck
      // 5. Capture stdout/stderr
      // 6. If exit code 0 → buildStatus = 'success'
      // 7. If exit code != 0 → buildStatus = 'failed', capture errors
      break;

    case 'python':
      // Run: python -m py_compile {affected_files}
      break;

    case 'go':
      // Run: go build ./...
      break;
  }

PHASE 2 — Test Check (run after build passes):
  switch (input.language) {
    case 'typescript':
      // Run: npx jest --bail --no-coverage --findRelatedTests {affected_files}
      // --findRelatedTests runs only tests that import the changed files
      // --bail stops at first failure (fast feedback)
      break;

    case 'python':
      // Run: python -m pytest {test_files} --tb=short -q
      break;

    case 'go':
      // Run: go test ./...
      break;
  }

PHASE 3 — Feedback to Agent:
  If build fails → record validation, return to diagnoseAndFix node with
    buildLogExcerpt as additional context for Claude
  If tests fail → record validation, return to diagnoseAndFix node with
    testLogExcerpt as additional context:
    "Your fix compiled successfully, but it broke these tests: {testLogExcerpt}
     Fix the implementation to pass both the build AND the existing tests."

Record validation result:
  await jobsRepository.createValidation({
    attemptId: input.attemptId,
    stage: 'pre_check',
    buildStatus: buildResult.passed ? 'success' : 'failed',
    testStatus: testResult.passed ? 'success' : 'failed',
    buildLogExcerpt: buildResult.output.slice(0, 8000),
    testLogExcerpt: testResult.output.slice(0, 8000),
    executionTimeMs: elapsed,
  })

DEPENDENCY: Requires a sandboxed execution environment.
  Option A: Docker container per validation (isolated, safe)
  Option B: Temp directory with chroot/namespace isolation
  Option C: GitHub Actions re-run (slower but no infra needed)

  v1 RECOMMENDATION: Use Option C — push to branch, let GitHub Actions
  validate, use the validation callback. Pre-check is "best effort" build
  check only. Full test validation happens in the CI runner.
```

---

### EC-13: Agent fixes the test assertion instead of the actual buggy code

**Scenario:** Test expects `calculateTotal()` to return `100`. Implementation
returns `99` due to a rounding bug. Agent changes the assertion to
`expect(99)` instead of fixing the rounding.

**Risk:** Agent masks bugs, degrades test suite integrity.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Quality gate: test file guard for non-TEST_FAILURE | EXISTS | `quality-gate.service.ts:99-108` — blocks .spec.ts changes unless error is TEST_FAILURE |
| Prompt: "fix implementation, NOT the test" | EXISTS | `prompt-builder.service.ts:34-36` |
| Semantic assertion analysis | MISSING | When error IS TEST_FAILURE, agent CAN modify tests — no semantic check |

**Enhancement Spec:**

```
LAYER 1 — Quality Gate Enhancement (quality-gate.service.ts):
  When errorTypeCode === 'TEST_FAILURE' AND diff modifies test files:

  // 12. Test assertion change detection
  const assertionPatterns = [
    /\.toBe\(/,
    /\.toEqual\(/,
    /\.toStrictEqual\(/,
    /\.toMatchObject\(/,
    /\.toHaveBeenCalledWith\(/,
    /assert\./,
    /expect\(/,
  ];

  // Count assertion changes in diff (lines starting with + or -)
  const diffLines = output.diff.split('\n');
  const changedAssertions = diffLines.filter(line =>
    (line.startsWith('+') || line.startsWith('-')) &&
    !line.startsWith('+++') && !line.startsWith('---') &&
    assertionPatterns.some(p => p.test(line))
  );

  // If ONLY assertions changed (no implementation changes), flag it
  const implFiles = output.files_modified.filter(f => !/\.(spec|test)\.(ts|js|tsx|jsx)$/.test(f));
  if (implFiles.length === 0 && changedAssertions.length > 0) {
    violations.push(
      'Fix modifies only test assertions without changing implementation code. ' +
      'For TEST_FAILURE errors, prefer fixing the implementation.'
    );
  }

LAYER 2 — Prompt Enhancement (prompt-builder.service.ts):
  Already exists. Strengthen with:

  "3. Test Integrity
     - If tests fail, fix the implementation — NOT the test.
     - Do NOT change expected values, mock return values, or assertions
       just to make tests pass.
     - Preserve intended business logic.
     - Exception: if the test itself has a bug (wrong expected value that
       contradicts documented requirements), explain this in the diagnosis
       and set can_fix: false with reason."
```

---

### EC-14: Agent suppresses error with `@ts-ignore` or `any`

**Scenario:** Agent adds `// @ts-ignore` or casts to `any` instead of fixing
the actual type error.

**Risk:** Type safety degradation, error silenced not fixed.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Prohibited patterns in quality gate | **FULLY IMPLEMENTED** | `quality-gate.service.ts:22-30` |
| `as any` detection | EXISTS | Pattern: `/\bas\s+any\b/` |
| `@ts-ignore` detection | EXISTS | Pattern: `/@ts-ignore/` |
| `@ts-nocheck` detection | EXISTS | Pattern: `/@ts-nocheck/` |
| `eslint-disable` detection | EXISTS | Pattern: `/eslint-disable/` |
| `.skip()` test skip detection | EXISTS | Pattern: `/\.skip\(/` |
| `xit()`/`xdescribe()` detection | EXISTS | Pattern: `/xit\(\|xdescribe\(/` |
| `test.todo()` detection | EXISTS | Pattern: `/test\.todo\(/` |
| Empty catch block detection | EXISTS | `quality-gate.service.ts:76` |
| 32 unit tests | EXISTS | `quality-gate.service.spec.ts` |

**Minor Gaps:**

```
Gap 1: Type annotation `any` not blocked (only `as any` assertion)
  Example that passes quality gate: const x: any = someValue;
  Fix: Add pattern { pattern: /:\s*any\b/, label: 'Uses "any" type annotation' }

Gap 2: Promise suppression not detected
  Example: promise.catch(() => {})
  Fix: Add pattern { pattern: /\.catch\(\s*\(\)\s*=>\s*\{\s*\}\)/, label: 'Suppresses Promise error with empty catch' }

Gap 3: `@ts-expect-error` without explanation not detected
  Example: // @ts-expect-error
  Fix: Add pattern { pattern: /@ts-expect-error(?!\s+\S)/, label: 'Uses @ts-expect-error without explanation' }

These are LOW PRIORITY — the major patterns are already covered.
```

---

### EC-15: Agent adds wrong dependency version causing new conflicts

**Scenario:** Error: "Cannot find package lodash". Agent adds `"lodash": "0.1.0"`
(ancient version). Build passes but peer dependencies break.

**Risk:** Introducing new dependency conflicts, security vulnerabilities.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Quality gate: package.json guard | EXISTS | `quality-gate.service.ts:81-88` — only allows for dependency error types |
| Semver validation | MISSING | — |
| npm registry lookup | MISSING | — |
| Peer dependency check | MISSING | — |

**Enhancement Spec:**

```
LAYER 1 — Quality Gate Enhancement (quality-gate.service.ts):

  // 13. Dependency version sanity check
  if (touchesPackageJson && DEPENDENCY_ERROR_TYPES.has(ctx.errorTypeCode)) {
    // Parse the diff for version additions
    const versionAdditions = output.diff.match(
      /^\+\s*"[\w@/.-]+"\s*:\s*"([^"]+)"/gm
    );
    if (versionAdditions) {
      for (const match of versionAdditions) {
        const version = match.match(/"([^"]+)"$/)?.[1];
        if (version) {
          // Check for exact old versions (likely wrong)
          if (/^\d+\.\d+\.\d+$/.test(version)) {
            const [major] = version.split('.');
            if (parseInt(major, 10) === 0) {
              violations.push(
                `Adds dependency with pre-1.0 version (${version}) — likely incorrect`
              );
            }
          }
          // Check for invalid semver
          if (!/^[\^~>=<*]?\d/.test(version) && version !== '*' && version !== 'latest') {
            violations.push(`Invalid semver range: ${version}`);
          }
        }
      }
    }
  }

LAYER 2 — Prompt Enhancement:
  Add to safety rules:
  "When adding a dependency, use the LATEST STABLE major version with a caret
   range (e.g., ^4.17.21 for lodash). Never use pre-1.0 versions unless the
   error specifically requires it. Check the import statement to determine
   which package is actually needed."

FUTURE (v2): npm registry lookup to validate version exists and is compatible.
```

---

### EC-16: Agent fixes `package.json` but doesn't regenerate lockfile

**Scenario:** Agent adds `"lodash": "^4.17.21"` to `package.json` but doesn't
update `package-lock.json`. CI fails because lockfile is stale.

**Risk:** Fix is incomplete, CI will fail on `npm ci`.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `files_modified` tracks both package.json and lockfile | EXISTS | `quality-gate.service.ts:82` |
| Lockfile regeneration | **NOT IMPLEMENTED** | — |
| Package manager detection | MISSING | — |

**Enhancement Spec:**

```
Service: ValidatorService (validator.service.ts)
Method:  regenerateLockfile(language: string, repoPath: string) → string[]

Logic:
  1. Detect package manager from repo context:
     - If pnpm-lock.yaml exists → pnpm
     - If yarn.lock exists → yarn
     - If package-lock.json exists → npm
     - Default: npm

  2. After applying patch that modifies package.json:
     cd {tempDir}
     {packageManager} install --lockfile-only
     # npm: npm install --package-lock-only
     # yarn: yarn install --frozen-lockfile (will fail) → yarn install
     # pnpm: pnpm install --lockfile-only

  3. Read updated lockfile
  4. Include lockfile in the diff (files_modified + diffContent)

Quality Gate Enhancement:
  // 14. Lockfile consistency check
  if (touchesPackageJson) {
    const touchesLockfile = output.files_modified.some(f =>
      f.endsWith('package-lock.json') ||
      f.endsWith('yarn.lock') ||
      f.endsWith('pnpm-lock.yaml')
    );
    if (!touchesLockfile) {
      violations.push(
        'Modifies package.json but lockfile is not updated. ' +
        'Run npm install --package-lock-only after dependency changes.'
      );
    }
  }

ALTERNATIVE (simpler v1): Add to prompt:
  "If you modify package.json, set can_fix: false with reason:
   'Dependency change requires lockfile regeneration — human must run npm install.'
   This ensures the agent never pushes broken lockfiles."

RECOMMENDATION: Use the alternative for v1. Lockfile regeneration requires
a sandboxed execution environment (Docker). Implement full regen in v2.
```

---

### EC-17: Agent fixes import path but source module's export name changed

**Scenario:** `utils.ts` renames `export function getUser()` to
`export function fetchUser()`. Agent updates the import in `auth.ts` from
`getUser` to `fetchUser`, but `profile.ts` also imports `getUser` and isn't
in the agent's context.

**Risk:** Fix is incomplete — compiles in isolation but fails when all files
are considered.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Multi-file `fileContents` in prompt | EXISTS | `prompt-builder.service.ts:157` |
| EXPORT_ERROR classification | EXISTS | `log-parser.service.ts:91` |
| Cross-file consistency validation | MISSING | — |

**Enhancement Spec:**

```
APPROACH: Provide richer context to Claude, not post-hoc validation.

Enhancement to gatherContext node (RepairAgentService):
  When error is EXPORT_ERROR or IMPORT_ERROR:
  1. Identify the source module from the error message
     (e.g., "Cannot find 'getUser' in './utils'" → source = utils.ts)
  2. Search the repo tree for ALL files that import from that source module:
     const repoTree = await githubService.getRepoTree(installationId, owner, repo, sha)
     const importingFiles = repoTree.filter(f => f.endsWith('.ts') || f.endsWith('.js'))
     // For each file, check if it imports from the affected module
     // Fetch those file contents and include in fileContents
  3. Pass ALL importing files as related context to Claude
  4. Claude sees the full picture and updates all consumers

Prompt Enhancement:
  "If fixing an export/import error, check ALL files that import from the
   affected module. Include ALL necessary import updates in your diff."

Quality Gate Enhancement:
  // 15. Cross-file import consistency
  // After fix, verify that all import statements in modified files
  // reference exports that exist in the modified source files
  // (This is a heuristic check — full validation happens in pre-check/CI)

DEPENDENCY: Requires GithubService.getRepoTree() (already implemented)
and GithubService.getFileContent() for each importing file.

TOKEN BUDGET: Fetching all importing files may exceed token budget.
Limit to max 5 related files. If more exist, include the count in
the prompt: "Note: {N} additional files import from this module but
are not shown. Ensure your fix doesn't break them."
```

---

## Category D — Retry & Loop

### EC-18: Second fix attempt contradicts the first

**Scenario:** Attempt 1 adds `import { AuthGuard }`. Attempt 2 removes
`import { AuthGuard }`. They're different diffs so circular detection
doesn't catch it, but the logic is contradictory.

**Risk:** Oscillating fixes, wasted retries.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Circular fix detection (exact match) | EXISTS | `quality-gate.service.ts:111-118` — SHA-256 fingerprint |
| Retry history in prompt | EXISTS | `prompt-builder.service.ts:131-148` — shows all previous attempts |
| Semantic contradiction detection | MISSING | — |

**Enhancement Spec:**

```
APPROACH: Prompt-driven prevention (v1) + future diff analysis (v2).

v1 — Prompt Enhancement (already partially exists):
  The retry history block already includes previous diffs and their outcomes.
  Strengthen with explicit instruction:

  "7. Loop Prevention
     - If previous attempts are shown below and the error appears to be
       caused by a prior automated fix, explicitly state this in the diagnosis.
     - Do NOT repeat a fix strategy that already failed.
     - Do NOT reverse a previous fix unless you have a CLEAR alternative
       that addresses the root cause differently.
     - If you find yourself undoing a previous attempt's changes, set
       can_fix: false with reason explaining the contradiction."

v2 — Diff Analysis Enhancement (quality-gate.service.ts):
  // 16. Contradictory fix detection
  // Compare current diff against previous attempt diffs:
  // If current diff removes lines that a previous attempt added
  // (or vice versa), flag as potential contradiction.
  //
  // Implementation:
  // Parse diff into { added: Set<string>, removed: Set<string> }
  // For each previous attempt's diff:
  //   If current.removed ∩ previous.added is non-empty → warning
  //   If current.added ∩ previous.removed is non-empty → warning

PRIORITY: LOW — the prompt-driven approach handles most cases.
The retry history gives Claude enough context to avoid contradictions.
```

---

### EC-19: Agent hits max retries — must escalate with full context

**Scenario:** All 3 attempts fail. Agent must provide comprehensive diagnostic
context to the human engineer taking over.

**Risk:** Human starts from scratch without agent's findings.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `maxRetries = 3` config | EXISTS | `healops.config.ts:97` |
| `currentRetry` tracking | EXISTS | `agent.ts:35` |
| Escalation service | EXISTS | `escalation.service.ts:41-90` |
| 5 escalation types | EXISTS | `max_retries/circular_fix/budget_exceeded/unfixable_type/low_confidence` |
| GitHub Issue creation | EXISTS | `escalation.service.ts:62-79` |
| 24-hour cooldown | EXISTS | `escalation.service.ts:51-58` |
| Full attempt context in issue body | **PARTIAL** | Issue body is generic template — doesn't include actual attempt diffs |

**Enhancement Spec:**

```
Enhancement to EscalationService.buildIssueBody():

CURRENT (generic):
  "1. Review the CI logs for the failing build
   2. Check previous HealOps attempts on this branch
   3. Apply the fix manually or adjust the codebase"

ENHANCED (rich context):
  private async buildIssueBody(input: EscalateInput): Promise<string> {
    // Fetch all attempts for this job
    const attempts = await jobsRepository.findAttemptsByJob(input.jobId)
    const patches = await Promise.all(
      attempts.map(a => jobsRepository.findPatchByAttempt(a.id))
    )

    const sections = [
      '## HealOps Escalation\n',
      `**Job ID:** \`${input.jobId}\``,
      `**Escalation Type:** ${input.escalationType}`,
      `**Failure Type:** ${input.failureType}`,
      `**Branch:** ${input.branchName}`,
      `**Total Attempts:** ${attempts.length}`,
      '',
      '### Error Context',
      '```',
      // Include original error snippet (truncated to 2000 chars)
      originalErrorSnippet.slice(0, 2000),
      '```',
      '',
      '### Attempt History',
    ]

    for (const attempt of attempts) {
      const analysis = attempt.analysisOutput as { diagnosis: string; fix_strategy: string }
      const patch = patches.find(p => p?.attemptId === attempt.id)
      sections.push(
        `#### Attempt ${attempt.attemptNumber}`,
        `- **Diagnosis:** ${analysis?.diagnosis ?? 'N/A'}`,
        `- **Strategy:** ${analysis?.fix_strategy ?? 'N/A'}`,
        `- **Result:** FAILED`,
        patch ? `<details><summary>Diff attempted</summary>\n\n\`\`\`diff\n${patch.diffContent.slice(0, 3000)}\n\`\`\`\n</details>` : '',
        ''
      )
    }

    sections.push(
      '### Recommended Next Steps',
      '1. Review the original CI error logs',
      '2. Examine the attempted diffs above — the agent may have been close',
      '3. Check if the error requires context the agent didn\'t have (env vars, external APIs, etc.)',
      '',
      '---',
      '*This issue was created automatically by HealOps after all automated fix attempts were exhausted.*',
    )

    return sections.join('\n')
  }

DEPENDENCY: EscalationService needs access to HealopsJobsRepository
(add to constructor injection).
```

---

### EC-20: Fix loop — fixing A breaks B, fixing B breaks A

**Scenario:** Agent fixes type error in `auth.ts` (attempt 1) — this breaks
`user.ts`. Agent fixes `user.ts` (attempt 2) — this re-breaks `auth.ts`.
Classic oscillation.

**Risk:** All 3 retries wasted on ping-pong. Human gets no useful output.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Circular fix detection (exact diff) | EXISTS | `quality-gate.service.ts:111-118` |
| 24h cooldown after escalation | EXISTS | `operations.ts:126-153` |
| Oscillation detection | MISSING | Only detects IDENTICAL diffs, not semantic oscillation |

**Enhancement Spec:**

```
DETECTION METHOD: Track which files are modified across attempts.
If the same file appears in attempt N and attempt N+1, and the
error type in that file also appears in both attempts, flag oscillation.

Enhancement to QualityGateService.validate():

  // 17. Oscillation detection
  // Context must include previous attempts' files_modified lists
  interface QualityGateContext {
    errorTypeCode: string;
    previousFixFingerprints: string[];
    previousFilesModified: string[][];   // NEW: per-attempt file lists
  }

  if (ctx.previousFilesModified.length >= 2) {
    const currentFiles = new Set(output.files_modified);
    const prevFiles = new Set(ctx.previousFilesModified[ctx.previousFilesModified.length - 1]);
    const prevPrevFiles = ctx.previousFilesModified.length >= 2
      ? new Set(ctx.previousFilesModified[ctx.previousFilesModified.length - 2])
      : new Set<string>();

    // Check: are we modifying the same files as attempt N-2?
    // (skipping N-1, since N-1 is what "fixed" it differently)
    const overlap = [...currentFiles].filter(f => prevPrevFiles.has(f));
    if (overlap.length > 0 && overlap.length === currentFiles.size) {
      violations.push(
        'Potential oscillation detected — modifying the same files as ' +
        `attempt ${ctx.previousFilesModified.length - 1}. ` +
        'This suggests the fix is ping-ponging between two states.'
      );
    }
  }

ESCALATION: If oscillation is detected, escalate immediately with
  escalationType='circular_fix' and detailed context showing the
  oscillation pattern.

PROMPT ADDITION:
  "If you detect that your fix would undo a change from a previous attempt
   (fixing file X, then file Y, then file X again), set can_fix: false
   with reason: 'Oscillation detected — fixes are contradictory.'"
```

---

### EC-21: Agent keeps generating the same bad fix on every retry

**Scenario:** Same diff produced on attempt 1 and attempt 2. No learning.

**Risk:** All 3 retries produce identical output, wasting tokens.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| SHA-256 diff fingerprinting | **FULLY IMPLEMENTED** | `quality-gate.service.ts:112-113` |
| `hasCircularFix()` repo query | EXISTS | `jobs.repository.ts:99-110` |
| Composite index for fast lookup | EXISTS | `agent.ts:84-87` — `idx_attempts_job_fingerprint` |
| `circular_fix_detected` job status | EXISTS | `agent.ts:29` |
| `circular_fix` escalation type | EXISTS | `outputs.ts:57` |
| 24h cooldown on circular fix | EXISTS | `operations.ts:138` |

**Gaps:**

```
Gap 1: Semantic equivalence not detected
  Two diffs with identical intent but different whitespace/formatting
  produce different hashes.

  MITIGATION: hashDiff() in quality-gate.service.ts already normalizes
  by stripping context lines, +++ / --- headers, and trimming whitespace.
  This covers most formatting differences.

Gap 2: Sub-fix not detected
  If attempt 1 fixes files A+B+C, and attempt 2 fixes only file A
  (a subset), the hashes differ.

  FUTURE: Compare file-level sub-diffs. If all changed files in attempt N+1
  are a subset of attempt N's changes with identical per-file diffs, flag it.

PRIORITY: LOW — the current implementation handles the primary case
(identical diffs). The prompt's retry history prevents most other repetitions.
```

---

## Category E — Git & PR

### EC-22: Branch name collision from a previous failed attempt

**Scenario:** Branch `healops/fix/{jobId}` already exists from a previous
attempt that was interrupted. Agent tries to create it again.

**Risk:** Git error, agent fails to push.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Branch name: `healops/fix/{jobId}` | EXISTS | Convention in schema comments |
| `createBranch()` handles "already exists" | **FULLY IMPLEMENTED** | `github.service.ts:104-106` — returns `true` if already exists |
| Branch table with `isHealopsBranch` flag | EXISTS | `platform.ts:110` |
| `autoDeleteAfter` field for cleanup | EXISTS | `platform.ts:112` |
| Stale branch cleanup query | EXISTS | `platform.repository.ts` — `findExpiredHealopsBranches()` |

**Enhancement Spec:**

```
MOSTLY HANDLED. Minor enhancements:

1. Add stale branch cleanup to the cron job:
   - Query: findExpiredHealopsBranches() where autoDeleteAfter < NOW()
   - Delete via GitHub API: DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}
   - Remove from branches table

2. When createBranch returns true (already exists), verify the branch
   is pointing at the expected SHA:
   - GET /repos/{owner}/{repo}/git/ref/heads/{branchName}
   - If SHA doesn't match → force-update the ref to the correct SHA
   - This handles the case where an old branch exists from a different job
```

---

### EC-23: Duplicate PRs — same error triggers agent twice

**Scenario:** Error hash X produces Job A (PR #10). Pipeline fails again with
same error hash X. New Job B creates PR #11. Now two PRs for same error.

**Risk:** Reviewer confusion, conflicting PRs.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `findOpenPrByTargetBranch()` | EXISTS | `pull-requests.repository.ts:30` |
| Index on `(targetBranch, status)` | EXISTS | `outputs.ts:44` |
| PR dedup by error hash | MISSING | Current dedup is by target branch, which is always `main` |

**Enhancement Spec:**

```
Enhancement to PullRequestService.createDraftPr():

  Before creating a new PR:
  1. Look up the failure for this job → get errorHash
  2. Query: find any OPEN PRs where the associated job's failure has the
     same errorHash
  3. If found:
     a. Close the OLD PR with comment: "Superseded by newer fix attempt"
     b. Update old PR status to 'superseded'
     c. Proceed to create the new PR

New repository method:
  findOpenPrByErrorHash(errorHash: string): Promise<PullRequest | null>
  // JOIN pull_requests → jobs → failures
  // WHERE pull_requests.status = 'open' AND failures.error_hash = ?

This ensures at most ONE open HealOps PR per unique error at any time.
```

---

### EC-24: Merge conflicts on `package.json` or lockfile

**Scenario:** Agent modifies `package.json`. Meanwhile, a developer also
modifies `package.json` on main. The PR has merge conflicts.

**Risk:** PR can't be merged, blocks review workflow.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Quality gate recognizes package.json changes | EXISTS | `quality-gate.service.ts:81-82` |
| Merge conflict detection | **NOT IMPLEMENTED** | — |
| Lockfile-specific handling | MISSING | — |

**Enhancement Spec:**

```
HANDLED BY: EC-07's cron job checks PR mergeability every 15 minutes.
If mergeable_state === 'dirty', PR is auto-closed.

Additional safeguard in pushBranch node:
  After pushing to branch, before creating PR:
  1. Use GitHub API merge preview:
     POST /repos/{owner}/{repo}/merges
     { base: defaultBranch, head: agentBranch, commit_message: "test merge" }
     (DRY RUN — don't actually merge)
  2. If HTTP 409 (conflict) → don't create PR
     → Count as failed attempt → retry with fresh main

For lockfiles specifically:
  Prompt instruction:
  "Do NOT include lockfile changes in your diff. Lockfile updates must be
   generated by the package manager, not manually authored."

  Quality gate enhancement:
  if (output.diff includes content from lockfile AND changes look hand-written) {
    violations.push('Lockfile changes appear manually authored — must be auto-generated')
  }
```

---

### EC-25: Agent's PR targets a branch that's been deleted

**Scenario:** Agent is configured to target `develop` branch. Someone deletes
`develop` branch. PR creation fails with 422 error.

**Risk:** Unhandled error, job stuck in `running` state.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `createPR()` sends `base` parameter | EXISTS | `github.service.ts:196-219` |
| Target branch validation | MISSING | No pre-check for branch existence |
| Error handling for 422 | PARTIAL | Generic `catch` returns null |

**Enhancement Spec:**

```
Enhancement to PullRequestService.createDraftPr():

  Before calling githubService.createPR():
  1. Verify target branch exists:
     try {
       await octokit.git.getRef({ owner, repo, ref: `heads/${targetBranch}` })
     } catch (e) {
       if (e.status === 404) {
         // Target branch doesn't exist — fall back to default branch
         const { data: repoData } = await octokit.repos.get({ owner, repo })
         targetBranch = repoData.default_branch
         this.logger.warn(`Target branch deleted, falling back to ${targetBranch}`)
       }
     }

  2. If even the default branch doesn't exist (extreme edge case):
     → Escalate with type 'unfixable_type' and reason 'Target branch not found'

ALSO: Store the repository's default branch in repositories.defaultBranch
(already exists in platform.ts). Use it as fallback.
```

---

## Category F — Dependency-Specific

### EC-26: Version conflict has no valid resolution

**Scenario:** Package A requires `lodash@^3.0`, Package B requires
`lodash@^4.0`. No single version satisfies both. Agent can't fix this.

**Risk:** Agent wastes 3 retries trying impossible version combinations.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `DEPENDENCY_VERSION_CONFLICT` classification | EXISTS | `log-parser.service.ts:96` |
| `isAutoFixable` field on error types | EXISTS | `ingestion.ts:86-94` |
| Conflict resolution logic | MISSING | — |
| Early escalation for unresolvable | MISSING | — |

**Enhancement Spec:**

```
APPROACH: Detect "likely unresolvable" early and escalate faster.

Enhancement to ClassifierService:
  When classifying DEPENDENCY_VERSION_CONFLICT:
  1. Parse the error message for version constraints
  2. If error contains "ERESOLVE" (npm) or "Could not resolve" patterns:
     → Set confidence = 0.3 (below AGENT_MIN_CONFIDENCE of 0.55)
     → This triggers 'low_confidence' escalation immediately
     → Agent doesn't waste 3 attempts

Prompt Enhancement:
  "For DEPENDENCY_VERSION_CONFLICT errors:
   - If the conflict involves incompatible major version ranges (e.g.,
     one package requires ^3.x and another requires ^4.x), set can_fix: false.
   - Explain the conflict in the diagnosis so the human knows which
     packages to reconcile.
   - Only attempt a fix if you can identify a version that satisfies ALL
     constraints mentioned in the error."

Quality Gate Enhancement:
  When errorTypeCode === 'DEPENDENCY_VERSION_CONFLICT':
  // If agent's confidence < 0.7 for version conflicts, flag for review
  // Version conflicts are inherently harder — require higher confidence
  if (output.confidence < 0.7) {
    violations.push(
      'Low confidence on version conflict fix. ' +
      'Version conflicts often require human judgment on which version to pin.'
    );
  }
```

---

### EC-27: Agent fixes `package.json` but doesn't regenerate lockfile

**Scenario:** Same as EC-16 but from the dependency perspective.

**See EC-16 for full specification.** This is the same edge case viewed from
the dependency category angle.

**Summary:** v1 uses prompt instruction to set `can_fix: false` for package.json
changes that require lockfile regeneration. v2 implements sandboxed
`npm install --package-lock-only` in ValidatorService.

---

### EC-28: Monorepo — dependency added to wrong `package.json`

**Scenario:** Monorepo with `packages/api/package.json` and
`packages/web/package.json`. Error is in `packages/api/src/auth.ts`.
Agent adds dependency to root `package.json` instead of
`packages/api/package.json`.

**Risk:** Wrong package scope, dependency hoisting issues, breaks other packages.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `pathLanguageMap` in repository settings | EXISTS (unused) | `platform.ts:86` |
| Monorepo detection | MISSING | — |
| Package scope routing | MISSING | — |

**Enhancement Spec:**

```
APPROACH: Context enrichment + prompt guidance.

Enhancement to gatherContext node:
  1. Detect monorepo by checking for workspace config files:
     - package.json with "workspaces" field
     - pnpm-workspace.yaml
     - lerna.json
     - nx.json / project.json
  2. If monorepo detected, identify the package scope of the error:
     - Error in packages/api/src/auth.ts → scope = packages/api
     - Error in apps/web/components/Login.tsx → scope = apps/web
  3. Pass scope information to Claude:
     agentState.monorepoScope = 'packages/api'

Prompt Enhancement:
  When monorepoScope is set, add to the user message:

  "MONOREPO CONTEXT:
   This is a monorepo. The error originates in package: {monorepoScope}
   - If adding a dependency, add it to {monorepoScope}/package.json
   - Do NOT modify the root package.json unless the dependency is shared
     across all packages.
   - Do NOT modify other package's package.json files."

Quality Gate Enhancement:
  // 18. Monorepo scope validation
  if (agentState.monorepoScope && touchesPackageJson) {
    const wrongScope = output.files_modified.some(f =>
      f.endsWith('package.json') && !f.startsWith(agentState.monorepoScope)
    );
    if (wrongScope) {
      violations.push(
        `Modifies package.json outside the error's scope (${agentState.monorepoScope})`
      );
    }
  }

Schema: Add monorepoScope to AgentState interface (optional string).
Use pathLanguageMap in repositorySettings to map paths → packages.
```

---

## Category G — Infrastructure & Resilience

These issues were identified in architecture review. They are not user-facing
edge cases but **infrastructure failures that cause data loss or stuck jobs**.

---

### EC-29: Webhook ingestion — single point of failure

**Scenario:** The `POST /v1/healops/webhooks/github` controller is the only
entry point for failure events. If the NestJS process is restarting, scaling,
or crashed, the webhook HTTP call returns 5xx and GitHub retries briefly, but
events can be lost.

**Risk:** Missed pipeline failures. Agent never picks up the error.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Single controller endpoint | EXISTS | `github-webhook.controller.ts` |
| Idempotent insert on delivery ID | EXISTS | `github-webhook.service.ts:43` |
| Durable ingestion buffer | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
ARCHITECTURE CHANGE:
  Decouple webhook receipt from processing via a dedicated BullMQ queue.

  Current flow:
    GitHub → POST /webhook → GithubWebhookService.processGithubWebhook()
      → verify + filter + extract + dispatch (all synchronous)

  New flow:
    GitHub → POST /webhook → verify signature ONLY → enqueue raw event
      → return 200 immediately
      → WebhookProcessorWorker picks up from queue → full processing

  Implementation:
    1. Create queue: 'healops-raw-webhooks' in BullMQ
    2. Controller: verify HMAC, enqueue { deliveryId, event, rawBody, payload }, return 200
    3. New processor: WebhookProcessorWorker
       - Idempotent insert to webhook_events
       - Filter event type
       - Loop prevention (healops/fix/* branches)
       - Log extraction + failure creation
       - Dispatch to healops-repair queue

  Benefits:
    - Webhook never lost — BullMQ persists to Redis
    - Controller responds in <50ms (GitHub wants <10s)
    - Retries are handled by BullMQ, not GitHub's retry logic
    - Processing failures don't block receipt of new events

  BullMQ config:
    { attempts: 5, backoff: { type: 'exponential', delay: 5000 } }
```

---

### EC-30: Agent state — no crash recovery

**Scenario:** Worker process crashes mid-repair (e.g., after `pushBranch` but
before `waitForValidation`). The `AgentState` is in process memory. On
restart, the state is lost. The job is stuck in `running` status forever.

**Risk:** Orphaned jobs, branches pushed but no PR created, no escalation.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `AgentState` interface | EXISTS (in-memory only) | `agent-state.interface.ts` |
| `attempts.analysis_output` JSON column | EXISTS (partial state) | `agent.ts:63` |
| State checkpointing | **NOT IMPLEMENTED** | — |
| Orphaned job recovery | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
TWO-PART FIX:

PART A — State Checkpointing:
  After each LangGraph node completes, persist state to DB:

  // Add to AgentState interface:
  lastCompletedNode: 'gatherContext' | 'diagnoseAndFix' | 'qualityGate' |
    'runPreCheck' | 'pushBranch' | 'waitForValidation' | null;
  checkpointedAt: Date | null;

  // After each node:
  await jobsRepository.checkpointState(jobId, {
    lastCompletedNode: 'pushBranch',
    checkpointedAt: new Date(),
    stateSnapshot: JSON.stringify(agentState),  // Store in attempts.analysis_output
  });

  Schema: Add to jobs table:
    last_completed_node VARCHAR(50)
    state_snapshot JSONB
    checkpointed_at TIMESTAMPTZ

PART B — Orphaned Job Recovery:
  On worker startup, scan for orphaned jobs:

  // In WorkerModule.onModuleInit():
  const orphanedJobs = await jobsRepository.findOrphanedJobs();
  // WHERE status = 'running' AND checkpointed_at < NOW() - INTERVAL '30 minutes'

  for (const job of orphanedJobs) {
    if (job.lastCompletedNode === 'pushBranch') {
      // Branch was pushed but no PR — resume from waitForValidation or createPR
      await this.resumeFromNode(job, 'waitForValidation');
    } else if (job.lastCompletedNode === 'waitForValidation') {
      // Callback may have been lost — check workflow status directly
      const status = await githubService.getLatestWorkflowStatus(...);
      // Resume accordingly
    } else {
      // For earlier nodes, just restart the attempt
      await this.repairQueue.add('repair', { jobId: job.id, failureId: job.failureId });
    }
  }
```

---

### EC-31: `waitForValidation` — no timeout, callback race condition

**Scenario A:** GitHub Actions workflow is misconfigured and never calls the
validation callback. The job hangs in `waitForValidation` forever.

**Scenario B:** The validation callback arrives *before* the node starts
listening (race condition). The callback data is lost.

**Risk:** Stuck jobs, wasted resources, blocked queue.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Validation callback endpoint | EXISTS | `github-webhook.service.ts:87-99` |
| Timeout mechanism | **NOT IMPLEMENTED** | — |
| Race condition handling | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
THREE-PART FIX:

PART A — Timeout via BullMQ delayed job:
  When entering waitForValidation node:
    // Schedule a timeout check in 30 minutes
    await repairQueue.add('validation-timeout', { jobId }, {
      delay: 30 * 60 * 1000,  // 30 minutes
      jobId: `timeout:${jobId}`,  // Dedup key
    });

  Timeout processor:
    async processTimeout(job: Job<{ jobId: string }>): Promise<void> {
      const healopsJob = await jobsRepository.findJobById(job.data.jobId);
      if (healopsJob.lastCompletedNode !== 'waitForValidation') return;  // Already moved on

      // Check workflow status directly via API
      const status = await githubService.getLatestWorkflowStatus(...);
      if (status === 'success') {
        // Callback was lost — manually process
        await this.resumeWithValidationResult(job.data.jobId, 'success');
      } else if (status === 'failure') {
        await this.resumeWithValidationResult(job.data.jobId, 'failure');
      } else {
        // Still running — wait another 15 minutes
        await repairQueue.add('validation-timeout', { jobId: job.data.jobId }, {
          delay: 15 * 60 * 1000,
        });
      }
    }

PART B — Race condition prevention:
  Use Redis as a rendezvous point:
    // When pushing branch (before waitForValidation):
    await redis.set(`healops:validation:${jobId}`, 'waiting', 'EX', 3600);

    // When callback arrives:
    const existing = await redis.get(`healops:validation:${jobId}`);
    if (existing === 'waiting') {
      // Normal case — write result
      await redis.set(`healops:validation:${jobId}`, JSON.stringify(result), 'EX', 3600);
    } else {
      // Callback arrived before node started — store it anyway
      await redis.set(`healops:validation:${jobId}`, JSON.stringify(result), 'EX', 3600);
    }

    // waitForValidation node polls Redis:
    const result = await this.pollForResult(jobId, { maxWaitMs: 30 * 60 * 1000, intervalMs: 10000 });

PART C — Callback idempotency:
  The validation callback endpoint currently has no dedup guard.
  Add idempotency using runId:

  async processValidationCallback(input: ValidationCallbackInput): Promise<void> {
    // Idempotency: check if this runId was already processed
    const existing = await jobsRepository.findValidationByRunId(input.runId);
    if (existing) {
      this.logger.debug(`Duplicate validation callback ignored: ${input.runId}`);
      return;
    }
    // ... process normally
  }
```

---

### EC-32: TOCTOU race in job dedup check

**Scenario:** Two identical webhooks arrive within milliseconds. Both pass the
`findActiveJobByFailure()` check (no active job yet), both create a new job.
Result: duplicate jobs for the same failure.

**Risk:** Agent fixes the same error twice simultaneously.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| DB-level dedup (read → check → write) | EXISTS but race-prone | `repair-jobs.service.ts:52-57` |
| Distributed lock | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
Use Redis distributed lock around the pre-flight + creation block:

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
    // All existing pre-flight checks (cooldown, flaky, active job dedup)
    // ... existing code ...

    // Safe to create job — we hold the lock
    const job = await this.jobsRepository.createJob({ failureId: input.failureId, status: 'queued' });
    await this.repairQueue.add('repair', { jobId: job.id, ... });
    return job.id;
  } finally {
    await lock.release();
  }
}

Dependencies:
  - npm package: redlock (uses existing Redis connection)
  - Register Redlock in RepairJobsModule
```

---

### EC-33: GitHub App token thundering herd

**Scenario:** 10 concurrent repair jobs each find the cached installation token
expired at the same moment. All 10 call GitHub's token endpoint simultaneously.
GitHub rate-limits the app.

**Risk:** API failures, cascading job failures.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Installation token caching (50 min) | EXISTS | `github-app.provider.ts` |
| Request coalescing (singleflight) | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
Add singleflight pattern to GithubAppProvider:

private refreshPromises = new Map<string, Promise<string>>();

async getInstallationToken(installationId: string): Promise<string> {
  const cached = this.tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  // Singleflight: if another call is already refreshing, wait for it
  const inflight = this.refreshPromises.get(installationId);
  if (inflight) {
    return inflight;
  }

  const refreshPromise = this.doRefreshToken(installationId);
  this.refreshPromises.set(installationId, refreshPromise);

  try {
    const token = await refreshPromise;
    return token;
  } finally {
    this.refreshPromises.delete(installationId);
  }
}
```

---

### EC-34: Worker and API process separation

**Scenario:** `RepairJobsProcessor` (BullMQ worker) is loaded in the HTTP API
process via `AppModule`. This means the API server is consuming queue jobs,
which can compete with HTTP request handling for resources.

**Risk:** API latency spikes during heavy repair activity. Memory bloat from
loading unnecessary worker dependencies in the API process.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Separate `WorkerModule` | EXISTS | `worker.main.ts` |
| Module registration | NEEDS VERIFICATION | Must confirm `RepairJobsProcessor` is NOT in `AppModule` |

**Enhancement Spec:**

```
VERIFICATION CHECKLIST:
  1. RepairJobsProcessor must be in WorkerModule ONLY (not AppModule)
  2. RepairAgentModule must be in WorkerModule ONLY
  3. AppModule imports:
     - RepairJobsModule (for enqueue API — BullMQ producer side)
     - NOT RepairJobsProcessor (consumer side)
  4. WorkerModule imports:
     - RepairJobsModule (with processor)
     - RepairAgentModule
     - All HealOps services needed for repair

IMPLEMENTATION:
  // repair-jobs.module.ts — shared (producer queue registration)
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

  // app.module.ts — imports RepairJobsModule (NOT worker module)
  // worker.main.ts — imports RepairJobsWorkerModule
```

---

### EC-35: CI log size — no streaming truncation strategy

**Scenario:** CI pipeline produces a 50MB verbose test log. The system fetches
the full log, blowing up memory. Or it truncates naively, cutting off the
actual error which may appear at the end (Go panics, Python tracebacks).

**Risk:** OOM crashes, or truncation loses the actual error.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `truncateToTokenBudget()` — hard cutoff from start | EXISTS | `log-parser.service.ts:129-133` |
| `parseLog()` — extracts up to 50 error lines | EXISTS | `log-parser.service.ts:52-53` |
| `extractErrorSnippet()` — ±100 lines around first error | EXISTS | `log-parser.service.ts:66-80` |
| Smart streaming extraction | MISSING | — |
| Max raw log size validation | MISSING | — |

**Enhancement Spec:**

```
THREE-LAYER EXTRACTION:

1. Raw log size gate (before any processing):
   const MAX_RAW_LOG_SIZE = 5 * 1024 * 1024;  // 5MB
   if (rawLog.length > MAX_RAW_LOG_SIZE) {
     // Take first 2MB + last 2MB (errors often appear at both ends)
     rawLog = rawLog.slice(0, 2 * 1024 * 1024)
       + '\n... [TRUNCATED — log exceeds 5MB] ...\n'
       + rawLog.slice(-2 * 1024 * 1024);
   }

2. Smart extraction (already exists but enhance):
   extractErrorSnippet() currently takes ±100 lines around FIRST error.
   Enhancement: also capture LAST error location:
     const firstError = lines.findIndex(isErrorLine);
     const lastError = lines.findLastIndex(isErrorLine);
     if (lastError !== firstError && lastError - firstError > 200) {
       // Errors span a large range — include both bookends
       return [
         ...lines.slice(Math.max(0, firstError - 20), firstError + 30),
         '... [TRUNCATED] ...',
         ...lines.slice(Math.max(0, lastError - 20), lastError + 30),
       ].join('\n');
     }

3. Token budget enforcement (already exists):
   truncateToTokenBudget() caps at agent.maxLogSnippetTokens (8000 default)
```

---

### EC-36: Database connection pooling

**Scenario:** Worker process running multiple concurrent repair jobs (even
sequentially, each job makes many DB queries across nodes). A single
`pg.Client` connection bottlenecks query throughput.

**Risk:** Slow queries, connection timeouts, worker stalls.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Drizzle ORM + pg | EXISTS | `db.service.ts` |
| Connection pooling configuration | **NEEDS VERIFICATION** | — |

**Enhancement Spec:**

```
Verify and configure in DBService:

import { Pool } from 'pg';

// For API process:
const apiPool = new Pool({
  max: 20,              // Max connections
  min: 5,               // Keep-alive connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// For Worker process:
const workerPool = new Pool({
  max: 50,              // Higher — worker is DB-intensive
  min: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Drizzle initialization:
const db = drizzle(pool, { schema });

MONITORING:
  Export pool metrics to Prometheus:
  - pool.totalCount (current connections)
  - pool.idleCount (idle connections)
  - pool.waitingCount (queued requests waiting for a connection)
```

---

### EC-37: Validation callback — not idempotent

**Scenario:** GitHub Actions sends the validation-complete callback twice
(network retry, webhook re-delivery). The second callback processes the
validation result again, potentially causing double-processing.

**Risk:** Duplicate state transitions, corrupted attempt records.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Bearer token verification | EXISTS | `github-webhook.service.ts:89-93` |
| Idempotency guard | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
SAME PATTERN as webhook_events.external_event_id:

1. Require runId in callback payload (already exists)
2. Use validations table uniqueness:
   The validations table already has:
   uniqueIndex('idx_validations_attempt_stage').on(attemptId, stage)

   Enhancement: also use runId as dedup key:
   Before processing:
   const existing = await jobsRepository.findValidationByRunId(input.runId);
   if (existing) {
     this.logger.debug(`Duplicate validation callback: ${input.runId}`);
     return;  // Idempotent — already processed
   }

3. Alternative: Redis dedup (faster, no DB query):
   const dedup = await redis.set(`healops:callback:${input.runId}`, '1', 'NX', 'EX', 3600);
   if (!dedup) return;  // Already processed
```

---

### EC-38: Agent observability — decision-making is opaque

**Scenario:** The agent rejects a patch. The quality gate fires. But there's no
way to understand WHY decisions were made without reading raw logs. Debugging
"why didn't the agent fix this?" requires log-diving.

**Risk:** Blind spots in production, slow debugging, no trend analysis.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Prometheus + Grafana | EXISTS | `api/metrics/` |
| Jaeger tracing | EXISTS | `api/tracing/` |
| Agent-specific metrics | **NOT IMPLEMENTED** | — |
| Per-node span tracing | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
THREE OBSERVABILITY LAYERS:

LAYER 1 — Prometheus Metrics (counters + histograms):
  // Register in a new HealopsMetricsService:
  healops_jobs_total{status, error_type}            — counter per job outcome
  healops_attempts_total{outcome, error_type}        — counter per attempt outcome
  healops_quality_gate_violations_total{violation}    — counter per violation type
  healops_confidence_score{error_type}               — histogram of Claude confidence
  healops_tokens_used{direction}                     — histogram (input/output)
  healops_fix_latency_seconds{error_type}            — histogram per error type
  healops_escalation_total{reason}                   — counter per escalation type

LAYER 2 — Jaeger Spans (per LangGraph node):
  Each node in the state machine creates a child span:
  const span = tracer.startSpan(`healops.node.${nodeName}`, { childOf: parentSpan });
  span.setTag('job.id', state.jobId);
  span.setTag('attempt.number', state.attemptNumber);
  span.setTag('error.type', state.errorTypeCode);

  // Node-specific attributes:
  // diagnoseAndFix: span.setTag('confidence', output.confidence)
  // qualityGate: span.setTag('violations.count', violations.length)
  // runPreCheck: span.setTag('build.status', result.buildStatus)
  span.finish();

LAYER 3 — Structured Audit Events:
  After each node, write to healops_audit_logs:
  {
    entityType: 'job',
    entityId: jobId,
    action: 'node_completed',
    actorType: 'system',
    metadata: {
      node: 'qualityGate',
      violations: ['Uses "as any" type assertion'],
      durationMs: 150,
    }
  }

  This enables dashboard queries like:
  "Show me all quality gate rejections in the last 7 days grouped by violation type"
```

---

## Category H — Enterprise & Operations

### EC-39: No tenant isolation / multi-tenancy

**Scenario:** In a multi-org SaaS deployment, a query bug or missing WHERE
clause could expose Organization A's failure data to Organization B.

**Risk:** Data leakage across tenants.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `organizations` table | EXISTS | `platform.ts` |
| `organizationId` FK on repositories | EXISTS | `platform.ts` |
| Row-level security (RLS) | **NOT IMPLEMENTED** | — |
| Tenant scoping middleware | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
APPROACH: Application-level tenant scoping (v1) + PostgreSQL RLS (v2).

v1 — NestJS TenantContextService:
  // Uses AsyncLocalStorage to propagate org context through request lifecycle
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

  // Middleware extracts org from JWT/API key and sets context:
  const orgId = request.user.organizationId;
  return tenantContext.run(orgId, () => next.handle());

  // All repository queries MUST scope by org:
  async findRepositories(): Promise<Repository[]> {
    const orgId = this.tenantContext.getOrganizationId();
    return this.db.select().from(repositories).where(eq(repositories.organizationId, orgId));
  }

v2 — PostgreSQL RLS:
  ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
  CREATE POLICY org_isolation ON repositories
    USING (organization_id = current_setting('app.current_org_id')::uuid);

  // Set per-connection:
  await db.execute(sql`SET LOCAL app.current_org_id = ${orgId}`);
```

---

### EC-40: `superseded` job trigger not automated

**Scenario:** Developer pushes a new commit to the same branch while a repair
job is running. The job should be automatically superseded because the
codebase has changed and the fix context is stale.

**Risk:** Agent works on stale code, produces irrelevant fix.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `jobs.status = 'superseded'` | EXISTS | `agent.ts:29` |
| `jobs.supersededByCommit` | EXISTS | `agent.ts:38` |
| Automatic supersession trigger | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
TRIGGER: Listen for 'push' events on monitored branches.

Enhancement to GithubWebhookService:
  In processGithubWebhook(), after the workflow_run filter:

  // Handle push events — check for active job supersession
  if (input.event === 'push') {
    const branch = (input.payload['ref'] as string)?.replace('refs/heads/', '');
    const commitSha = input.payload['after'] as string;

    // Find any active (queued/running) jobs for this repo + branch
    const activeJobs = await jobsRepository.findActiveJobsByBranch(
      input.repositoryId, branch
    );
    for (const job of activeJobs) {
      await jobsRepository.updateJobStatus(job.id, 'superseded');
      await jobsRepository.setSupersededByCommit(job.id, commitSha);
      // Cancel BullMQ job if still queued
      await repairQueue.remove(job.id);
      await slackService.notify(job.id, 'superseded',
        `ℹ️ Job superseded — new commit pushed to ${branch}`);
    }
  }

Repository addition:
  findActiveJobsByBranch(repositoryId: string, branchName: string): Promise<Job[]>
  // JOIN jobs → failures → pipeline_runs → commits → branches
  // WHERE status IN ('queued', 'running') AND branch.name = branchName
```

---

### EC-41: No soft-delete cleanup job

**Scenario:** Tables with `deleted_at` columns (`organizations`, `vector_memory`)
accumulate soft-deleted rows indefinitely. The pgvector HNSW index degrades as
dead rows increase.

**Risk:** Query performance degradation, index bloat.

**Enhancement Spec:**

```
Service: Add to existing cron scheduler (background/cron/cron.scheduler.ts)

@Cron(CronExpression.EVERY_WEEK)
async cleanupSoftDeletes(): Promise<void> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);  // 90 days

  // Hard-delete soft-deleted records older than 90 days
  await db.delete(vectorMemory).where(
    and(isNotNull(vectorMemory.deletedAt), lt(vectorMemory.deletedAt, cutoff))
  );

  // Rebuild HNSW index after bulk deletes (prevents index bloat)
  await db.execute(sql`REINDEX INDEX idx_vector_memory_embedding`);

  // Clean expired cooldowns
  await costTrackingRepository.deleteExpiredCooldowns();

  this.logger.log('Soft-delete cleanup completed');
}
```

---

### EC-42: Webhook endpoints — no rate limiting

**Scenario:** A misconfigured GitHub App or a malicious actor floods the
webhook endpoint with thousands of requests per second, filling the repair
queue and exhausting the LLM budget.

**Risk:** Budget exhaustion, Redis memory overflow, denial of service.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Global `ThrottlerGuard` | EXISTS | `app.module.ts` |
| `@Public()` on webhook endpoints (bypasses throttler) | EXISTS | Webhook controllers |
| Webhook-specific rate limiting | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
Apply a SEPARATE rate limiter to webhook endpoints:

// In webhook controller:
@Throttle({ webhook: { limit: 1000, ttl: 60 } })  // 1000 req/min
@Post('github')
async handleGithubWebhook(...) { ... }

// Or use a custom guard that rate-limits per installation ID:
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

### EC-43: Vector memory staleness

**Scenario:** A successful fix for "missing import in NestJS 10" is stored
in vector memory. 2 years later, the repo uses NestJS 14 with breaking
changes. The RAG retrieves the old fix pattern, Claude follows it, and
produces an incorrect fix.

**Risk:** Stale fix patterns actively harm future repairs.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `vector_memory.confidence` | EXISTS | `intelligence.ts` |
| `vector_memory.usageCount` | EXISTS | `intelligence.ts` |
| `vector_memory.lastUsedAt` | EXISTS | `intelligence.ts` |
| Framework/language version tracking | **NOT IMPLEMENTED** | — |
| Staleness decay | **NOT IMPLEMENTED** | — |

**Enhancement Spec:**

```
Schema additions to vector_memory:
  framework_version VARCHAR(50)   -- e.g., 'nestjs@11.0', 'react@19'
  language_version VARCHAR(50)    -- e.g., 'typescript@5.9', 'python@3.12'
  created_at TIMESTAMPTZ          -- already exists

Similarity query enhancement:
  When searching for similar fixes:
  1. Filter by language (already done)
  2. Filter by language_version MAJOR (e.g., typescript@5.x matches typescript@5.y)
  3. Deprioritize entries older than 6 months (reduce similarity score by 10%)
  4. Deprioritize entries with framework_version mismatch (reduce by 20%)

  // In VectorMemoryRepository.findSimilar():
  const entries = await db.select()
    .from(vectorMemory)
    .where(and(
      eq(vectorMemory.language, language),
      isNull(vectorMemory.deletedAt),
    ))
    // Apply pgvector cosine similarity
    // Post-filter: apply staleness decay
    ;

  // Decay formula:
  const ageMonths = (Date.now() - entry.createdAt.getTime()) / (30 * 24 * 60 * 60 * 1000);
  const decayFactor = Math.max(0.5, 1.0 - (ageMonths * 0.02));  // 2% per month, min 50%
  entry.adjustedSimilarity = entry.rawSimilarity * decayFactor;
```

---

### EC-44: Secret scrubber — no test vectors

**Scenario:** A new secret pattern (e.g., Anthropic API key `sk-ant-...`)
is not covered by the scrubber. It gets sent to the LLM in the error log
or file contents.

**Risk:** Secret exfiltration to third-party LLM provider.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| `SecretScrubberService` | EXISTS | `common/services/secret-scrubber.service.ts` |
| 11 redaction patterns | EXISTS | `common/utils/secret-scrubber.ts` |
| 13 unit tests | EXISTS | `common/services/secret-scrubber.service.spec.ts` |
| Curated test vector suite | MISSING | — |

**Enhancement Spec:**

```
Create a comprehensive test vector file and CI gate:

// test-vectors/secret-patterns.ts
export const SECRET_TEST_VECTORS: Array<{ name: string; input: string; mustRedact: boolean }> = [
  // AWS
  { name: 'AWS Access Key', input: 'AKIAIOSFODNN7EXAMPLE', mustRedact: true },
  { name: 'AWS Secret Key', input: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', mustRedact: true },

  // GitHub
  { name: 'GitHub PAT (classic)', input: 'ghp_ABCDEFghijklmnop1234567890abcdef', mustRedact: true },
  { name: 'GitHub PAT (fine-grained)', input: 'github_pat_11ABCDEF_xyzxyz', mustRedact: true },
  { name: 'GitHub App token', input: 'ghs_ABCDEFghijklmnop1234567890ab', mustRedact: true },

  // Anthropic / OpenAI
  { name: 'Anthropic API key', input: 'sk-ant-api03-abcdefghijklmnop', mustRedact: true },
  { name: 'OpenAI API key', input: 'sk-proj-abcdefghijklmnop1234567890', mustRedact: true },

  // Database
  { name: 'PostgreSQL URL', input: 'postgresql://admin:s3cret@db.host:5432/mydb', mustRedact: true },
  { name: 'Redis URL', input: 'redis://:password@redis.host:6379/0', mustRedact: true },

  // Private keys
  { name: 'RSA private key', input: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIB...', mustRedact: true },
  { name: 'EC private key', input: '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEE...', mustRedact: true },

  // JWT / Tokens
  { name: 'Bearer token', input: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...', mustRedact: true },
  { name: 'Slack token', input: 'xoxb-1234-5678-abcdefghijkl', mustRedact: true },

  // Negatives (must NOT be redacted)
  { name: 'Normal import path', input: "import { auth } from './auth.guard'", mustRedact: false },
  { name: 'Hash constant', input: 'const HASH = "a3f8b2c1d4e5f6"', mustRedact: false },
  { name: 'Short hex string', input: 'color: #ff0000', mustRedact: false },
];

// In secret-scrubber.service.spec.ts:
describe('Secret Test Vectors (CI Gate)', () => {
  for (const vector of SECRET_TEST_VECTORS) {
    it(`should ${vector.mustRedact ? 'redact' : 'preserve'}: ${vector.name}`, () => {
      const result = service.scrub(vector.input);
      if (vector.mustRedact) {
        expect(result.cleaned).not.toContain(vector.input);
        expect(result.count).toBeGreaterThan(0);
      } else {
        expect(result.cleaned).toContain(vector.input);
      }
    });
  }
});

Currently MISSING patterns to add to secret-scrubber.ts:
  - Anthropic keys: /sk-ant-[\w-]+/g
  - AWS access keys: /AKIA[0-9A-Z]{16}/g
  - AWS secret keys: /[A-Za-z0-9/+=]{40}/ (near AWS context)
  - Slack tokens: /xox[baprs]-[\w-]+/g
```

---

### EC-45: SLA / SLO definitions

**Scenario:** The team needs to know "how fast should HealOps fix errors?"
and "what's acceptable failure rate?" Without defined SLOs, there's no way
to measure if the system is performing well.

**Enhancement Spec:**

```
DEFINE THESE SLOs:

| Metric | SLO Target | Prometheus Query |
|--------|-----------|-----------------|
| Time to first fix attempt | < 5 min from webhook | healops_fix_latency_seconds{quantile="0.95"} |
| Fix success rate (code errors) | > 60% | healops_jobs_total{status="success"} / healops_jobs_total |
| Fix success rate (dependency) | > 40% | (filtered by error_type) |
| Escalation rate | < 40% | healops_escalation_total / healops_jobs_total |
| Mean time to PR | < 10 min | (from webhook to pr_created timestamp) |
| Quality gate pass rate | > 80% | (attempts passing QG / total attempts) |
| Agent availability | 99.9% uptime | Standard infra monitoring |

INSTRUMENT: Add to HealopsMetricsService (EC-38).
ALERT: Set Prometheus alerting rules for SLO breaches.
```

---

## Category I — Queue & DLQ Infrastructure

These issues were identified by analyzing the full BullMQ queue topology, dead-letter
queue routing, and fire-and-forget call patterns across the codebase.

---

### EC-46: `healops-repair` queue — missing DLQ, Bull Board, wrong process

**Scenario:** The `healops-repair` queue is the most critical queue in HealOps,
yet it has the weakest infrastructure of any queue in the system:
- Uses a **raw string** `'healops-repair'` — not in `QueueName` enum
- **Not registered in Bull Board** — invisible in `/admin/queues`
- **No DLQ routing** — when all retries are exhausted, the job silently enters
  BullMQ's failed set with no alert, no escalation, no DLQ entry
- No `@OnWorkerEvent('failed')`, `@OnWorkerEvent('stalled')`, or `@OnWorkerEvent('error')`
- Registered in `AppModule` (API process) instead of `WorkerModule`

**Risk:** Failed repair jobs silently disappear. No human is notified. The queue
is invisible in Bull Board. Long-running repair jobs compete with HTTP requests.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Queue registration | EXISTS (raw string) | `repair-jobs.module.ts` |
| Processor | EXISTS (TODO stub) | `repair-jobs.processor.ts` |
| DLQ routing on failure | **NOT IMPLEMENTED** | — |
| DLQ routing on stalled | **NOT IMPLEMENTED** | — |
| DLQ routing on error | **NOT IMPLEMENTED** | — |
| QueueName enum entry | **NOT IMPLEMENTED** | `job.constant.ts` |
| Bull Board registration | **NOT IMPLEMENTED** | — |
| Worker process registration | **NOT IMPLEMENTED** | See EC-34 |

**Enhancement Spec:**

```
PART A — Register in QueueName enum and Bull Board:

  // In background/constants/job.constant.ts:
  export enum QueueName {
    // ... existing entries ...
    HEALOPS_REPAIR = 'healops-repair',
  }

  // Add to QUEUE_LIST array:
  QUEUE_LIST.push({
    name: QueueName.HEALOPS_REPAIR,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { age: 7 * 24 * 3600 },
      removeOnFail: { age: 30 * 24 * 3600 },  // Keep failed for 30 days
    },
  });

PART B — Add DLQ routing to RepairJobsProcessor:

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

    // Also escalate — repair DLQ items need human attention
    await this.slackService.notify(job.data.jobId, 'escalated',
      `DLQ: Repair job exhausted all retries. Error: ${error.message}`);
  }

  @OnWorkerEvent('stalled')
  async onStalled(jobId: string): Promise<void> {
    this.logger.warn(`Repair job stalled: ${jobId}`);
    await this.deadLetterQueueService.addFailedJobToDLQ({
      queueName: QueueName.HEALOPS_REPAIR,
      jobId, jobName: 'repair',
      jobData: {}, failedReason: 'Job stalled — worker may have crashed',
      attemptsMade: 0, maxAttempts: 3, timestamp: new Date(),
    });
  }

PART C — Move to WorkerModule (see EC-34):
  RepairJobsProcessor must be in WorkerModule, not AppModule.
```

---

### EC-47: Fire-and-forget patterns — silent data loss

**Scenario:** Multiple critical services swallow errors and return `null` instead
of propagating failures. This causes silent data loss throughout the pipeline:
- `SlackService.notify()` — catches error, logs it, never retries
- `EscalationService.escalate()` — catches all errors, returns `null`
- `PullRequestService.createDraftPr()` — catches all errors, returns `null`
- `GithubService.*` (all methods) — return `null`/`false`/`[]` on any error
- `CostTrackingService.recordUsage()` — no error handling, crashes caller

**Risk:** A Slack outage means engineers never learn about repair events.
A GitHub outage means branches are pushed but no PR or issue is created.
A DB blip in cost tracking crashes the entire repair job.

**Current Implementation:**

| Component | Status | Reference |
|-----------|--------|-----------|
| Slack retry queue | **NOT IMPLEMENTED** | `slack.service.ts` — fire-and-forget |
| GitHub API retry/circuit breaker | **NOT IMPLEMENTED** | `github.service.ts` — returns null |
| Escalation retry | **NOT IMPLEMENTED** | `escalation.service.ts` — returns null |
| PR creation retry | **NOT IMPLEMENTED** | `pull-request.service.ts` — returns null |
| Cost tracking error handling | **NOT IMPLEMENTED** | `cost-tracking.service.ts` — no try/catch |

**Enhancement Spec:**

```
PRIORITY ORDER (implement most critical first):

1. SLACK NOTIFICATION QUEUE (P0):
   Create a 'healops-slack' BullMQ queue with retry:

   // SlackService.notify() becomes a queue producer:
   async notify(jobId: string, type: string, message: string): Promise<void> {
     await this.slackQueue.add('send-notification', {
       jobId, type, message, webhookUrl: this.config.slack.webhookUrl,
     }, {
       attempts: 5,
       backoff: { type: 'exponential', delay: 5000 },
     });
   }

   // SlackNotificationProcessor does the actual HTTP call:
   @Processor('healops-slack')
   export class SlackNotificationProcessor extends WorkerHost {
     async process(job: Job): Promise<void> {
       await fetch(job.data.webhookUrl, {
         method: 'POST',
         body: JSON.stringify(this.buildPayload(job.data)),
       });
     }
   }

2. GITHUB API ERROR PROPAGATION (P1):
   Stop swallowing errors. Instead of returning null:

   // Before (dangerous):
   } catch (error) {
     this.logger.error(`Failed: ${error.message}`);
     return null;  // caller silently continues
   }

   // After (safe):
   } catch (error) {
     this.logger.error(`Failed: ${error.message}`);
     throw error;  // let caller handle or let BullMQ retry the job
   }

   For methods where null is acceptable (getFileContent on 404):
   - Only catch specific status codes (404)
   - Rethrow everything else

3. COST TRACKING ERROR ISOLATION (P1):
   Wrap in try/catch so cost tracking failure doesn't crash repair jobs:

   async recordUsage(input: RecordUsageInput): Promise<void> {
     try {
       await this.costTrackingRepository.upsertMonthlyCost({ ... });
     } catch (error) {
       this.logger.error(`Cost tracking failed (non-fatal): ${error.message}`);
       // Non-fatal — repair should continue even if cost tracking fails
       // But emit a metric so we detect persistent failures:
       this.metricsService.incrementCounter('healops_cost_tracking_errors_total');
     }
   }

4. ESCALATION RETRY (P1):
   If GitHub issue creation fails, retry via queue:
   - DB insert for escalation record should succeed first
   - Queue the GitHub issue creation separately
   - If issue creation ultimately fails, record escalation.issueUrl = 'FAILED'
     and alert via Slack
```

---

### EC-48: DLQ processor — logs only, no real alerting

**Scenario:** The `DeadLetterProcessor` receives failed jobs from email,
notification, webhook, and cron queues. Its entire implementation is:
```typescript
this.logger.error(logString_);
return 'DLQ job processed for review';
```
No Sentry, no Slack alert, no DB persistence. Failed jobs are "processed" by
being logged and considered done.

**Risk:** Critical failures (e.g., email queue exhaustion, webhook delivery
failure) are silently marked as "processed" in the DLQ with no alert to ops.

**Enhancement Spec:**

```
Enhance DeadLetterProcessor.process():

async process(job: Job<IDLQFailedJobData>): Promise<void> {
  const { queueName, jobId, failedReason, attemptsMade, maxAttempts } = job.data;

  // 1. Persist to DB for querying
  await this.auditLogRepository.createAuditLog({
    entityType: 'dlq',
    entityId: jobId,
    action: 'job_failed_permanently',
    actorType: 'system',
    metadata: {
      queueName,
      failedReason,
      attemptsMade,
      maxAttempts,
      originalJobData: JSON.stringify(job.data.jobData).slice(0, 5000),
    },
  });

  // 2. Alert via Slack (if Slack queue is available, else direct call)
  const isHighPriority = [QueueName.HEALOPS_REPAIR, QueueName.WEBHOOK].includes(queueName);
  if (isHighPriority) {
    await this.slackService.notifyOps(
      `DLQ Alert: ${queueName} job ${jobId} failed after ${attemptsMade} attempts.\n` +
      `Reason: ${failedReason}`
    );
  }

  // 3. Increment Prometheus counter
  this.metricsService.incrementCounter('dlq_jobs_total', { queue: queueName });

  // 4. Future: Send to Sentry
  // Sentry.captureException(new Error(`DLQ: ${queueName} - ${failedReason}`));
}
```

---

### EC-49: `media-upload` queue — no processor

**Scenario:** The `media-upload` queue is registered in `QueueName` enum,
included in `QUEUE_LIST`, and visible in Bull Board. But there is NO
`@Processor('media-upload')` class anywhere in the codebase. Any job added
to this queue will sit in Redis waiting state indefinitely.

**Risk:** Silent queue buildup. If any code adds a media upload job, it
never gets processed. Redis memory grows without bound.

**Enhancement Spec:**

```
TWO OPTIONS:

OPTION A — Create the processor (if async media uploads are needed):
  @Processor(QueueName.MEDIA_UPLOAD)
  export class MediaUploadProcessor extends WorkerHost {
    async process(job: Job<IMediaUploadJob>): Promise<void> {
      const { filePath, destinationKey, provider } = job.data;
      await this.mediaService.uploadToProvider(filePath, destinationKey, provider);
    }
  }

OPTION B — Remove the queue (if media uploads are synchronous):
  - Remove MEDIA_UPLOAD from QueueName enum
  - Remove from QUEUE_LIST
  - Remove IMediaUploadJob interface
  - Verify no code calls mediaUploadQueue.add()
  - Clean up any orphaned jobs in Redis: FLUSHDB is dangerous,
    use BullMQ's queue.obliterate() instead

RECOMMENDATION: Audit first. If grep finds zero callers of the queue,
remove it (Option B). Dead infrastructure creates confusion.
```

---

## Category J — Deployment & Operations

### EC-50: API version response header

**Scenario:** Consumer repos calling the validation callback endpoint need to
know which API contract version they're talking to. Without a version header,
there's no way to detect breaking changes or gracefully deprecate endpoints.

**Risk:** Silent API contract breakage during upgrades.

**Enhancement Spec:**

```
Add a global NestJS interceptor that sets a version header on every response:

@Injectable()
export class ApiVersionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-HealOps-API-Version', '1.0.0');
    response.setHeader('X-HealOps-Min-Client-Version', '1.0.0');
    return next.handle();
  }
}

// Register globally in app.module.ts:
{ provide: APP_INTERCEPTOR, useClass: ApiVersionInterceptor }

// In the validation workflow (.github/workflows/healops-validation.yml):
// The callback script should check the version header and warn if mismatched.
```

---

### EC-51: Blue/green deployment — BullMQ job compatibility

**Scenario:** During a rolling deploy, Worker v2 starts processing while Worker
v1 still has in-flight jobs. If v2 changes the `RepairJobData` shape or
`AgentState` schema, v1's checkpointed state becomes incompatible.

**Risk:** Orphaned jobs, corrupted state, failed repairs during deployments.

**Enhancement Spec:**

```
THREE SAFEGUARDS:

1. JOB DATA VERSIONING:
   Add a version field to all BullMQ job data:

   interface RepairJobData {
     version: number;  // e.g., 1
     jobId: string;
     failureId: string;
     repositoryId: string;
   }

   In the processor:
   if (job.data.version !== CURRENT_JOB_VERSION) {
     this.logger.warn(`Job ${job.id} has version ${job.data.version}, expected ${CURRENT_JOB_VERSION}`);
     // For backwards-compatible changes: process normally
     // For breaking changes: re-enqueue with new shape or fail gracefully
   }

2. GRACEFUL SHUTDOWN:
   In WorkerModule.onModuleDestroy():
   - Stop accepting new jobs: worker.pause()
   - Wait for in-flight jobs to complete (with timeout)
   - Then shut down

3. STATE CHECKPOINT MIGRATION:
   When resuming a checkpointed AgentState from a previous version:
   - Check for missing fields, apply defaults
   - Never crash on missing state — degrade gracefully
   - Log a warning: "Resumed job from older state version"
```

---

### EC-52: GitHub App permission scope documentation

**Scenario:** The GitHub App must request specific permission scopes to operate.
A missing scope causes silent 403 errors on every API call. There is no
documentation of the minimum required scopes.

**Risk:** Installation fails silently. All branch pushes, PR creations, and
log fetches return null.

**Enhancement Spec:**

```
MINIMUM REQUIRED GITHUB APP PERMISSIONS:

| Permission | Access | Why Needed |
|-----------|--------|------------|
| Contents | Read & Write | Read file contents, push fix branches |
| Pull requests | Read & Write | Create draft PRs, close stale PRs |
| Issues | Read & Write | Create escalation issues |
| Actions | Read-only | Read workflow run status and logs |
| Checks | Read-only | Verify pipeline status |
| Metadata | Read-only | Required by GitHub for all apps |

WEBHOOK EVENTS TO SUBSCRIBE:
  - workflow_run (failure detection)
  - push (superseded job detection — EC-40)

IMPLEMENTATION:
  1. Document in .env.healops.example as comments
  2. Add a startup health check in GithubAppProvider.onModuleInit():
     - Verify installation has required permissions
     - Log warning if any are missing
     - Fail startup if critical permissions (contents, pull_requests) are missing

  async onModuleInit(): Promise<void> {
    const { permissions } = await this.getInstallationInfo(installationId);
    const required = ['contents', 'pull_requests', 'issues', 'actions'];
    const missing = required.filter(p => !permissions[p]);
    if (missing.length > 0) {
      this.logger.error(`GitHub App missing permissions: ${missing.join(', ')}`);
      throw new Error('GitHub App installation has insufficient permissions');
    }
  }
```

---

### EC-53: Secrets management infrastructure

**Scenario:** Production secrets (GitHub App private key, OpenRouter API key,
Slack webhook URL, database credentials) are stored in `.env` files. These
are not rotatable without restarts and are vulnerable to accidental exposure
in container images or log output.

**Risk:** Secret compromise requires manual intervention across all instances.

**Enhancement Spec:**

```
v1 — Environment variables with validation:
  Currently implemented. Enhance with:
  - Startup validation that all required secrets are present
  - Never log secret values (already addressed by SecretScrubber for LLM context,
    but also ensure logger redaction for internal logs)

v2 — Secrets manager integration:
  Use ConfigModule.forRoot() with a custom ConfigFactory that reads from:
  - AWS Secrets Manager (recommended for AWS deployments)
  - HashiCorp Vault (recommended for on-prem)
  - Kubernetes Secrets (minimum for K8s deployments)

  Implementation:
  @Injectable()
  export class SecretsManagerConfigFactory {
    async load(): Promise<Record<string, string>> {
      const client = new SecretsManagerClient({ region: 'us-east-1' });
      const response = await client.send(
        new GetSecretValueCommand({ SecretId: 'healops/production' })
      );
      return JSON.parse(response.SecretString ?? '{}');
    }
  }

  // Auto-rotation: AWS Secrets Manager supports automatic rotation
  // for RDS credentials. GitHub App private keys must be rotated manually.

Document rotation procedure:
  1. GitHub App private key: Generate new key in GitHub, update secret, deploy
  2. OpenRouter API key: Rotate in OpenRouter dashboard, update secret
  3. Slack webhook URL: Regenerate in Slack app settings, update secret
  4. Database password: Use AWS RDS automatic rotation
```

---

### CG-01: Missing Job Statuses

The spec requires statuses that don't exist in our system:

| Required Status | Purpose | Edge Cases |
|----------------|---------|------------|
| `aborted` | User fixed before agent could push | EC-01, EC-02, EC-03 |

**Current statuses (9):** `queued`, `running`, `success`, `failed`, `escalated`,
`superseded`, `flaky_skipped`, `budget_exceeded`, `circular_fix_detected`

**Action:** Add `aborted` to the jobs status set (comment in `agent.ts:29`).
No schema migration needed — the column is `varchar(50)`.

---

### CG-02: Missing Slack Notification Types

The spec defines 7 notification events. Our system has 8 types but is missing 2:

| Spec Event | Our Type | Status |
|------------|----------|--------|
| Pipeline failure detected | `pipeline_failed` | EXISTS |
| Fix attempt in progress | — | **MISSING** → add `fix_attempt_started` |
| Fix successful + PR opened | `pr_created` | EXISTS |
| Retry (attempt N/3) | `pre_check_failed` / `runner_failed` | PARTIAL |
| Failed all 3 → human needed | `escalated` | EXISTS |
| PR merged | — | **MISSING** → add `pr_merged` |
| Duplicate fix detected | `superseded` | EXISTS |

**Action:**
- Add `fix_attempt_started` notification: "Attempt {N}/3 — Fixing [{errorType}]"
- Add `pr_merged` notification: triggered by merge webhook event
- Enhance retry notifications to include attempt number and previous failure reason

---

### CG-03: Missing Per-Error Resolution Tracking

The spec defines 5 resolution types per individual error:

| Resolution Type | Description |
|----------------|-------------|
| `AGENT_FIXED` | Agent fixed it, included in PR |
| `USER_FIXED` | User pushed fix before agent could |
| `AGENT_FIX_DISCARDED` | Agent had working fix but user fixed it first |
| `ESCALATED` | Agent failed 3 times, human took over |
| `CASCADING_RESOLVED` | Fixing another error resolved this one too |

**Current state:** Resolution is tracked at the **job** level, not per-error.
The `failures` table doesn't have a resolution field.

**Action:** Add to `failures` table:
```sql
ALTER TABLE failures ADD COLUMN resolution_type VARCHAR(50);
ALTER TABLE failures ADD COLUMN resolved_by VARCHAR(255);
-- resolved_by: 'agent:job_id' or 'user:commit_sha' or 'cascade:parent_failure_id'
```

---

### CG-04: Stale PR Cron Job (Central Infrastructure)

Multiple edge cases (EC-02, EC-03, EC-07, EC-22) require a periodic cron job
that checks open agent PRs. This should be ONE service:

```
StalePrCleanupService
  Schedule: Every 15 minutes
  Checks:
    1. Pipeline status on main (EC-02, EC-03)
    2. Error hash comparison (EC-02, EC-03)
    3. PR mergeability / conflicts (EC-07, EC-24)
    4. Stale branch cleanup (EC-22)
```

---

### CG-05: `ValidatorService` Implementation

Multiple edge cases depend on the validator actually running:
- EC-12: Build + test execution
- EC-16/27: Lockfile regeneration
- EC-24: Merge conflict detection

Current state: `validator.service.ts:32` is a TODO stub that always returns
`{ passed: true }`.

**v1 action:** Implement at minimum:
- TypeScript: `npx tsc --noEmit` in a temp directory
- Lockfile check: warn if package.json changed without lockfile

**v2 action:** Full sandboxed execution with Docker containers.

---

## Enhancement Priority Matrix

### P0 — Safety Critical (implement before production)

| ID | Enhancement | Edge Cases | Effort |
|----|-------------|------------|--------|
| P0-1 | Pipeline pre-check (isPipelineStillFailing) | EC-01, EC-04, EC-06 | Small |
| P0-2 | ValidatorService: tsc --noEmit | EC-12 | Medium |
| P0-3 | Lockfile consistency check in quality gate | EC-16, EC-27 | Small |
| P0-4 | Add `aborted` job status | EC-01 | Trivial |
| P0-5 | Webhook ingestion buffer (durable BullMQ queue) | EC-29 | Medium |
| P0-6 | Agent state checkpointing + orphan recovery | EC-30 | Large |
| P0-7 | waitForValidation timeout + race condition fix | EC-31 | Medium |
| P0-8 | Worker/API process separation verification | EC-34 | Small |
| P0-9 | Validation callback idempotency | EC-37 | Small |
| P0-10 | healops-repair queue DLQ routing + Bull Board | EC-46 | Medium |
| P0-11 | Slack notification queue (async with retry) | EC-47 | Medium |

### P1 — High Priority (implement for v1 launch)

| ID | Enhancement | Edge Cases | Effort |
|----|-------------|------------|--------|
| P1-1 | Stale PR cron job (StalePrCleanupService) | EC-02, EC-03, EC-07 | Medium |
| P1-2 | Rebase check before push | EC-05 | Medium |
| P1-3 | Rich escalation issue body | EC-19 | Small |
| P1-4 | Test assertion detection in quality gate | EC-13 | Small |
| P1-5 | Error hash dedup in enqueue | EC-06 | Small |
| P1-6 | Cascading error prompt guidance | EC-10, EC-11 | Small |
| P1-7 | Missing Slack notification types | CG-02 | Small |
| P1-8 | TOCTOU race — Redis distributed lock on enqueue | EC-32 | Small |
| P1-9 | GitHub token singleflight (thundering herd) | EC-33 | Small |
| P1-10 | CI log size — 3-layer smart extraction | EC-35 | Medium |
| P1-11 | Agent observability (metrics, spans, audit) | EC-38 | Large |
| P1-12 | Superseded job trigger on push events | EC-40 | Medium |
| P1-13 | Webhook-specific rate limiting | EC-42 | Small |
| P1-14 | DLQ processor real alerting (Sentry/Slack/DB) | EC-48 | Small |
| P1-15 | GitHub API error propagation (stop swallowing) | EC-47 | Medium |
| P1-16 | Cost tracking error isolation | EC-47 | Trivial |
| P1-17 | GitHub App permission scope verification | EC-52 | Small |

### P2 — Medium Priority (implement for v1.1)

| ID | Enhancement | Edge Cases | Effort |
|----|-------------|------------|--------|
| P2-1 | PR dedup by error hash | EC-23 | Medium |
| P2-2 | Target branch validation | EC-25 | Small |
| P2-3 | Dependency version sanity check | EC-15 | Small |
| P2-4 | Oscillation detection | EC-20 | Medium |
| P2-5 | Per-error resolution tracking | CG-03 | Medium |
| P2-6 | Cross-file import context enrichment | EC-17 | Large |
| P2-7 | Minor quality gate additions (`: any`, Promise catch) | EC-14 | Trivial |
| P2-8 | Tenant isolation (AsyncLocalStorage + future RLS) | EC-39 | Large |
| P2-9 | Vector memory staleness decay | EC-43 | Medium |
| P2-10 | Secret scrubber comprehensive test vectors | EC-44 | Small |
| P2-11 | DB connection pooling (API vs Worker) | EC-36 | Small |
| P2-12 | API version response header | EC-50 | Trivial |
| P2-13 | media-upload queue audit (create processor or remove) | EC-49 | Small |

### P3 — Future (v2+)

| ID | Enhancement | Edge Cases | Effort |
|----|-------------|------------|--------|
| P3-1 | Full sandboxed validation (Docker) | EC-12 | Large |
| P3-2 | Lockfile regeneration in sandbox | EC-16, EC-27 | Large |
| P3-3 | npm registry version validation | EC-15 | Medium |
| P3-4 | Monorepo scope routing | EC-28 | Large |
| P3-5 | Root-cause error clustering | EC-10 | Large |
| P3-6 | Contradictory diff detection | EC-18 | Medium |
| P3-7 | Version conflict solver | EC-26 | Large |
| P3-8 | Semantic diff equivalence | EC-21 | Medium |
| P3-9 | Hidden error re-diagnosis loop | EC-09 | Medium |
| P3-10 | Soft-delete cleanup + HNSW reindex cron | EC-41 | Small |
| P3-11 | SLA/SLO definitions + Prometheus alerting | EC-45 | Medium |
| P3-12 | Blue/green deploy + BullMQ job versioning | EC-51 | Large |
| P3-13 | Secrets manager integration (Vault/AWS) | EC-53 | Large |

---

## Coverage Summary

| Category | Total | Fully Handled | Partial | Not Implemented |
|----------|:-----:|:------------:|:-------:|:---------------:|
| A: Race Conditions | 7 | 1 | 3 | 3 |
| B: Multiple Causes | 4 | 0 | 3 | 1 |
| C: Fix Quality | 6 | 1 | 3 | 2 |
| D: Retry & Loop | 4 | 2 | 2 | 0 |
| E: Git & PR | 4 | 1 | 1 | 2 |
| F: Dependency | 3 | 0 | 0 | 3 |
| G: Infrastructure & Resilience | 10 | 0 | 4 | 6 |
| H: Enterprise & Operations | 7 | 0 | 2 | 5 |
| I: Queue & DLQ Infrastructure | 4 | 0 | 1 | 3 |
| J: Deployment & Operations | 4 | 0 | 0 | 4 |
| **Total** | **53** | **5** | **19** | **29** |

After implementing P0 + P1 enhancements: **36/53 fully handled, 11/53 partial, 6/53 deferred to v2+.**

---

*Document Version: 3.0*
*Generated: 2026-02-27*
*Source: Cross-referenced against all service files, schema definitions, repository methods, and BullMQ queue topology in `apps/backend/src/`. Incorporates 17 architectural findings + 8 queue/DLQ infrastructure gaps.*
