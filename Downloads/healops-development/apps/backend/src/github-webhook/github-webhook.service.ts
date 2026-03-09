// ─── GitHub Webhook Service ─────────────────────────────────────────────────
// Business logic for inbound webhook processing.
// Implements the 6-check guard chain for safe, idempotent webhook handling.

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookEventsRepository } from '@db/repositories/healops/webhook-events.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { FailuresRepository } from '@db/repositories/healops/failures.repository';
import { CostTrackingRepository } from '@db/repositories/healops/cost-tracking.repository';
import { computeHmacSha256, verifySignature, hashError } from '@common/utils/hash';
import { GithubService } from '@github/github.service';
import { LogParserService } from '@repair-agent/services/log-parser.service';
import { CostTrackingService } from '@cost-tracking/cost-tracking.service';
import { RepairJobsService } from '@repair-jobs/repair-jobs.service';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { WebhookIngestQueueService } from '@bg/queue/webhook-ingest/webhook-ingest-queue.service';
import { FixRequestQueue } from '@bg/queue/fix-request/fix-request.queue';

export interface GithubWebhookInput {
  signature: string;
  event: string;
  deliveryId: string;
  rawBody: string;
  payload: Record<string, unknown>;
}

// ─── Payload type helpers ────────────────────────────────────────────────────

interface WorkflowRunPayload {
  action?: string;
  workflow_run?: {
    id?: number;
    name?: string;
    path?: string;
    head_branch?: string;
    head_sha?: string;
    conclusion?: string;
    html_url?: string;
    run_started_at?: string;
    updated_at?: string;
    head_commit?: {
      author?: { name?: string };
      message?: string;
    };
  };
  repository?: {
    id?: number;
    full_name?: string;
    name?: string;
    default_branch?: string;
    language?: string;
    owner?: {
      login?: string;
    };
  };
  installation?: {
    id?: number;
  };
  organization?: {
    login?: string;
    id?: number;
  };
}

@Injectable()
export class GithubWebhookService {
  private readonly logger = new Logger(GithubWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookEventsRepository: WebhookEventsRepository,
    private readonly platformRepository: PlatformRepository,
    private readonly failuresRepository: FailuresRepository,
    private readonly costTrackingRepository: CostTrackingRepository,
    private readonly costTrackingService: CostTrackingService,
    private readonly githubService: GithubService,
    private readonly logParserService: LogParserService,
    private readonly repairJobsService: RepairJobsService,
    private readonly jobsRepository: HealopsJobsRepository,
    private readonly webhookIngestQueueService: WebhookIngestQueueService,
    private readonly fixRequestQueue: FixRequestQueue,
  ) {}

  async processGithubWebhook(input: GithubWebhookInput): Promise<void> {
    // 1. Verify HMAC-SHA256 signature
    const secret = this.configService.get<string>('GITHUB_WEBHOOK_SECRET') ?? '';
    const computed = computeHmacSha256(input.rawBody, secret);
    if (!verifySignature(computed, input.signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    try {
      // 2. Resolve repository first (needed for webhook_events FK constraint)
      const payload = input.payload as unknown as WorkflowRunPayload;
      const repository = await this.resolveRepository(payload);

      if (!repository) {
        this.logger.warn(`Cannot resolve repository from payload — delivery ${input.deliveryId}`);
        return;
      }

      // 3. Idempotent insert — ON CONFLICT (external_event_id) DO NOTHING
      const event = await this.webhookEventsRepository.createWebhookEvent({
        externalEventId: input.deliveryId,
        repositoryId: repository.id,
        provider: 'github',
        eventType: input.event,
        payload: input.payload,
        signatureValid: true,
      });

      if (!event) {
        this.logger.debug(`Duplicate webhook event ignored: ${input.deliveryId}`);
        return;
      }

      // 4. Enqueue for durable async processing via BullMQ (EC-29)
      await this.webhookIngestQueueService.enqueueWebhookIngest({
        webhookEventId: event.id,
        eventType: input.event,
        payload: input.payload,
        repository: {
          id: repository.id,
          organizationId: repository.organizationId,
          name: repository.name,
          defaultBranch: repository.defaultBranch,
          primaryLanguage: repository.primaryLanguage,
          githubInstallationId: repository.githubInstallationId,
        },
      });
    } catch (error) {
      this.logger.error(
        `Webhook processing failed for ${input.deliveryId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  // ─── Async Processing — 6-Check Guard Chain ────────────────────────────────

  async processEventAsync(
    webhookEventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    repository: ResolvedRepository,
  ): Promise<void> {
    try {
      await this.runGuardChain(webhookEventId, eventType, payload, repository);
    } catch (error) {
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        `Processing error: ${(error as Error).message}`,
      );
      this.logger.error(
        `Webhook guard chain failed for ${webhookEventId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  private async runGuardChain(
    webhookEventId: string,
    eventType: string,
    payload: Record<string, unknown>,
    repository: ResolvedRepository,
  ): Promise<void> {
    const typed = payload as unknown as WorkflowRunPayload;
    const workflowRun = typed.workflow_run;

    // EC-40: Handle push events — supersede active jobs on same branch
    if (eventType === 'push') {
      const pushRef = (payload as Record<string, unknown>)['ref'] as string | undefined;
      if (pushRef?.startsWith('refs/heads/')) {
        const pushBranch = pushRef.replace('refs/heads/', '');
        await this.handlePushSupersede(repository.id, pushBranch, webhookEventId);
      }
      return;
    }

    // Pre-filter: only process workflow_run events
    if (eventType !== 'workflow_run') {
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        'Ignored — not workflow_run',
      );
      return;
    }

    // Log every workflow_run event and fetch error logs for failures
    const buildErrors = await this.logPipelineEvent(typed, webhookEventId, repository);

    // Pre-filter: only process completed failures
    if (typed.action !== 'completed' || workflowRun?.conclusion !== 'failure') {
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        'Ignored — not a completed failure',
      );
      return;
    }

    const settings = await this.platformRepository.findSettingsByRepositoryId(repository.id);
    const headBranch = workflowRun?.head_branch ?? '';
    const headSha = workflowRun?.head_sha ?? '';

    // ──── Check 1: Is this a validation callback? ────────────────────────────
    const workflowPath = workflowRun?.path ?? '';
    const workflowName = workflowRun?.name ?? '';
    const validationFile = settings?.validationWorkflowFile ?? 'healops-validation.yml';

    if (
      workflowPath.includes(validationFile) ||
      workflowName.includes(validationFile)
    ) {
      this.logger.log(
        `Check 1: Validation callback detected for ${workflowName}, skipping normal processing`,
      );
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        'Validation callback — handled by /validation-complete endpoint',
      );
      return;
    }
    this.logger.log('Check 1: Not a validation callback — continuing');

    // ──── Check 2: Is this a PatchPilot branch? ──────────────────────────────
    const branchRecord = await this.platformRepository.findBranchByRepoAndName(
      repository.id,
      headBranch,
    );
    if (branchRecord?.isHealopsBranch) {
      this.logger.warn(`Check 2: PatchPilot branch detected (${headBranch}), skipping to prevent loop`);
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        'HealOps branch — loop prevention (DB flag)',
      );
      return;
    }
    // Fallback: check by naming convention
    if (headBranch.startsWith('healops/fix/') || headBranch.startsWith('patchpilot/fix/') || headBranch.startsWith('agent-fix/')) {
      this.logger.warn(`Check 2: PatchPilot branch detected by name (${headBranch}), skipping`);
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        'HealOps branch — loop prevention (name pattern)',
      );
      return;
    }
    this.logger.log('Check 2: Not a PatchPilot branch — continuing');

    // ──── Check 3: Is this a PatchPilot commit? ──────────────────────────────
    if (headSha) {
      const commitRecord = await this.platformRepository.findCommitByRepoAndSha(
        repository.id,
        headSha,
      );
      if (commitRecord?.source === 'healops') {
        this.logger.warn(`Check 3: PatchPilot commit detected (${headSha}), skipping`);
        await this.webhookEventsRepository.markProcessed(
          webhookEventId,
          'PatchPilot commit — loop prevention',
        );
        return;
      }
    }
    this.logger.log('Check 3: Not a PatchPilot commit — continuing');

    // ──── Check 4: Is there an active cooldown? ──────────────────────────────
    const failureTypeHint = 'unknown';
    const isOnCooldown = await this.costTrackingRepository.isOnCooldown(
      repository.id,
      headBranch,
      failureTypeHint,
    );
    if (isOnCooldown) {
      this.logger.warn(`Check 4: Active cooldown for ${repository.id}/${headBranch}`);
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        `Cooldown active for branch ${headBranch}`,
      );
      return;
    }
    this.logger.log('Check 4: No active cooldown — continuing');

    // ──── Check 5: Is the budget exhausted? ──────────────────────────────────
    const hasBudget = await this.costTrackingService.hasBudget(repository.organizationId);
    if (!hasBudget) {
      this.logger.warn(`Check 5: Budget exhausted for org ${repository.organizationId}`);
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        'Budget exhausted — skipping repair',
      );
      return;
    }
    this.logger.log('Check 5: Budget available — continuing');

    // ──── Check 6: All checks passed — dispatch repair job ──────────────────
    this.logger.log(`Check 6: All checks passed for ${webhookEventId}, dispatching`);

    // Resolve pipeline context (branch + commit + pipeline_run) BEFORE dispatching
    const pipelineCtx = await this.resolvePipelineContext(webhookEventId, repository, typed);
    if (!pipelineCtx) return;

    // Dispatch AI fix jobs with full repo context
    await this.dispatchAiFixJobs(buildErrors, headBranch, headSha, pipelineCtx.pipelineRunId, repository);

    await this.dispatchRepairJob(webhookEventId, repository, typed, pipelineCtx);
  }

  // ─── Dispatch AI Fix Jobs ───────────────────────────────────────────────

  private async dispatchAiFixJobs(
    buildErrors: Array<Record<string, unknown>>,
    headBranch: string,
    headSha: string,
    pipelineRunId: string,
    repository: ResolvedRepository,
  ): Promise<void> {
    if (buildErrors.length === 0) {
      this.logger.log('[AI_FIX] No build errors to dispatch');
      return;
    }

    this.logger.log(`[AI_FIX] Dispatching ${String(buildErrors.length)} build error(s) as single batch job`);

    const errors = buildErrors.map((buildError) => ({
      errorMessage: String(buildError['extractedErrorMessage'] ?? ''),
      codeSnippet: String(buildError['codeSnippet'] ?? ''),
      lineNumber: Number(buildError['errorLine'] ?? 0),
      branch: headBranch,
      commitSha: headSha,
      filePath: String(buildError['errorFile'] ?? ''),
      language: String(buildError['language'] ?? 'typescript'),
    }));

    // Parse owner/repo from repository name (format: "owner/repo")
    const parts = repository.name.split('/');
    const owner = parts.length >= 2 ? (parts[0] ?? '') : '';
    const repo = parts.length >= 2 ? (parts[1] ?? '') : repository.name;

    const installationId = repository.githubInstallationId
      ?? this.configService.get<string>('GITHUB_INSTALLATION_ID')
      ?? '';

    try {
      const { jobId } = await this.fixRequestQueue.addBatchFixRequest({
        buildErrors: errors,
        branch: headBranch,
        commitSha: headSha,
        pipelineRunId,
        repositoryId: repository.id,
        organizationId: repository.organizationId,
        scmProvider: 'github',
        scmConnectionConfig: {
          owner,
          repo,
          authToken: installationId,
        },
        // backward compat
        githubInstallationId: installationId,
        owner,
        repo,
      });
      this.logger.log(
        `[AI_FIX] Batch job ${jobId} dispatched with ${String(buildErrors.length)} error(s) for ${headBranch}@${headSha.slice(0, 8)}`,
      );
    } catch (error) {
      this.logger.warn(
        `[AI_FIX] Failed to dispatch batch job: ${(error as Error).message}`,
      );
    }
  }

  // ─── Resolve Pipeline Context ─────────────────────────────────────────────
  // Creates branch + commit + pipeline_run records BEFORE any queue dispatching.

  private async resolvePipelineContext(
    webhookEventId: string,
    repository: ResolvedRepository,
    typed: WorkflowRunPayload,
  ): Promise<PipelineContext | null> {
    const workflowRun = typed.workflow_run;
    const headBranch = workflowRun?.head_branch ?? '';
    const headSha = workflowRun?.head_sha ?? '';
    const runId = workflowRun?.id;
    const runUrl = workflowRun?.html_url ?? '';

    // 1. Resolve or create branch record
    let branch = await this.platformRepository.findBranchByRepoAndName(repository.id, headBranch);
    if (!branch) {
      branch = await this.platformRepository.createBranch({
        repositoryId: repository.id,
        name: headBranch,
        isDefault: headBranch === repository.defaultBranch,
        isHealopsBranch: false,
      });
    }
    if (!branch) {
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        'Failed to resolve branch record',
      );
      return null;
    }

    // 2. Resolve or create commit record
    let commit = await this.platformRepository.findCommitByRepoAndSha(repository.id, headSha);
    if (!commit) {
      commit = await this.platformRepository.createCommit({
        repositoryId: repository.id,
        branchId: branch.id,
        commitSha: headSha,
        author: workflowRun?.head_commit?.author?.name ?? 'unknown',
        message: workflowRun?.head_commit?.message ?? null,
        source: 'developer',
        committedAt: new Date(),
      });
    }
    if (!commit) {
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        'Failed to resolve commit record',
      );
      return null;
    }

    // 3. Create pipeline_run record
    const pipelineRun = await this.webhookEventsRepository.createPipelineRun({
      commitId: commit.id,
      webhookEventId,
      externalRunId: String(runId ?? ''),
      workflowName: workflowRun?.name ?? null,
      provider: 'github',
      status: 'failed',
      logUrl: runUrl,
      startedAt: workflowRun?.run_started_at ? new Date(workflowRun.run_started_at) : null,
      completedAt: workflowRun?.updated_at ? new Date(workflowRun.updated_at) : null,
    });

    if (!pipelineRun) {
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        'Duplicate pipeline run — already processed',
      );
      return null;
    }

    this.logger.log(
      `[PIPELINE_CTX] Created branch=${branch.id},  commit=${commit.id}, pipeline_run=${pipelineRun.id}`,
    );

    return {
      pipelineRunId: pipelineRun.id,
      branchId: branch.id,
      commitId: commit.id,
    };
  }

  // ─── Dispatch repair job ──────────────────────────────────────────────────

  private async dispatchRepairJob(
    webhookEventId: string,
    repository: ResolvedRepository,
    typed: WorkflowRunPayload,
    pipelineCtx: PipelineContext,
  ): Promise<void> {
    this.logger.log(`[DISPATCH] Starting dispatchRepairJob for ${webhookEventId}`);
    const workflowRun = typed.workflow_run;
    const headBranch = workflowRun?.head_branch ?? '';
    const headSha = workflowRun?.head_sha ?? '';
    const runId = workflowRun?.id;

    // 3. Download and parse CI logs
    let errorSnippet = '';
    let affectedFile = '';
    let language = repository.primaryLanguage ?? 'typescript';
    let errorTypeCode = 'SYNTAX_ERROR';

    const dispatchInstallationId = repository.githubInstallationId
      ?? this.configService.get<string>('GITHUB_INSTALLATION_ID')
      ?? '';
    if (runId && dispatchInstallationId) {
      const repoInfo = this.extractRepoInfo(typed);
      if (repoInfo) {
        const rawLogs = await this.githubService.getWorkflowRunLogs(
          dispatchInstallationId,
          repoInfo.owner,
          repoInfo.repo,
          runId,
        );
        if (rawLogs) {
          const truncatedLogs = this.logParserService.truncateRawLog(rawLogs);
          const parsed = this.logParserService.parseLog(truncatedLogs, language);
          errorSnippet = parsed.errorSnippet;
          affectedFile = parsed.affectedFile;
          language = parsed.language;
          errorTypeCode = this.logParserService.classifyErrorType(errorSnippet, language);
        }
      }
    }

    // 4. Resolve error_type ID from code
    const errorType = await this.failuresRepository.findErrorTypeByCode(errorTypeCode);
    const fallbackErrorType = errorType ?? await this.failuresRepository.findErrorTypeByCode('SYNTAX_ERROR');
    if (!fallbackErrorType) {
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        'No error_types seeded — cannot create failure record',
      );
      return;
    }

    // 5. Create failure record
    const errorHash = hashError(errorSnippet || `${headBranch}:${headSha}`);
    const truncatedSnippet = this.logParserService.truncateToTokenBudget(
      errorSnippet || 'No error snippet extracted',
      2000,
    );

    const failure = await this.failuresRepository.createFailure({
      pipelineRunId: pipelineCtx.pipelineRunId,
      errorTypeId: fallbackErrorType.id,
      errorSummary: truncatedSnippet,
      errorHash,
      rawErrorLog: errorSnippet || null,
      affectedFile: affectedFile || null,
      language,
    });

    // 6. Dispatch to repair queue via RepairJobsService (includes cooldown/flaky/dedup checks)
    const jobId = await this.repairJobsService.enqueueRepair({
      failureId: failure.id,
      repositoryId: repository.id,
      branchName: headBranch,
      failureType: errorTypeCode,
      errorHash,
      organizationId: repository.organizationId,
    });

    if (jobId) {
      this.logger.log(
        `Job ${jobId} dispatched to repair queue for failure ${failure.id}`,
      );
    } else {
      this.logger.warn(
        `RepairJobsService declined to enqueue (cooldown/flaky/dedup) for failure ${failure.id}`,
      );
    }

    // 7. Mark webhook event as processed
    await this.webhookEventsRepository.markProcessed(webhookEventId);
  }

  // ─── Log Pipeline Event ─────────────────────────────────────────────────

  private async logPipelineEvent(
    typed: WorkflowRunPayload,
    webhookEventId: string,
    repository: ResolvedRepository,
  ): Promise<Array<Record<string, unknown>>> {
    const run = typed.workflow_run;
    const action = typed.action ?? 'unknown';
    const runId = run?.id ?? 'N/A';
    const workflow = run?.name ?? 'unknown';
    const branch = run?.head_branch ?? 'unknown';
    const sha = run?.head_sha?.substring(0, 8) ?? 'N/A';
    const conclusion = run?.conclusion ?? 'N/A';
    const url = run?.html_url ?? '';
    const author = run?.head_commit?.author?.name ?? 'unknown';
    const commitMsg = run?.head_commit?.message?.split('\n')[0] ?? '';

    const pipelineEvent = {
      repositoryName: repository.name,
      workflowName: workflow,
      branchName: branch,
      commit: `${sha} — ${commitMsg.substring(0, 50)}`,
      author,
      action,
      conclusion,
      runId,
      url,
      eventId: webhookEventId,
    };
    const buildErrors: Array<Record<string, unknown>> = [];

    const lines: string[] = [
      '╔══════════════════════════════════════════════════════════════╗',
      '║  PIPELINE EVENT                                             ║',
      '╠══════════════════════════════════════════════════════════════╣',
      `║  Repository : ${repository.name}`,
      `║  Workflow   : ${workflow}`,
      `║  Branch     : ${branch}`,
      `║  Commit     : ${sha} — ${commitMsg.substring(0, 50)}`,
      `║  Author     : ${author}`,
      `║  Action     : ${action}`,
      `║  Conclusion : ${conclusion}`,
      `║  Run ID     : ${String(runId)}`,
      `║  URL        : ${url}`,
      `║  Event ID   : ${webhookEventId}`,
    ];

    // For completed failures, fetch and parse CI build logs
    if (action === 'completed' && run?.conclusion === 'failure') {
      try {
        const repoInfo = this.extractRepoInfo(typed);
        const installationId = repository.githubInstallationId
          ?? this.configService.get<string>('GITHUB_INSTALLATION_ID')
          ?? '';
        if (repoInfo && run.id && installationId) {
          const rawLogs = await this.githubService.getWorkflowRunLogs(
            installationId,
            repoInfo.owner,
            repoInfo.repo,
            run.id,
          );

          if (rawLogs) {
            // Clean ANSI codes and timestamps from every line
            const cleanLines = rawLogs.split('\n').map((l) =>
              l.replace(/\x1b\[[0-9;]*m/g, '').replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, ''),
            );

            // Find ALL real build error lines — only [API] lines, skip [WORKER] duplicates
            const errorIndices: number[] = [];
            const seenErrors = new Set<string>();
            for (let i = 0; i < cleanLines.length; i++) {
              const cl = cleanLines[i] ?? '';
              if (/error\s*TS\d+|Type error:/i.test(cl)) {
                // Skip [WORKER] lines — same errors are reported by [API] in a cleaner format
                if (/\[WORKER\]/.test(cl) || /##\[error\].*\[WORKER\]/.test(cl)) continue;
                const dedupKey = cl.replace(/^\[[\w]+\]\s*/, '').trim();
                if (!seenErrors.has(dedupKey)) {
                  seenErrors.add(dedupKey);
                  errorIndices.push(i);
                }
              }
            }

            if (errorIndices.length > 0) {
              const language = repository.primaryLanguage ?? 'typescript';

              for (let errNum = 0; errNum < errorIndices.length; errNum++) {
                const errorIdx = errorIndices[errNum]!;
                const prevEnd = errNum > 0 ? Math.min(errorIndices[errNum - 1]! + 11, errorIdx) : 0;
                const nextErrorIdx = errNum + 1 < errorIndices.length ? errorIndices[errNum + 1]! : cleanLines.length;
                const start = Math.max(prevEnd, errorIdx - 5);
                const end = Math.min(cleanLines.length, errorIdx + 11, nextErrorIdx);
                const snippet = cleanLines.slice(start, end);

                const errorLine = cleanLines[errorIdx] ?? '';
                const errorType = this.logParserService.classifyErrorType(errorLine, language);
                // Strip ##[error] and prefixes like [WORKER] [API] for cleaner parsing
                const fullMessage = errorLine.replace(/^##\[error\]/, '').trim();
                const strippedForParsing = fullMessage.replace(/^\[[\w]+\]\s*/, '');
                const location = this.logParserService.parseErrorLocation(strippedForParsing, language);

                // Fetch actual source code from GitHub for a clean snippet
                let codeSnippet = '';
                const headSha = run?.head_sha ?? '';
                if (location.file !== 'unknown' && location.line > 0 && headSha) {
                  try {
                    const fileContent = await this.githubService.getFileContent(
                      installationId,
                      repoInfo.owner,
                      repoInfo.repo,
                      location.file,
                      headSha,
                    );
                    if (fileContent) {
                      const sourceLines = fileContent.split('\n');
                      const snippetStart = Math.max(0, location.line - 6);
                      const snippetEnd = Math.min(sourceLines.length, location.line + 5);
                      codeSnippet = sourceLines
                        .slice(snippetStart, snippetEnd)
                        .map((l, i) => {
                          const lineNum = snippetStart + i + 1;
                          const marker = lineNum === location.line ? '>' : ' ';
                          return `${marker} ${String(lineNum).padStart(4)} │ ${l}`;
                        })
                        .join('\n');
                    }
                  } catch {
                    // Non-fatal — fall back to CI log snippet
                  }
                }
                // Fallback to raw CI log lines if source fetch failed
                if (!codeSnippet) {
                  codeSnippet = snippet
                    .filter((l) => !/\[WORKER\]/.test(l))
                    .map((l) => `  ${l}`)
                    .join('\n');
                }

                const buildError: Record<string, unknown> = {
                  errorNumber: errNum + 1,
                  errorType,
                  errorFile: location.file,
                  errorLine: location.line,
                  language,
                  errorMessage: fullMessage,
                  extractedErrorMessage: location.message,
                  codeSnippet,
                };
                buildErrors.push(buildError);
                this.logger.log(`[errorMessage] ${buildError["errorMessage"]}}`);

                lines.push('╠══════════════════════════════════════════════════════════════╣');
                lines.push(`║  BUILD ERROR #${String(errNum + 1)}                                            ║`);
                lines.push('╠══════════════════════════════════════════════════════════════╣');
                lines.push(`║  Error Type             : ${errorType}`);
                lines.push(`║  File                   : ${location.file}`);
                lines.push(`║  Line                   : ${String(location.line)}`);
                lines.push(`║  Language               : ${language}`);
                lines.push(`║  Message                : ${fullMessage}`);
                lines.push(`║  Extracted Error Message : ${location.message}`);
                lines.push('╠══════════════════════════════════════════════════════════════╣');
                const snippetLines = codeSnippet.split('\n');
                for (const sl of snippetLines) {
                  lines.push(`║  ${sl}`);
                }
              }

              lines.push('╠══════════════════════════════════════════════════════════════╣');
              lines.push(`║  Total Build Errors: ${String(errorIndices.length)}                                    ║`);
            } else {
              lines.push('╠══════════════════════════════════════════════════════════════╣');
              lines.push('║  Build failed but could not find error TS / Type error      ║');
            }
          } else {
            lines.push('╠══════════════════════════════════════════════════════════════╣');
            lines.push('║  Could not download CI logs from GitHub                     ║');
          }
          this.logger.log(`[PIPELINE_EVENT] ${JSON.stringify(pipelineEvent, null, 2)}`);
          this.logger.log(`[BUILD_ERRORS] (${String(buildErrors.length)} errors) ${JSON.stringify(buildErrors, null, 2)}`);
        }
      } catch (error) {
        this.logger.error(`[PIPELINE_EVENT] Error in log extraction: ${(error as Error).message}`, (error as Error).stack);
        lines.push('╠══════════════════════════════════════════════════════════════╣');
        lines.push(`║  Error fetching logs: ${(error as Error).message}`);
      }
    }

    lines.push('╚══════════════════════════════════════════════════════════════╝');

    const logBlock = lines.join('\n');
    this.logger.log(logBlock);

    return buildErrors;
  }

  // ─── EC-40: Supersede active jobs on push event ──────────────────────────

  private async handlePushSupersede(
    repositoryId: string,
    branchName: string,
    webhookEventId: string,
  ): Promise<void> {
    const activeJobs = await this.jobsRepository.findActiveJobsByRepoBranch(
      repositoryId,
      branchName,
    );

    if (activeJobs.length === 0) {
      await this.webhookEventsRepository.markProcessed(
        webhookEventId,
        `Push on ${branchName} — no active jobs to supersede`,
      );
      return;
    }

    for (const job of activeJobs) {
      await this.jobsRepository.updateJobStatus(job.id, 'superseded');
      this.logger.log(`Superseded job ${job.id} due to new push on ${branchName}`);
    }

    await this.webhookEventsRepository.markProcessed(
      webhookEventId,
      `Push on ${branchName} — superseded ${String(activeJobs.length)} active job(s)`,
    );
  }

  // ─── Helper: Resolve repository from payload ─────────────────────────────

  private async resolveRepository(
    payload: WorkflowRunPayload,
  ): Promise<ResolvedRepository | null> {
    const repoInfo = this.extractRepoInfo(payload);
    if (!repoInfo) return null;

    // Try to find existing repository by provider + external ID
    const repository = await this.platformRepository.findRepositoryByProviderAndExternalId(
      'github',
      String(repoInfo.externalId),
    );

    if (repository) {
      // Backfill githubInstallationId if missing — try payload first, then env fallback
      if (!repository.githubInstallationId) {
        const installationId = repoInfo.installationId
          ? String(repoInfo.installationId)
          : (this.configService.get<string>('GITHUB_INSTALLATION_ID') ?? null);

        if (installationId) {
          const updated = await this.platformRepository.updateRepositoryInstallationId(
            repository.id,
            installationId,
          );
          if (updated) {
            this.logger.log(
              `Backfilled githubInstallationId=${installationId} for ${repository.name}`,
            );
            return { ...repository, githubInstallationId: installationId };
          }
        }
      }
      return repository;
    }

    // Auto-create organization and repository for first-time webhook
    const orgLogin = payload.organization?.login ?? repoInfo.owner;
    const org = await this.platformRepository.createOrganization({
      name: orgLogin,
      slug: orgLogin.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    });

    const newRepo = await this.platformRepository.createRepository({
      organizationId: org.id,
      provider: 'github',
      externalRepoId: String(repoInfo.externalId),
      name: repoInfo.fullName,
      defaultBranch: repoInfo.defaultBranch,
      primaryLanguage: repoInfo.language,
      githubInstallationId: repoInfo.installationId
        ? String(repoInfo.installationId)
        : (this.configService.get<string>('GITHUB_INSTALLATION_ID') ?? null),
    });

    // Create default settings
    await this.platformRepository.upsertSettings({
      repositoryId: newRepo.id,
    });

    return newRepo;
  }

  // ─── Helper: Extract repo info from payload ───────────────────────────────

  private extractRepoInfo(payload: WorkflowRunPayload) {
    const repo = payload.repository;
    if (!repo?.full_name || !repo.id) return null;

    const parts = repo.full_name.split('/');
    const owner = parts[0];
    const repoName = parts[1];
    if (!owner || !repoName) return null;

    return {
      owner,
      repo: repoName,
      fullName: repo.full_name,
      externalId: repo.id,
      defaultBranch: repo.default_branch ?? 'main',
      language: repo.language ?? null,
      installationId: payload.installation?.id ?? null,
    };
  }
}

export type ResolvedRepository = {
  id: string;
  organizationId: string;
  name: string;
  defaultBranch: string;
  primaryLanguage: string | null;
  githubInstallationId: string | null;
};

interface PipelineContext {
  pipelineRunId: string;
  branchId: string;
  commitId: string;
}
