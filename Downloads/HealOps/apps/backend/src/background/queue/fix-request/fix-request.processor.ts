// ─── Fix Request Processor ──────────────────────────────────────────────────
// BullMQ worker for the AI fix pipeline.
// Single errors: manual API (POST /v1/healops/fix-request) — no branch/push.
// Batch errors: webhook pipeline — creates agent branch, fixes all errors,
//               commits and pushes to GitHub.

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JobName, QueueName } from '@bg/constants/job.constant';
import { GithubService } from '@github/github.service';
import { HealopsPullRequestsRepository } from '@db/repositories/healops/pull-requests.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { WebhookEventsRepository } from '@db/repositories/healops/webhook-events.repository';
import { FixAgentService, type FixAgentOutput } from './services/fix-agent.service';
import type { FixRequestPayload, BatchFixRequestPayload } from './fix-request.queue';

/** Result returned from the processor for a single fix — visible in Bull Board. */
export interface FixResult {
  fixRequestId: string;
  jobId: string | null;
  status: 'completed' | 'failed' | 'out_of_scope';
  classifiedErrorType: string;
  isInScope: boolean;
  scopeReason: string;
  totalAttempts: number;
  fixSummary: string;
  fixedCode: string;
  fixConfidence: number;
  totalTokensUsed: number;
}

/** Result returned from a batch fix job — wraps individual results. */
export interface BatchFixResult {
  totalErrors: number;
  completed: number;
  failed: number;
  outOfScope: number;
  totalTokensUsed: number;
  results: FixResult[];
  agentBranch: string | null;
  agentCommitSha: string | null;
}

/** Number of lines to show before/after the error line when building a code window. */
const CODE_WINDOW_BEFORE = 15;
const CODE_WINDOW_AFTER = 15;

@Processor(QueueName.HEALOPS_FIX_REQUEST, { concurrency: 1 })
export class FixRequestProcessor extends WorkerHost {
  private readonly logger = new Logger(FixRequestProcessor.name);

  constructor(
    private readonly fixAgentService: FixAgentService,
    private readonly githubService: GithubService,
    private readonly platformRepository: PlatformRepository,
    private readonly webhookEventsRepository: WebhookEventsRepository,
    private readonly pullRequestsRepository: HealopsPullRequestsRepository,
  ) {
    super();
  }

  async process(
    job: Job<FixRequestPayload | BatchFixRequestPayload, FixResult | BatchFixResult, string>,
  ): Promise<FixResult | BatchFixResult> {
    if (job.name === JobName.BATCH_FIX_REQUEST) {
      return this.processBatch(job as Job<BatchFixRequestPayload, BatchFixResult, string>);
    }

    if (job.name === JobName.FIX_REQUEST) {
      return this.processSingle(job as Job<FixRequestPayload, FixResult, string>);
    }

    this.logger.warn(`Unknown job name: ${job.name}`);
    return this.emptyResult();
  }

  // ─── Single error (manual API / testing pathway) ──────────────────────

  private async processSingle(
    job: Job<FixRequestPayload, FixResult, string>,
  ): Promise<FixResult> {
    const { errorMessage, branch, commitSha } = job.data;

    this.logger.log(
      `[HEALOPS_FIX_REQUEST] Processing job ${String(job.id)} — ` +
        `branch=${branch} commit=${commitSha.slice(0, 8)} ` +
        `error="${errorMessage.slice(0, 80)}..."`,
    );

    const result = await this.runFixAgent(job.data);

    this.logger.log(
      `[HEALOPS_FIX_REQUEST] Job ${String(job.id)} → ${result.status} ` +
        `(type=${result.classifiedErrorType}, attempts=${String(result.totalAttempts)}, ` +
        `tokens=${String(result.totalTokensUsed)}, confidence=${String(Math.round(result.fixConfidence * 100))}%)`,
    );

    if (typeof job.log === 'function') {
      await job.log(JSON.stringify(result, null, 2));
    }

    return result;
  }

  // ─── Batch errors (webhook pipeline pathway) ─────────────────────────

  private async processBatch(
    job: Job<BatchFixRequestPayload, BatchFixResult, string>,
  ): Promise<BatchFixResult> {
    const {
      buildErrors, branch, commitSha,
      pipelineRunId, repositoryId, githubInstallationId, owner, repo,
    } = job.data;

    // Validate that repo context is available (missing for old jobs queued before code change)
    const hasRepoContext = Boolean(pipelineRunId && repositoryId && githubInstallationId && owner && repo);

    this.logger.log(
      `[BATCH_FIX_REQUEST] Processing job ${String(job.id)} — ` +
        `${String(buildErrors.length)} error(s), branch=${branch} commit=${commitSha.slice(0, 8)}` +
        (hasRepoContext ? ` pipeline=${pipelineRunId}` : ' (no repo context)'),
    );

    if (typeof job.log === 'function') {
      await job.log(`Processing ${String(buildErrors.length)} build errors from ${branch}@${commitSha.slice(0, 8)}`);
    }

    // ── 1. Create agent branch on GitHub ──────────────────────────────────
    let agentBranch: string | null = null;
    let branchCreated = false;

    if (hasRepoContext) {
      agentBranch = `agent-fix/${branch}`;
      this.logger.log(
        `[BATCH_FIX_REQUEST] Creating branch ${agentBranch} from ${commitSha.slice(0, 8)} ` +
          `(installationId=${githubInstallationId}, owner=${owner}, repo=${repo})`,
      );
      try {
        branchCreated = await this.githubService.createBranch(
          githubInstallationId,
          owner,
          repo,
          agentBranch,
          commitSha,
        );
        this.logger.log(`[BRANCH NAME CREATED] ${agentBranch} (result=${String(branchCreated)})`);
      } catch (error) {
        const errMsg = (error as Error).message;
        this.logger.error(
          `[BATCH_FIX_REQUEST] Failed to create branch ${agentBranch}: ${errMsg}`,
        );
        if (typeof job.log === 'function') {
          await job.log(`BRANCH CREATION FAILED: ${errMsg}`);
          await job.log(
            `  installationId=${githubInstallationId} owner=${owner} repo=${repo} sha=${commitSha}`,
          );
        }
      }
    } else {
      this.logger.warn(
        `[BATCH_FIX_REQUEST] Skipping branch creation — missing repo context ` +
          `(pipelineRunId=${String(pipelineRunId)}, repositoryId=${String(repositoryId)}, ` +
          `installationId=${String(githubInstallationId)}, owner=${String(owner)}, repo=${String(repo)})`,
      );
      if (typeof job.log === 'function') {
        await job.log(
          `SKIPPED branch creation — hasRepoContext=false: ` +
            `pipelineRunId=${String(pipelineRunId)}, repositoryId=${String(repositoryId)}, ` +
            `installationId=${String(githubInstallationId)}, owner=${String(owner)}, repo=${String(repo)}`,
        );
      }
    }

    // ── 2. Store branch in DB + update pipeline_runs.agent_branch ─────────
    let branchRecordId: string | null = null;

    if (branchCreated && agentBranch) {
      const branchRecord = await this.platformRepository.createBranch({
        repositoryId,
        name: agentBranch,
        isHealopsBranch: true,
        autoDeleteAfter: new Date(Date.now() + 48 * 60 * 60 * 1000),
      });
      branchRecordId = branchRecord?.id ?? null;

      await this.webhookEventsRepository.updatePipelineRunAgentBranch(
        pipelineRunId,
        agentBranch,
      );

      if (typeof job.log === 'function') {
        await job.log(`Created agent branch: ${agentBranch}`);
      }
    }

    // ── 2b. Enrich errors with actual source code from GitHub ──────────
    // CI logs produce noisy snippets ([API] prefixes, ANSI codes, error messages).
    // The LLM needs real source code to generate targeted fixes.
    if (hasRepoContext) {
      await this.enrichWithSourceCode(buildErrors, githubInstallationId, owner, repo, commitSha);
    }

    // ── 3. Fix all errors ─────────────────────────────────────────────────
    const results: FixResult[] = [];
    let totalTokens = 0;

    for (let i = 0; i < buildErrors.length; i++) {
      const error = buildErrors[i]!;
      const errorNum = i + 1;

      this.logger.log(
        `[BATCH_FIX_REQUEST] Job ${String(job.id)} — error ${String(errorNum)}/${String(buildErrors.length)} ` +
          `file=${error.filePath ?? 'unknown'} error="${error.errorMessage.slice(0, 80)}..."`,
      );

      if (typeof job.log === 'function') {
        await job.log(`\n── Error ${String(errorNum)}/${String(buildErrors.length)}: ${error.errorMessage.slice(0, 100)}...`);
      }

      const result = await this.runFixAgent(error);
      results.push(result);
      totalTokens += result.totalTokensUsed;

      if (typeof job.log === 'function') {
        await job.log(
          `   → ${result.status} (type=${result.classifiedErrorType}, ` +
            `attempts=${String(result.totalAttempts)}, tokens=${String(result.totalTokensUsed)})`,
        );
      }
    }

    // ── 4. Collect successful fixes and push to GitHub ────────────────────
    let agentCommitSha: string | null = null;
    const completedResults = results.filter(
      (r) => r.status === 'completed' && r.fixedCode,
    );

    if (branchCreated && agentBranch && completedResults.length > 0) {
      // Group fixes by file path so multiple errors in the same file
      // are all applied to ONE copy of the original content.
      // Without this, the second fix would overwrite the first (both start from original).
      const fixesByFile = new Map<string, Array<{ errorLineNumber: number; fixedCode: string }>>();
      const filePathCache = new Map<string, { resolvedPath: string; originalContent: string | null }>();

      for (const r of completedResults) {
        const idx = results.indexOf(r);
        const filePath = this.resolveFilePath(r, buildErrors, results);
        const errorLineNumber = idx >= 0 && idx < buildErrors.length
          ? buildErrors[idx]?.lineNumber ?? 0
          : 0;

        this.logger.log(
          `[FILE_PATCH] idx=${String(idx)} filePath=${filePath ?? 'null'} ` +
            `errorLine=${String(errorLineNumber)} ` +
            `fixedCodeLen=${String(r.fixedCode.length)} ` +
            `fixedCodeLines=${String(r.fixedCode.split('\n').length)}`,
        );

        if (filePath && r.fixedCode) {
          // Resolve the full repo-relative path (CI logs report paths relative to working dir)
          if (!filePathCache.has(filePath)) {
            const resolved = await this.resolveRepoFile(
              githubInstallationId, owner, repo, commitSha, filePath,
            );
            filePathCache.set(filePath, resolved);
          }
          const cached = filePathCache.get(filePath)!;

          const existing = fixesByFile.get(cached.resolvedPath) ?? [];
          existing.push({ errorLineNumber, fixedCode: r.fixedCode });
          fixesByFile.set(cached.resolvedPath, existing);
        }
      }

      // Now apply all fixes for each file to ONE copy of original content
      const files: Array<{ path: string; content: string }> = [];

      for (const [resolvedPath, fixes] of fixesByFile) {
        // Find original content from cache
        let originalContent: string | null = null;
        for (const [, cached] of filePathCache) {
          if (cached.resolvedPath === resolvedPath) {
            originalContent = cached.originalContent;
            break;
          }
        }

        this.logger.log(
          `[FILE_PATCH] Merging ${String(fixes.length)} fix(es) for ${resolvedPath}`,
        );

        // Apply all fixes sequentially to the same content
        let patchedContent = originalContent ?? '';
        for (const fix of fixes) {
          patchedContent = this.applyFixAtLine(
            resolvedPath, patchedContent, fix.errorLineNumber, fix.fixedCode,
          );
        }

        this.logger.log(
          `[FILE_PATCH] result for ${resolvedPath}: patchedLen=${String(patchedContent.length)} patchedLines=${String(patchedContent.split('\n').length)}`,
        );

        files.push({ path: resolvedPath, content: patchedContent });
      }

      if (files.length > 0) {
        // Build commit summary
        const summaries = completedResults
          .map((r) => r.fixSummary || r.classifiedErrorType)
          .filter(Boolean);
        const summaryText = summaries.length <= 3
          ? summaries.join(', ')
          : `${summaries.slice(0, 3).join(', ')} and ${String(summaries.length - 3)} more`;
        const commitMessage = `Agent-${pipelineRunId}:${summaryText}`;

        try {
          agentCommitSha = await this.githubService.pushFiles(
            githubInstallationId,
            owner,
            repo,
            agentBranch,
            files,
            commitMessage,
          );

          this.logger.log(
            `[BATCH_FIX_REQUEST] Pushed ${String(files.length)} file(s) to ${agentBranch} — commit ${agentCommitSha.slice(0, 8)}`,
          );

          // Store commit in DB
          if (branchRecordId) {
            await this.platformRepository.createCommit({
              repositoryId,
              branchId: branchRecordId,
              commitSha: agentCommitSha,
              author: 'healops-agent',
              message: commitMessage,
              source: 'healops',
              committedAt: new Date(),
            });
          }

          // Create draft PR (skip if one already exists for this branch)
          await this.createFixPr(agentBranch, branch, pipelineRunId, githubInstallationId, owner, repo);

          if (typeof job.log === 'function') {
            await job.log(`\nPushed ${String(files.length)} fix(es) to ${agentBranch} — commit ${agentCommitSha.slice(0, 8)}`);
          }
        } catch (error) {
          this.logger.error(
            `[BATCH_FIX_REQUEST] Failed to push files: ${(error as Error).message}`,
          );
          if (typeof job.log === 'function') {
            await job.log(`\nFailed to push files: ${(error as Error).message}`);
          }
        }
      }
    }

    // ── 5. Return batch result ────────────────────────────────────────────
    const batchResult: BatchFixResult = {
      totalErrors: buildErrors.length,
      completed: results.filter((r) => r.status === 'completed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      outOfScope: results.filter((r) => r.status === 'out_of_scope').length,
      totalTokensUsed: totalTokens,
      results,
      agentBranch: branchCreated ? agentBranch : null,
      agentCommitSha,
    };

    this.logger.log(
      `[BATCH_FIX_REQUEST] Job ${String(job.id)} done — ` +
        `${String(batchResult.completed)} completed, ${String(batchResult.failed)} failed, ` +
        `${String(batchResult.outOfScope)} out_of_scope, ${String(totalTokens)} tokens` +
        (agentCommitSha ? `, pushed to ${agentBranch}` : ''),
    );

    if (typeof job.log === 'function') {
      await job.log(`\n── Batch Summary ──`);
      await job.log(JSON.stringify(batchResult, null, 2));
    }

    return batchResult;
  }

  // ─── Shared: run fix agent for a single error ─────────────────────────

  private async runFixAgent(payload: FixRequestPayload): Promise<FixResult> {
    const {
      errorMessage,
      codeSnippet,
      lineNumber,
      branch,
      commitSha,
      filePath,
      language,
    } = payload;

    const output: FixAgentOutput = await this.fixAgentService.execute({
      errorMessage,
      codeSnippet,
      lineNumber,
      branch,
      commitSha,
      ...(filePath !== undefined && { filePath }),
      ...(language !== undefined && { language }),
    });

    return {
      fixRequestId: output.fixRequestId,
      jobId: output.jobId,
      status: output.status,
      classifiedErrorType: output.classifiedErrorType,
      isInScope: output.isInScope,
      scopeReason: output.scopeReason,
      totalAttempts: output.totalAttempts,
      fixSummary: output.fixSummary,
      fixedCode: output.fixedCode,
      fixConfidence: output.fixConfidence,
      totalTokensUsed: output.totalTokensUsed,
    };
  }

  /**
   * Replace CI-log code snippets with actual source code from GitHub.
   * Fetches each error's file at the commit SHA and extracts a window of lines
   * around the error line, giving the LLM real code context instead of log noise.
   */
  private async enrichWithSourceCode(
    errors: FixRequestPayload[],
    installationId: string,
    owner: string,
    repo: string,
    commitSha: string,
  ): Promise<void> {
    // Cache fetched files to avoid re-fetching for multiple errors in the same file
    const fileCache = new Map<string, { resolvedPath: string; content: string }>();

    for (const error of errors) {
      if (!error.filePath || error.lineNumber <= 0) continue;

      let cached = fileCache.get(error.filePath);
      if (!cached) {
        const { resolvedPath, originalContent } = await this.resolveRepoFile(
          installationId, owner, repo, commitSha, error.filePath,
        );
        if (!originalContent) {
          this.logger.warn(
            `[ENRICH] Could not fetch source for ${error.filePath} — keeping CI log snippet`,
          );
          continue;
        }
        cached = { resolvedPath, content: originalContent };
        fileCache.set(error.filePath, cached);
      }

      const lines = cached.content.split('\n');
      const errorIdx = error.lineNumber - 1; // 0-based
      const windowStart = Math.max(0, errorIdx - CODE_WINDOW_BEFORE);
      const windowEnd = Math.min(lines.length, errorIdx + CODE_WINDOW_AFTER + 1);
      const windowLines = lines.slice(windowStart, windowEnd);

      this.logger.log(
        `[ENRICH] ${error.filePath} → ${cached.resolvedPath} ` +
          `(lines ${String(windowStart + 1)}-${String(windowEnd)} of ${String(lines.length)}, ` +
          `error at line ${String(error.lineNumber)})`,
      );

      error.codeSnippet = windowLines.join('\n');
      error.filePath = cached.resolvedPath; // Use resolved monorepo path
    }
  }

  /**
   * Resolve the file path for a completed fix by matching it back to the
   * original build error in the same position.
   */
  private resolveFilePath(
    result: FixResult,
    buildErrors: FixRequestPayload[],
    allResults: FixResult[],
  ): string | null {
    const idx = allResults.indexOf(result);
    if (idx >= 0 && idx < buildErrors.length) {
      const error = buildErrors[idx];
      if (error?.filePath) return error.filePath;
    }
    return null;
  }

  /**
   * CI logs report file paths relative to the build working directory (e.g. src/ai/rag/rag.service.ts)
   * but the GitHub Contents API needs the full repo-relative path (e.g. apps/backend/src/ai/rag/rag.service.ts).
   * Try the path as-is first, then try common monorepo prefixes.
   */
  private static readonly MONOREPO_PREFIXES = [
    '',                // try as-is first
    'apps/backend/',   // NestJS backend in monorepo
  ];

  private async resolveRepoFile(
    installationId: string,
    owner: string,
    repo: string,
    ref: string,
    filePath: string,
  ): Promise<{ resolvedPath: string; originalContent: string | null }> {
    for (const prefix of FixRequestProcessor.MONOREPO_PREFIXES) {
      const candidate = prefix + filePath;
      const content = await this.githubService.getFileContent(
        installationId, owner, repo, candidate, ref,
      );
      if (content != null) {
        this.logger.log(
          `[FILE_PATCH] resolveRepoFile — ${filePath} → ${candidate} ` +
            `(found, ${String(content.length)} bytes, ${String(content.split('\n').length)} lines)`,
        );
        return { resolvedPath: candidate, originalContent: content };
      }
      this.logger.log(
        `[FILE_PATCH] resolveRepoFile — tried ${candidate} → 404`,
      );
    }

    // None found — return original path as fallback
    this.logger.warn(
      `[FILE_PATCH] resolveRepoFile — could not resolve ${filePath} with any prefix, using as-is`,
    );
    return { resolvedPath: filePath, originalContent: null };
  }

  /**
   * Apply fixedCode by surgically replacing/inserting only the specific lines the LLM changed.
   *
   * fixedCode is a JSON array of line-level fixes:
   *   [{ action: "replace", lineNumber: 52, originalLine: "  const x = foo(bar);", fixedLine: "  const x = foo(Number(bar));" }]
   *   [{ action: "insert_after", lineNumber: 4, originalLine: "", fixedLine: "import { ConfigService } from '@nestjs/common';" }]
   *
   * - "replace": validates originalLine matches, then replaces. Skips if mismatch (safety).
   * - "insert_after": inserts a new line AFTER the specified lineNumber. lineNumber=0 inserts at top.
   * - Fixes are processed bottom-to-top so inserts don't shift line numbers of earlier fixes.
   *
   * Only the listed lines are touched. All other code stays exactly as-is.
   * This makes it physically impossible for the LLM to delete unrelated code.
   */
  private applyFixAtLine(
    filePath: string,
    originalContent: string | null,
    _errorLineNumber: number,
    fixedCode: string,
  ): string {
    if (!originalContent) {
      this.logger.warn(
        `[FILE_PATCH] No original content for ${filePath} — cannot apply line fixes`,
      );
      return originalContent ?? '';
    }

    // Parse the line-fix JSON from the LLM
    let lineFixes: Array<{ action?: string; lineNumber: number; originalLine?: string; fixedLine: string }> = [];
    try {
      lineFixes = JSON.parse(fixedCode) as typeof lineFixes;
    } catch {
      this.logger.warn(
        `[FILE_PATCH] fixedCode is not valid line-fix JSON for ${filePath} — keeping original`,
      );
      return originalContent;
    }

    if (!Array.isArray(lineFixes) || lineFixes.length === 0) {
      this.logger.warn(`[FILE_PATCH] No line fixes provided for ${filePath} — keeping original`);
      return originalContent;
    }

    const lines = originalContent.split('\n');

    this.logger.log(
      `[FILE_PATCH] applyFixAtLine — file=${filePath} ` +
        `originalLines=${String(lines.length)} fixes=${String(lineFixes.length)}`,
    );

    // Sort fixes by lineNumber DESCENDING so inserts don't shift line numbers
    // of fixes that come earlier in the file.
    const sortedFixes = [...lineFixes].sort((a, b) => b.lineNumber - a.lineNumber);

    let appliedCount = 0;

    for (const fix of sortedFixes) {
      const action = fix.action ?? 'replace';

      if (action === 'insert_after') {
        // Insert a new line AFTER the specified lineNumber (0 = insert at top)
        const insertIdx = fix.lineNumber; // 0-based position to splice AFTER
        if (insertIdx < 0 || insertIdx > lines.length) {
          this.logger.warn(
            `[FILE_PATCH] insert_after line ${String(fix.lineNumber)} out of range — skipping`,
          );
          continue;
        }

        this.logger.log(
          `[FILE_PATCH] INSERT after line ${String(fix.lineNumber)}: "${fix.fixedLine.trim()}"`,
        );
        lines.splice(insertIdx, 0, fix.fixedLine);
        appliedCount++;
      } else {
        // Replace: validate originalLine matches before overwriting
        const idx = fix.lineNumber - 1; // 0-based
        if (idx < 0 || idx >= lines.length) {
          this.logger.warn(
            `[FILE_PATCH] Line ${String(fix.lineNumber)} out of range (file has ${String(lines.length)} lines) — skipping`,
          );
          continue;
        }

        // Validate originalLine if provided (trim whitespace for comparison)
        const currentLine = lines[idx]!;
        if (fix.originalLine && fix.originalLine.trim().length > 0) {
          if (currentLine.trim() !== fix.originalLine.trim()) {
            this.logger.warn(
              `[FILE_PATCH] Line ${String(fix.lineNumber)} MISMATCH — ` +
                `expected: "${fix.originalLine.trim()}" ` +
                `actual: "${currentLine.trim()}" — skipping this fix`,
            );
            continue;
          }
        }

        this.logger.log(
          `[FILE_PATCH] REPLACE line ${String(fix.lineNumber)}: "${currentLine.trim()}" → "${fix.fixedLine.trim()}"`,
        );
        lines[idx] = fix.fixedLine;
        appliedCount++;
      }
    }

    const result = lines.join('\n');

    this.logger.log(
      `[FILE_PATCH] APPLIED — ${filePath} — ${String(appliedCount)}/${String(lineFixes.length)} fix(es) applied`,
    );

    return result;
  }

  private async createFixPr(
    agentBranch: string,
    targetBranch: string,
    pipelineRunId: string,
    installationId: string,
    owner: string,
    repo: string,
  ): Promise<void> {
    try {
      const existingPr = await this.pullRequestsRepository.findOpenPrBySourceBranch(agentBranch);
      if (existingPr) {
        this.logger.log(`[BATCH_FIX_REQUEST] PR already exists for ${agentBranch} — skipping`);
        return;
      }

      const result = await this.githubService.createPR(installationId, owner, repo, {
        title: `fix(healops): Auto-fix pipeline errors`,
        body: [
          '## HealOps Automated Fix',
          '',
          `**Pipeline Run:** \`${pipelineRunId}\``,
          `**Source:** \`${agentBranch}\``,
          `**Target:** \`${targetBranch}\``,
        ].join('\n'),
        head: agentBranch,
        base: targetBranch,
      });

      this.logger.log(`[BATCH_FIX_REQUEST] Created draft PR #${String(result.number)}: ${agentBranch} → ${targetBranch}`);
    } catch (error) {
      this.logger.error(`[BATCH_FIX_REQUEST] Failed to create PR: ${(error as Error).message}`);
    }
  }

  private emptyResult(): FixResult {
    return {
      fixRequestId: '',
      jobId: null,
      status: 'failed',
      classifiedErrorType: '',
      isInScope: false,
      scopeReason: 'Unknown job name',
      totalAttempts: 0,
      fixSummary: '',
      fixedCode: '',
      fixConfidence: 0,
      totalTokensUsed: 0,
    };
  }
}
