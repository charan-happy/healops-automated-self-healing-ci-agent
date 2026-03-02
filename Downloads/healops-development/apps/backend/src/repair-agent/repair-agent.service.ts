// ─── Repair Agent Service ───────────────────────────────────────────────────
// Unified LangGraph-powered repair pipeline — the brain of HealOps.
//
// Pipeline stages:
// 1. gatherContext — load failure data, parse logs, classify error, fetch file contents
// 2. searchSimilar — RAG: find similar past fixes via pgvector
// 3. generateFix — call LLM with structured 5-layer prompt
// 4. qualityGate — deterministic 15-rule validation
// 5. preCheck — language-specific compile check (tsc/python/go)
// 6. pushBranch — create healops/fix/{jobId} branch, push via GitHub API
// 7. createPR or escalate
//
// Retry: If quality gate or LLM evaluation rejects, loops back to step 2 (max 3 attempts).
// Token budget: Checked before each LLM call to prevent runaway costs.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FailuresRepository } from '@db/repositories/healops/failures.repository';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { HealopsAuditLogRepository } from '@db/repositories/healops/audit-log.repository';
import { AiService } from '@ai/ai.service';
import { GithubService } from '../github/github.service';
import { PullRequestService } from '../github/services/pull-request.service';
import { EscalationService } from '../github/services/escalation.service';
import { VectorMemoryService } from '../vector-memory/vector-memory.service';
import { ValidatorService } from '../validator/validator.service';
import { LogParserService } from './services/log-parser.service';
import { ClassifierService } from './services/classifier.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { QualityGateService } from './services/quality-gate.service';
import { hashDiff } from '@common/utils/hash';
import type { AgentState, ClaudeFixOutput, PreviousAttempt } from './interfaces/agent-state.interface';
import type { HealOpsConfig } from '@config/healops.config';

@Injectable()
export class RepairAgentService {
  private readonly logger = new Logger(RepairAgentService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly failuresRepository: FailuresRepository,
    private readonly jobsRepository: HealopsJobsRepository,
    private readonly platformRepository: PlatformRepository,
    private readonly auditLogRepository: HealopsAuditLogRepository,
    private readonly aiService: AiService,
    private readonly githubService: GithubService,
    private readonly pullRequestService: PullRequestService,
    private readonly escalationService: EscalationService,
    private readonly vectorMemoryService: VectorMemoryService,
    private readonly validatorService: ValidatorService,
    private readonly logParserService: LogParserService,
    private readonly classifierService: ClassifierService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly qualityGateService: QualityGateService,
  ) {}

  /**
   * Execute the full repair pipeline for a given job.
   * Returns the final AgentState, or null if the failure cannot be found.
   */
  async runRepair(jobId: string, failureId: string): Promise<AgentState | null> {
    this.logger.log(`Starting repair pipeline for job=${jobId} failure=${failureId}`);
    const startTime = Date.now();
    const healopsConfig = this.configService.get<HealOpsConfig>('healops');
    const maxRetries = healopsConfig?.agent?.maxRetries ?? 3;
    const minConfidence = healopsConfig?.agent?.minConfidence ?? 0.55;

    // ──────────────────────────────────────────────────────────────────────
    // 1. GATHER CONTEXT
    // ──────────────────────────────────────────────────────────────────────
    const failure = await this.failuresRepository.findFailureById(failureId);
    if (!failure) {
      this.logger.error(`Failure ${failureId} not found`);
      return null;
    }

    await this.auditLog(jobId, 'agent.started', { failureId, errorHash: failure.errorHash });

    // Load repository context
    const job = await this.jobsRepository.findJobById(jobId);
    if (!job) {
      this.logger.error(`Job ${jobId} not found`);
      return null;
    }

    // Get pipeline run → commit → branch → repository chain
    const pipelineRunId = failure.pipelineRunId;
    const repoContext = await this.resolveRepoContext(pipelineRunId);

    // Parse the raw error log
    const rawLog = failure.rawErrorLog ?? failure.errorSummary;
    const truncatedLog = this.logParserService.truncateRawLog(rawLog);
    const parsed = this.logParserService.parseLog(truncatedLog, failure.language);
    const errorSnippet = parsed.errorSnippet || failure.errorSummary;
    const affectedFile = parsed.affectedFile || failure.affectedFile || 'unknown';
    const language = parsed.language || failure.language;

    // Classify the error type
    const classification = await this.classifierService.classify(errorSnippet, language);

    this.logger.log(
      `Classified failure ${failureId}: type=${classification.errorTypeCode} autoFixable=${String(classification.isAutoFixable)} confidence=${String(classification.confidence)}`,
    );

    // If not auto-fixable → escalate immediately
    if (!classification.isAutoFixable) {
      this.logger.log(`Error type ${classification.errorTypeCode} is not auto-fixable — escalating`);
      await this.doEscalate(jobId, failureId, repoContext, {
        errorTypeCode: classification.errorTypeCode,
        branchName: repoContext?.branchName ?? 'unknown',
        reason: `Error type ${classification.errorTypeCode} is marked as escalation-only`,
        escalationType: 'unfixable_type',
      });
      return this.buildState(jobId, failureId, 'escalate', [], classification.errorTypeCode);
    }

    // Fetch file contents from GitHub for the affected file + related files
    const fileContents = await this.fetchFileContents(
      repoContext,
      affectedFile,
      language,
    );

    // ──────────────────────────────────────────────────────────────────────
    // 2-5. RETRY LOOP: search → generate → quality gate → pre-check
    // ──────────────────────────────────────────────────────────────────────
    const previousAttempts: PreviousAttempt[] = [];
    const previousFixFingerprints: string[] = [];
    const previousFilesModified: string[][] = [];
    const usedSimilarFixIds: string[] = [];
    let totalTokensUsed = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.log(`[Job ${jobId}] Attempt ${String(attempt)}/${String(maxRetries)}`);

      // Token budget check
      const budgetCheck = await this.jobsRepository.isTokenBudgetExceeded(jobId);
      if (budgetCheck.exceeded) {
        this.logger.warn(`Token budget exceeded for job ${jobId}: ${String(budgetCheck.used)}/${String(budgetCheck.budget)}`);
        await this.doEscalate(jobId, failureId, repoContext, {
          errorTypeCode: classification.errorTypeCode,
          branchName: repoContext?.branchName ?? 'unknown',
          reason: `Token budget exhausted (${String(budgetCheck.used)}/${String(budgetCheck.budget)} tokens)`,
          escalationType: 'budget_exceeded',
        });
        return this.buildState(jobId, failureId, 'escalate', previousAttempts, classification.errorTypeCode);
      }

      // ── 2. RAG: Search for similar past fixes ────────────────────────
      let ragExamples: string[] = [];
      try {
        const embedding = await this.generateEmbedding(
          `${classification.errorTypeCode}: ${errorSnippet}`,
        );
        if (embedding) {
          const ragResult = await this.vectorMemoryService.findSimilarFixes(
            embedding,
            3,
            { excludeIds: usedSimilarFixIds },
          );

          ragExamples = ragResult.fixes.map((f) => f.fixDiff);
          for (const fix of ragResult.fixes) {
            if (fix.id && !usedSimilarFixIds.includes(fix.id)) {
              usedSimilarFixIds.push(fix.id);
            }
          }
        }
      } catch (ragError) {
        this.logger.warn(`RAG search failed (non-fatal): ${(ragError as Error).message}`);
      }

      // ── 3. Generate fix via LLM ──────────────────────────────────────
      const prompt = this.promptBuilderService.buildPrompt({
        language,
        errorTypeCode: classification.errorTypeCode,
        affectedFile,
        fileContents,
        errorSnippet,
        ragExamples,
        previousAttempts,
      });

      let claudeOutput: ClaudeFixOutput;
      try {
        const llmResponse = await this.aiService.chatCompletionWithFallback({
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        });

        const tokensThisCall = llmResponse.usage.totalTokens;
        totalTokensUsed += tokensThisCall;
        await this.jobsRepository.updateJobTokens(jobId, tokensThisCall);

        claudeOutput = this.parseLlmOutput(llmResponse.data.content);
      } catch (llmError) {
        this.logger.error(`LLM call failed for job ${jobId}: ${(llmError as Error).message}`);
        previousAttempts.push({
          attemptNumber: attempt,
          diagnosis: 'LLM call failed',
          fixStrategy: '',
          confidence: 0,
          diffContent: '',
          validationError: (llmError as Error).message,
          stage: 'pre_check',
        });
        continue;
      }

      // If LLM says it can't fix → escalate
      if (!claudeOutput.can_fix) {
        this.logger.log(`LLM cannot fix: ${claudeOutput.cannot_fix_reason}`);
        await this.doEscalate(jobId, failureId, repoContext, {
          errorTypeCode: classification.errorTypeCode,
          branchName: repoContext?.branchName ?? 'unknown',
          reason: claudeOutput.cannot_fix_reason || 'LLM determined the error cannot be auto-fixed',
          escalationType: 'low_confidence',
        });
        return this.buildState(jobId, failureId, 'escalate', previousAttempts, classification.errorTypeCode);
      }

      // ── 4. Quality Gate ──────────────────────────────────────────────
      const qgResult = this.qualityGateService.validate(claudeOutput, {
        errorTypeCode: classification.errorTypeCode,
        previousFixFingerprints,
        previousFilesModified,
      });

      const fixFingerprint = hashDiff(claudeOutput.diff);

      if (!qgResult.passed) {
        this.logger.warn(
          `Quality gate failed for job ${jobId} attempt ${String(attempt)}: ${qgResult.violations.join('; ')}`,
        );

        // Check for circular fix
        if (qgResult.violations.some((v) => v.includes('Circular fix'))) {
          await this.doEscalate(jobId, failureId, repoContext, {
            errorTypeCode: classification.errorTypeCode,
            branchName: repoContext?.branchName ?? 'unknown',
            reason: `Circular fix detected — same diff produced in attempt ${String(attempt)}`,
            escalationType: 'circular_fix',
          });
          return this.buildState(jobId, failureId, 'escalate', previousAttempts, classification.errorTypeCode);
        }

        previousAttempts.push({
          attemptNumber: attempt,
          diagnosis: claudeOutput.diagnosis,
          fixStrategy: claudeOutput.fix_strategy,
          confidence: claudeOutput.confidence,
          diffContent: claudeOutput.diff,
          validationError: `Quality gate: ${qgResult.violations.join('; ')}`,
          stage: 'pre_check',
        });
        previousFixFingerprints.push(fixFingerprint);
        previousFilesModified.push(claudeOutput.files_modified);

        // Persist attempt
        await this.persistAttempt(jobId, attempt, claudeOutput, `QG: ${qgResult.violations.join('; ')}`, totalTokensUsed);
        continue;
      }

      // ── 5. Pre-check (compile) ──────────────────────────────────────
      // Build patched files from the diff + original file contents
      const patchedFiles = this.applyDiffToFiles(claudeOutput.diff, fileContents);
      const attemptRecord = await this.persistAttempt(jobId, attempt, claudeOutput, '', totalTokensUsed);

      if (Object.keys(patchedFiles).length > 0) {
        const preCheck = await this.validatorService.runPreCheck({
          attemptId: attemptRecord.id,
          language,
          patchedFiles,
        });

        if (!preCheck.passed) {
          this.logger.warn(`Pre-check failed for job ${jobId} attempt ${String(attempt)}`);
          previousAttempts.push({
            attemptNumber: attempt,
            diagnosis: claudeOutput.diagnosis,
            fixStrategy: claudeOutput.fix_strategy,
            confidence: claudeOutput.confidence,
            diffContent: claudeOutput.diff,
            validationError: preCheck.errorMessage,
            stage: 'pre_check',
          });
          previousFixFingerprints.push(fixFingerprint);
          previousFilesModified.push(claudeOutput.files_modified);
          continue;
        }
      }

      // Confidence check
      if (claudeOutput.confidence < minConfidence) {
        this.logger.warn(
          `Low confidence ${String(claudeOutput.confidence)} < ${String(minConfidence)} for job ${jobId}`,
        );
        previousAttempts.push({
          attemptNumber: attempt,
          diagnosis: claudeOutput.diagnosis,
          fixStrategy: claudeOutput.fix_strategy,
          confidence: claudeOutput.confidence,
          diffContent: claudeOutput.diff,
          validationError: `Confidence ${String(claudeOutput.confidence)} below threshold ${String(minConfidence)}`,
          stage: 'pre_check',
        });
        previousFixFingerprints.push(fixFingerprint);
        previousFilesModified.push(claudeOutput.files_modified);
        continue;
      }

      // ──────────────────────────────────────────────────────────────────
      // 6. PUSH BRANCH + 7. CREATE PR
      // ──────────────────────────────────────────────────────────────────
      if (repoContext) {
        const branchName = `healops/fix/${jobId}`;

        try {
          // Get default branch SHA
          const defaultBranch = await this.githubService.getDefaultBranch(
            repoContext.installationId,
            repoContext.owner,
            repoContext.repo,
          );

          // Create fix branch
          const latestRef = await this.getLatestSha(repoContext, defaultBranch);
          await this.githubService.createBranch(
            repoContext.installationId,
            repoContext.owner,
            repoContext.repo,
            branchName,
            latestRef,
          );

          // Push patched files
          const filesToPush = Object.entries(patchedFiles).map(([path, content]) => ({
            path,
            content,
          }));

          if (filesToPush.length > 0) {
            await this.githubService.pushFiles(
              repoContext.installationId,
              repoContext.owner,
              repoContext.repo,
              branchName,
              filesToPush,
              `fix(healops): [${classification.errorTypeCode}] ${affectedFile}\n\nDiagnosis: ${claudeOutput.diagnosis}\nStrategy: ${claudeOutput.fix_strategy}\nConfidence: ${String(Math.round(claudeOutput.confidence * 100))}%`,
            );
          }

          // Create draft PR
          const prResult = await this.pullRequestService.createDraftPr({
            installationId: repoContext.installationId,
            owner: repoContext.owner,
            repo: repoContext.repo,
            jobId,
            sourceBranch: branchName,
            targetBranch: repoContext.branchName ?? defaultBranch,
            errorType: classification.errorTypeCode,
            affectedFile,
            attemptNumber: attempt,
            errorSnippet: errorSnippet.slice(0, 2000),
            diffContent: claudeOutput.diff,
            filesModified: claudeOutput.files_modified,
            validationStatus: 'pending',
            confidence: claudeOutput.confidence,
            diagnosis: claudeOutput.diagnosis,
            fixStrategy: claudeOutput.fix_strategy,
            modelUsed: healopsConfig?.openRouter?.model ?? 'unknown',
            inputTokens: totalTokensUsed,
            outputTokens: 0,
            failedCIRunUrl: repoContext.runUrl ?? '',
          });

          if (prResult) {
            this.logger.log(`Created PR #${String(prResult.prNumber)} for job ${jobId}`);
            await this.auditLog(jobId, 'agent.pr_created', {
              prNumber: prResult.prNumber,
              prUrl: prResult.prUrl,
              attempt,
            });
          }

          // Store successful fix in vector memory
          await this.storeFixInVectorMemory(
            errorSnippet,
            classification.errorTypeCode,
            language,
            claudeOutput.diff,
            claudeOutput.confidence,
            jobId,
            repoContext.repositoryId,
          );
        } catch (pushError) {
          this.logger.error(`Failed to push/PR for job ${jobId}: ${(pushError as Error).message}`);
          await this.auditLog(jobId, 'agent.push_failed', {
            error: (pushError as Error).message,
            attempt,
          });
        }
      }

      // Success!
      const durationMs = Date.now() - startTime;
      this.logger.log(
        `Job ${jobId} SUCCESS: ${String(attempt)} attempt(s), ${String(totalTokensUsed)} tokens, ${String(durationMs)}ms`,
      );
      await this.auditLog(jobId, 'agent.completed', {
        status: 'success',
        attempts: attempt,
        totalTokens: totalTokensUsed,
        durationMs,
      });

      return this.buildState(jobId, failureId, 'success', previousAttempts, classification.errorTypeCode, claudeOutput);
    }

    // All retries exhausted
    this.logger.warn(`Job ${jobId}: all ${String(maxRetries)} retries exhausted — escalating`);
    await this.doEscalate(jobId, failureId, repoContext, {
      errorTypeCode: classification.errorTypeCode,
      branchName: repoContext?.branchName ?? 'unknown',
      reason: `All ${String(maxRetries)} repair attempts exhausted`,
      escalationType: 'max_retries',
    });

    return this.buildState(jobId, failureId, 'escalate', previousAttempts, classification.errorTypeCode);
  }

  /**
   * Lightweight entry point for API-driven fix requests.
   * Runs the core pipeline (classify → RAG → generate → quality gate → pre-check)
   * without DB persistence or GitHub operations — the caller handles those.
   */
  async repairFromInput(input: RepairInput): Promise<RepairResult> {
    const healopsConfig = this.configService.get<HealOpsConfig>('healops');
    const maxRetries = healopsConfig?.agent?.maxRetries ?? 3;
    const minConfidence = healopsConfig?.agent?.minConfidence ?? 0.55;
    const language = input.language || 'typescript';
    const affectedFile = input.filePath ?? 'unknown';

    // ── 1. Classify the error ────────────────────────────────────────────
    const classification = await this.classifierService.classify(
      input.errorMessage,
      language,
    );

    if (!classification.isAutoFixable) {
      return {
        status: 'out_of_scope',
        classifiedErrorType: classification.errorTypeCode,
        isAutoFixable: false,
        classificationConfidence: classification.confidence,
        totalAttempts: 0,
        diagnosis: '',
        fixStrategy: '',
        fixedCode: '',
        fixConfidence: 0,
        filesModified: [],
        diff: '',
        totalTokensUsed: 0,
        attempts: [],
      };
    }

    // Build file contents from the provided code snippet
    const fileContents: Record<string, string> = {};
    if (input.filePath) {
      fileContents[input.filePath] = input.codeSnippet;
    }

    // ── 2-5. Retry loop ──────────────────────────────────────────────────
    const attempts: RepairAttemptResult[] = [];
    const previousAttempts: PreviousAttempt[] = [];
    const previousFixFingerprints: string[] = [];
    const previousFilesModified: string[][] = [];
    const usedSimilarFixIds: string[] = [];
    let totalTokensUsed = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.log(`[repairFromInput] Attempt ${String(attempt)}/${String(maxRetries)}`);

      // ── RAG: Search for similar past fixes ─────────────────────────
      let ragExamples: string[] = [];
      try {
        const embedding = await this.generateEmbedding(
          `${classification.errorTypeCode}: ${input.errorMessage}`,
        );
        if (embedding) {
          const ragResult = await this.vectorMemoryService.findSimilarFixes(
            embedding,
            3,
            { excludeIds: usedSimilarFixIds },
          );
          ragExamples = ragResult.fixes.map((f) => f.fixDiff);
          for (const fix of ragResult.fixes) {
            if (fix.id && !usedSimilarFixIds.includes(fix.id)) {
              usedSimilarFixIds.push(fix.id);
            }
          }
        }
      } catch (ragError) {
        this.logger.warn(`RAG search failed (non-fatal): ${(ragError as Error).message}`);
      }

      // ── Generate fix via LLM ───────────────────────────────────────
      const prompt = this.promptBuilderService.buildPrompt({
        language,
        errorTypeCode: classification.errorTypeCode,
        affectedFile,
        fileContents,
        errorSnippet: input.errorMessage,
        ragExamples,
        previousAttempts,
      });

      let claudeOutput: ClaudeFixOutput;
      try {
        const llmResponse = await this.aiService.chatCompletionWithFallback({
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        });

        const tokensThisCall = llmResponse.usage.totalTokens;
        totalTokensUsed += tokensThisCall;
        claudeOutput = this.parseLlmOutput(llmResponse.data.content);
      } catch (llmError) {
        this.logger.error(`LLM call failed: ${(llmError as Error).message}`);
        attempts.push({
          attemptNumber: attempt,
          diagnosis: 'LLM call failed',
          fixStrategy: '',
          confidence: 0,
          diff: '',
          fixedCode: '',
          filesModified: [],
          validationError: (llmError as Error).message,
          accepted: false,
        });
        previousAttempts.push({
          attemptNumber: attempt,
          diagnosis: 'LLM call failed',
          fixStrategy: '',
          confidence: 0,
          diffContent: '',
          validationError: (llmError as Error).message,
          stage: 'pre_check',
        });
        continue;
      }

      if (!claudeOutput.can_fix) {
        attempts.push({
          attemptNumber: attempt,
          diagnosis: claudeOutput.diagnosis,
          fixStrategy: claudeOutput.fix_strategy,
          confidence: claudeOutput.confidence,
          diff: '',
          fixedCode: '',
          filesModified: [],
          validationError: claudeOutput.cannot_fix_reason,
          accepted: false,
        });
        return {
          status: 'failed',
          classifiedErrorType: classification.errorTypeCode,
          isAutoFixable: true,
          classificationConfidence: classification.confidence,
          totalAttempts: attempt,
          diagnosis: claudeOutput.diagnosis,
          fixStrategy: claudeOutput.fix_strategy,
          fixedCode: '',
          fixConfidence: claudeOutput.confidence,
          filesModified: [],
          diff: '',
          totalTokensUsed,
          attempts,
        };
      }

      // ── Quality Gate ───────────────────────────────────────────────
      const qgResult = this.qualityGateService.validate(claudeOutput, {
        errorTypeCode: classification.errorTypeCode,
        previousFixFingerprints,
        previousFilesModified,
      });

      const fixFingerprint = hashDiff(claudeOutput.diff);

      if (!qgResult.passed) {
        const validationError = `Quality gate: ${qgResult.violations.join('; ')}`;
        attempts.push({
          attemptNumber: attempt,
          diagnosis: claudeOutput.diagnosis,
          fixStrategy: claudeOutput.fix_strategy,
          confidence: claudeOutput.confidence,
          diff: claudeOutput.diff,
          fixedCode: '',
          filesModified: claudeOutput.files_modified,
          validationError,
          accepted: false,
        });
        previousAttempts.push({
          attemptNumber: attempt,
          diagnosis: claudeOutput.diagnosis,
          fixStrategy: claudeOutput.fix_strategy,
          confidence: claudeOutput.confidence,
          diffContent: claudeOutput.diff,
          validationError,
          stage: 'pre_check',
        });
        previousFixFingerprints.push(fixFingerprint);
        previousFilesModified.push(claudeOutput.files_modified);
        continue;
      }

      // ── Pre-check (compile) — only when file contents are available ─
      const patchedFiles = this.applyDiffToFiles(claudeOutput.diff, fileContents);
      if (Object.keys(patchedFiles).length > 0) {
        // Run syntax check without persisting to DB (no attemptId)
        const preCheck = this.runLocalPreCheck(language, patchedFiles);
        if (!preCheck.passed) {
          const validationError = preCheck.errorMessage;
          attempts.push({
            attemptNumber: attempt,
            diagnosis: claudeOutput.diagnosis,
            fixStrategy: claudeOutput.fix_strategy,
            confidence: claudeOutput.confidence,
            diff: claudeOutput.diff,
            fixedCode: '',
            filesModified: claudeOutput.files_modified,
            validationError,
            accepted: false,
          });
          previousAttempts.push({
            attemptNumber: attempt,
            diagnosis: claudeOutput.diagnosis,
            fixStrategy: claudeOutput.fix_strategy,
            confidence: claudeOutput.confidence,
            diffContent: claudeOutput.diff,
            validationError,
            stage: 'pre_check',
          });
          previousFixFingerprints.push(fixFingerprint);
          previousFilesModified.push(claudeOutput.files_modified);
          continue;
        }
      }

      // Confidence check
      if (claudeOutput.confidence < minConfidence) {
        const validationError = `Confidence ${String(claudeOutput.confidence)} below threshold ${String(minConfidence)}`;
        attempts.push({
          attemptNumber: attempt,
          diagnosis: claudeOutput.diagnosis,
          fixStrategy: claudeOutput.fix_strategy,
          confidence: claudeOutput.confidence,
          diff: claudeOutput.diff,
          fixedCode: claudeOutput.diff,
          filesModified: claudeOutput.files_modified,
          validationError,
          accepted: false,
        });
        previousAttempts.push({
          attemptNumber: attempt,
          diagnosis: claudeOutput.diagnosis,
          fixStrategy: claudeOutput.fix_strategy,
          confidence: claudeOutput.confidence,
          diffContent: claudeOutput.diff,
          validationError,
          stage: 'pre_check',
        });
        previousFixFingerprints.push(fixFingerprint);
        previousFilesModified.push(claudeOutput.files_modified);
        continue;
      }

      // ── Success! ───────────────────────────────────────────────────
      attempts.push({
        attemptNumber: attempt,
        diagnosis: claudeOutput.diagnosis,
        fixStrategy: claudeOutput.fix_strategy,
        confidence: claudeOutput.confidence,
        diff: claudeOutput.diff,
        fixedCode: claudeOutput.diff,
        filesModified: claudeOutput.files_modified,
        validationError: '',
        accepted: true,
      });

      return {
        status: 'completed',
        classifiedErrorType: classification.errorTypeCode,
        isAutoFixable: true,
        classificationConfidence: classification.confidence,
        totalAttempts: attempt,
        diagnosis: claudeOutput.diagnosis,
        fixStrategy: claudeOutput.fix_strategy,
        fixedCode: claudeOutput.diff,
        fixConfidence: claudeOutput.confidence,
        filesModified: claudeOutput.files_modified,
        diff: claudeOutput.diff,
        totalTokensUsed,
        attempts,
      };
    }

    // All retries exhausted
    return {
      status: 'failed',
      classifiedErrorType: classification.errorTypeCode,
      isAutoFixable: true,
      classificationConfidence: classification.confidence,
      totalAttempts: maxRetries,
      diagnosis: '',
      fixStrategy: '',
      fixedCode: '',
      fixConfidence: 0,
      filesModified: [],
      diff: '',
      totalTokensUsed,
      attempts,
    };
  }

  // ─── Private: Local Pre-Check (no DB persistence) ────────────────────────

  /**
   * Run a local syntax/compile check without persisting validation records.
   * Used by repairFromInput() which handles its own persistence.
   */
  private runLocalPreCheck(
    language: string,
    patchedFiles: Record<string, string>,
  ): { passed: boolean; errorMessage: string } {
    // Delegate to ValidatorService's internal logic without DB persistence.
    // We import execSync/fs utils directly for a lightweight check.
    const { execSync } = require('child_process') as typeof import('child_process');
    const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = require('fs') as typeof import('fs');
    const { join } = require('path') as typeof import('path');
    const { tmpdir } = require('os') as typeof import('os');

    const lang = language.toLowerCase();
    if (!['typescript', 'ts', 'python', 'py', 'go', 'golang'].includes(lang)) {
      return { passed: true, errorMessage: '' };
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'healops-precheck-'));
    try {
      for (const [filePath, content] of Object.entries(patchedFiles)) {
        const fullPath = join(tempDir, filePath);
        const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
      }

      if (lang === 'typescript' || lang === 'ts') {
        writeFileSync(
          join(tempDir, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              strict: true, noEmit: true, skipLibCheck: true,
              moduleResolution: 'node', target: 'ES2022', module: 'commonjs',
              esModuleInterop: true,
            },
            include: ['**/*.ts', '**/*.tsx'],
          }),
          'utf-8',
        );
        execSync('npx tsc --noEmit --pretty', {
          cwd: tempDir, timeout: 30_000, stdio: 'pipe',
        });
      } else if (lang === 'python' || lang === 'py') {
        for (const filePath of Object.keys(patchedFiles)) {
          execSync(`python3 -m py_compile "${join(tempDir, filePath)}"`, {
            cwd: tempDir, timeout: 30_000, stdio: 'pipe',
          });
        }
      } else {
        execSync('go build ./...', { cwd: tempDir, timeout: 30_000, stdio: 'pipe' });
      }

      return { passed: true, errorMessage: '' };
    } catch (error) {
      const stderr = (error as { stderr?: Buffer })?.stderr?.toString() ?? '';
      const stdout = (error as { stdout?: Buffer })?.stdout?.toString() ?? '';
      return { passed: false, errorMessage: (stderr || stdout).slice(0, 4000) };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ─── Private: LLM Output Parsing ──────────────────────────────────────────

  private parseLlmOutput(content: string): ClaudeFixOutput {
    try {
      // Strip markdown fences if present
      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();

      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        diagnosis: String(parsed['diagnosis'] ?? ''),
        fix_strategy: String(parsed['fix_strategy'] ?? ''),
        confidence: Number(parsed['confidence'] ?? 0),
        can_fix: Boolean(parsed['can_fix'] ?? false),
        cannot_fix_reason: String(parsed['cannot_fix_reason'] ?? ''),
        diff: String(parsed['diff'] ?? ''),
        files_modified: Array.isArray(parsed['files_modified'])
          ? (parsed['files_modified'] as string[])
          : [],
      };
    } catch {
      this.logger.warn(`Failed to parse LLM output: ${content.slice(0, 200)}`);
      return {
        diagnosis: '',
        fix_strategy: '',
        confidence: 0,
        can_fix: false,
        cannot_fix_reason: 'Failed to parse LLM response as JSON',
        diff: '',
        files_modified: [],
      };
    }
  }

  // ─── Private: Context Resolution ──────────────────────────────────────────

  private async resolveRepoContext(pipelineRunId: string): Promise<RepoContext | null> {
    try {
      // Walk: pipeline_run → commit → branch → repository
      const result = await this.platformRepository.findPipelineRunContext(pipelineRunId);
      if (!result) return null;
      return result;
    } catch (error) {
      this.logger.warn(`Failed to resolve repo context: ${(error as Error).message}`);
      return null;
    }
  }

  private async fetchFileContents(
    repoContext: RepoContext | null,
    affectedFile: string,
    _language: string,
  ): Promise<Record<string, string>> {
    if (!repoContext) return {};
    const fileContents: Record<string, string> = {};

    try {
      const content = await this.githubService.getFileContent(
        repoContext.installationId,
        repoContext.owner,
        repoContext.repo,
        affectedFile,
        repoContext.commitSha ?? 'HEAD',
      );
      if (content) {
        fileContents[affectedFile] = content;
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch ${affectedFile}: ${(error as Error).message}`);
    }

    return fileContents;
  }

  private async getLatestSha(repoContext: RepoContext, branch: string): Promise<string> {
    if (repoContext.commitSha) return repoContext.commitSha;
    // Fallback: get ref from GitHub API (not ideal but works)
    const octokit = await this.githubService.getAppProvider().getInstallationClient(repoContext.installationId);
    const { data } = await octokit.git.getRef({
      owner: repoContext.owner,
      repo: repoContext.repo,
      ref: `heads/${branch}`,
    });
    return data.object.sha;
  }

  // ─── Private: Embedding ───────────────────────────────────────────────────

  private async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      const result = await this.aiService.embed({ input: text });
      return result.data.embeddings[0] ?? null;
    } catch (error) {
      this.logger.warn(`Embedding generation failed: ${(error as Error).message}`);
      return null;
    }
  }

  // ─── Private: Diff Application ────────────────────────────────────────────

  /**
   * Extract file paths and new content from a unified diff.
   * If the LLM returned full file content instead of a diff,
   * use file_contents as base and replace with the provided content.
   */
  private applyDiffToFiles(
    diff: string,
    originalContents: Record<string, string>,
  ): Record<string, string> {
    const result: Record<string, string> = {};

    // Try to extract file paths from diff headers (--- a/path, +++ b/path)
    const fileHeaders = diff.matchAll(/\+\+\+ b\/(.*)/g);
    const filesInDiff = [...fileHeaders].map((m) => m[1] ?? '').filter(Boolean);

    if (filesInDiff.length > 0) {
      // If it's a proper unified diff with recognizable file headers,
      // return the original contents + the diff as-is for the files mentioned
      // The actual diff application will happen on the CI side
      // For now, if we have the original file, we'll push the modified version
      for (const filePath of filesInDiff) {
        const original = originalContents[filePath];
        if (original !== undefined) {
          // Attempt simple patch application
          const patched = this.tryApplyPatch(original, diff, filePath);
          if (patched) {
            result[filePath] = patched;
          } else {
            result[filePath] = original; // fallback: push original
          }
        }
      }
    } else if (Object.keys(originalContents).length === 1) {
      // Single file — LLM may have returned the full fixed content
      const [path] = Object.keys(originalContents);
      if (path) {
        result[path] = diff; // treat diff as full file content
      }
    }

    return result;
  }

  /**
   * Simple line-based patch application for unified diff format.
   * Falls back to null if the diff can't be cleanly applied.
   */
  private tryApplyPatch(
    original: string,
    diff: string,
    _filePath: string,
  ): string | null {
    try {
      const lines = original.split('\n');
      const diffLines = diff.split('\n');
      const result: string[] = [...lines];

      // Find hunks for this file
      let inHunk = false;
      let lineOffset = 0;

      for (const line of diffLines) {
        const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
        if (hunkMatch?.[1]) {
          inHunk = true;
          lineOffset = parseInt(hunkMatch[1], 10) - 1;
          continue;
        }

        if (!inHunk) continue;

        if (line.startsWith('-')) {
          // Remove line at current offset
          if (lineOffset < result.length) {
            result.splice(lineOffset, 1);
          }
        } else if (line.startsWith('+')) {
          // Insert new line at current offset
          result.splice(lineOffset, 0, line.slice(1));
          lineOffset++;
        } else if (line.startsWith(' ') || line === '') {
          lineOffset++;
        } else if (line.startsWith('diff ') || line.startsWith('---') || line.startsWith('+++')) {
          // Skip diff metadata
        } else {
          // Context line
          lineOffset++;
        }
      }

      return result.join('\n');
    } catch {
      return null;
    }
  }

  // ─── Private: Persistence ─────────────────────────────────────────────────

  private async persistAttempt(
    jobId: string,
    attemptNumber: number,
    output: ClaudeFixOutput,
    validationError: string,
    _totalTokens: number,
  ) {
    const attempt = await this.jobsRepository.createAttempt({
      jobId,
      attemptNumber,
      analysisOutput: {
        diagnosis: output.diagnosis,
        fix_strategy: output.fix_strategy,
        confidence: output.confidence,
        can_fix: output.can_fix,
        cannot_fix_reason: output.cannot_fix_reason,
        validation_error: validationError,
      },
      fixFingerprint: output.diff ? hashDiff(output.diff) : undefined,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });

    // Persist patch
    if (output.diff) {
      await this.jobsRepository.createPatch({
        attemptId: attempt.id,
        diffContent: output.diff,
        filesModified: output.files_modified.map((f) => ({
          path: f,
          additions: 0,
          deletions: 0,
        })),
        patchSize: output.diff.length,
      });
    }

    return attempt;
  }

  // ─── Private: Vector Memory ───────────────────────────────────────────────

  private async storeFixInVectorMemory(
    errorSnippet: string,
    errorTypeCode: string,
    language: string,
    diff: string,
    confidence: number,
    jobId: string,
    repositoryId: string,
  ): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(`${errorTypeCode}: ${errorSnippet}`);
      if (!embedding) return;

      await this.vectorMemoryService.storeFix({
        repositoryId,
        failureType: errorTypeCode,
        language,
        errorSnippet,
        fixDiff: diff,
        confidence,
        embedding,
        jobId,
      });

      this.logger.log(`Stored successful fix in vector memory for job ${jobId}`);
    } catch (error) {
      this.logger.warn(`Failed to store in vector memory (non-fatal): ${(error as Error).message}`);
    }
  }

  // ─── Private: Escalation ──────────────────────────────────────────────────

  private async doEscalate(
    jobId: string,
    _failureId: string,
    repoContext: RepoContext | null,
    opts: {
      errorTypeCode: string;
      branchName: string;
      reason: string;
      escalationType: string;
    },
  ): Promise<void> {
    const escalateInput: Parameters<typeof this.escalationService.escalate>[0] = {
      jobId,
      repositoryId: repoContext?.repositoryId ?? '',
      branchName: opts.branchName,
      failureType: opts.errorTypeCode,
      escalationType: opts.escalationType,
      reason: opts.reason,
    };
    if (repoContext?.installationId) escalateInput.installationId = repoContext.installationId;
    if (repoContext?.owner) escalateInput.owner = repoContext.owner;
    if (repoContext?.repo) escalateInput.repo = repoContext.repo;

    await this.escalationService.escalate(escalateInput);

    await this.auditLog(jobId, `agent.escalated`, {
      escalationType: opts.escalationType,
      reason: opts.reason,
    });
  }

  // ─── Private: State Builder ───────────────────────────────────────────────

  private buildState(
    jobId: string,
    failureId: string,
    finalStatus: 'success' | 'escalate' | 'retry',
    previousAttempts: PreviousAttempt[],
    errorTypeCode: string,
    claudeOutput?: ClaudeFixOutput,
  ): AgentState {
    return {
      jobId,
      failureId,
      repositoryId: '',
      attemptNumber: previousAttempts.length,
      errorSnippet: '',
      affectedFile: '',
      language: '',
      errorTypeCode,
      fileContents: {},
      ragExamples: [],
      previousAttempts,
      claudeOutput: claudeOutput ?? null,
      patchDiff: claudeOutput?.diff ?? null,
      preCheckResult: null,
      validationResult: null,
      finalStatus,
    };
  }

  // ─── Private: Audit ───────────────────────────────────────────────────────

  private async auditLog(
    jobId: string,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditLogRepository.createAuditLog({
        entityType: 'job',
        entityId: jobId,
        action,
        actorType: 'system',
        metadata,
      });
    } catch (error) {
      this.logger.warn(`Failed to create audit log: ${(error as Error).message}`);
    }
  }
}

// ─── Public Interfaces (API-driven entry point) ─────────────────────────────

export interface RepairInput {
  errorMessage: string;
  codeSnippet: string;
  lineNumber: number;
  language: string;
  filePath?: string;
}

export interface RepairAttemptResult {
  attemptNumber: number;
  diagnosis: string;
  fixStrategy: string;
  confidence: number;
  diff: string;
  fixedCode: string;
  filesModified: string[];
  validationError: string;
  accepted: boolean;
}

export interface RepairResult {
  status: 'completed' | 'failed' | 'out_of_scope';
  classifiedErrorType: string;
  isAutoFixable: boolean;
  classificationConfidence: number;
  totalAttempts: number;
  diagnosis: string;
  fixStrategy: string;
  fixedCode: string;
  fixConfidence: number;
  filesModified: string[];
  diff: string;
  totalTokensUsed: number;
  attempts: RepairAttemptResult[];
}

// ─── Supporting Interface ────────────────────────────────────────────────────

interface RepoContext {
  repositoryId: string;
  installationId: string;
  owner: string;
  repo: string;
  branchName?: string;
  commitSha?: string;
  runUrl?: string;
}
