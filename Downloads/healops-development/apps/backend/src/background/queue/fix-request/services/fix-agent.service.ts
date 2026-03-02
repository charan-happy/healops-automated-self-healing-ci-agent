// ─── Fix Agent Service ──────────────────────────────────────────────────────
// Facade that orchestrates the LangGraph fix agent with DB persistence.
// This is the main entry point called by the FixRequestProcessor.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '@ai/ai.service';
import { FixRequestsRepository } from '@db/repositories/healops/fix-requests.repository';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { VectorMemoryRepository } from '@db/repositories/healops/vector-memory.repository';
import { HealopsAuditLogRepository } from '@db/repositories/healops/audit-log.repository';
import { ErrorClassifierService } from './error-classifier.service';
import { SimilarFixService } from './similar-fix.service';
import { buildFixGraph } from '../agent/fix-graph';
import { generateErrorHash, generateContextHash } from '@common/utils/hash';
import type { FixGraphState, AgentLogEntry } from '../agent/state';

export interface FixAgentInput {
  errorMessage: string;
  codeSnippet: string;
  lineNumber: number;
  branch: string;
  commitSha: string;
  filePath?: string;
  language?: string;
}

export interface FixAgentOutput {
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
  logs: AgentLogEntry[];
}

@Injectable()
export class FixAgentService {
  private readonly logger = new Logger(FixAgentService.name);
  private readonly maxAttempts: number;
  private readonly minConfidence: number;
  private readonly similarityThreshold: number;
  private readonly highSimilarityThreshold: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly aiService: AiService,
    private readonly classifierService: ErrorClassifierService,
    private readonly similarFixService: SimilarFixService,
    private readonly fixRequestsRepo: FixRequestsRepository,
    private readonly jobsRepo: HealopsJobsRepository,
    private readonly vectorMemoryRepo: VectorMemoryRepository,
    private readonly auditLogRepo: HealopsAuditLogRepository,
  ) {
    this.maxAttempts = Number(
      this.configService.get<string>('AI_FIX_MAX_ATTEMPTS') ?? '1',
    );
    this.minConfidence = Number(
      this.configService.get<string>('AI_FIX_MIN_CONFIDENCE') ?? '0.6',
    );
    this.similarityThreshold = Number(
      this.configService.get<string>('AI_FIX_SIMILARITY_THRESHOLD') ?? '0.7',
    );
    this.highSimilarityThreshold = Number(
      this.configService.get<string>('AI_FIX_EXACT_MATCH_THRESHOLD') ?? '0.95',
    );
  }

  async execute(input: FixAgentInput): Promise<FixAgentOutput> {
    const startTime = Date.now();
    const errorHash = generateErrorHash(input.errorMessage);

    // ── 1. Create fix_request record ────────────────────────────────────
    const fixRequest = await this.fixRequestsRepo.create({
      errorMessage: input.errorMessage,
      codeSnippet: input.codeSnippet,
      lineNumber: input.lineNumber,
      branch: input.branch,
      commitSha: input.commitSha,
      errorHash,
      status: 'received',
      ...(input.filePath !== undefined && { filePath: input.filePath }),
      ...(input.language !== undefined && { language: input.language }),
    });

    this.logger.log(`Created fix_request ${fixRequest.id} (hash: ${errorHash.slice(0, 12)}...)`);

    await this.auditLog(fixRequest.id, 'created', { errorHash, branch: input.branch });

    // ── 1b. Check for existing successful fix with same error_hash ────
    const cachedResult = await this.checkForCachedFix(errorHash, fixRequest.id);
    if (cachedResult) {
      this.logger.log(
        `Reused cached fix for ${fixRequest.id} — 0 tokens (original: ${cachedResult.jobId ?? 'unknown'})`,
      );
      return cachedResult;
    }

    // ── 2. Update status to classifying ─────────────────────────────────
    await this.fixRequestsRepo.updateStatus(fixRequest.id, 'classifying');

    // ── 3. Run the LangGraph agent ──────────────────────────────────────
    const graph = buildFixGraph({
      aiService: this.aiService,
      classifierService: this.classifierService,
      similarFixService: this.similarFixService,
      maxAttempts: this.maxAttempts,
      minConfidence: this.minConfidence,
      similarityThreshold: this.similarityThreshold,
      highSimilarityThreshold: this.highSimilarityThreshold,
      onAuditLog: async (action, metadata) => {
        await this.auditLog(fixRequest.id, `agent.${action}`, metadata);
      },
    });

    const initialState: Partial<FixGraphState> = {
      errorMessage: input.errorMessage,
      codeSnippet: input.codeSnippet,
      lineNumber: input.lineNumber,
      filePath: input.filePath ?? '',
      language: input.language ?? 'typescript',
      branch: input.branch,
      commitSha: input.commitSha,
      fixRequestId: fixRequest.id,
      maxAttempts: this.maxAttempts,
    };

    let finalState: FixGraphState;
    try {
      finalState = await graph.invoke(initialState as FixGraphState);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`LangGraph execution failed: ${msg}`);
      await this.fixRequestsRepo.updateStatus(fixRequest.id, 'failed');
      await this.auditLog(fixRequest.id, 'graph_failed', { error: msg });

      return {
        fixRequestId: fixRequest.id,
        jobId: null,
        status: 'failed',
        classifiedErrorType: 'unknown',
        isInScope: false,
        scopeReason: `Agent execution error: ${msg}`,
        totalAttempts: 0,
        fixSummary: '',
        fixedCode: '',
        fixConfidence: 0,
        totalTokensUsed: 0,
        logs: [],
      };
    }

    // ── 4. Determine final status ───────────────────────────────────────
    let status: 'completed' | 'failed' | 'out_of_scope';
    if (!finalState.isInScope) {
      status = 'out_of_scope';
    } else if (finalState.isFixCorrect) {
      status = 'completed';
    } else {
      status = 'failed';
    }

    // ── 5. Update fix_request with classification results ───────────────
    await this.fixRequestsRepo.updateStatus(fixRequest.id, status, {
      classifiedErrorType: finalState.classifiedErrorType,
      isInScope: finalState.isInScope,
      scopeReason: finalState.scopeReason,
    });

    // ── 6. Create job record & persist attempts ─────────────────────────
    let jobId: string | null = null;

    if (finalState.isInScope) {
      const job = await this.jobsRepo.createJob({
        fixRequestId: fixRequest.id,
        status: status === 'completed' ? 'success' : 'failed',
        classifiedFailureType: finalState.classifiedErrorType,
        confidence: finalState.fixConfidence,
        maxRetries: this.maxAttempts,
        currentRetry: finalState.currentAttempt,
        totalTokensUsed: finalState.totalTokensUsed,
        startedAt: new Date(startTime),
        completedAt: new Date(),
      });
      jobId = job.id;

      // Link job to fix_request
      await this.fixRequestsRepo.updateStatus(fixRequest.id, status, {
        jobId: job.id,
      });

      // Persist each attempt
      for (const attempt of finalState.previousAttempts) {
        const attemptRecord = await this.jobsRepo.createAttempt({
          jobId: job.id,
          attemptNumber: attempt.attemptNumber,
          analysisOutput: {
            summary: attempt.fixSummary,
            confidence: attempt.fixConfidence,
            isCorrect: attempt.isCorrect,
            evaluationFeedback: attempt.evaluationFeedback,
            searchResults: attempt.searchResults,
            usedSimilarFixIds: attempt.usedSimilarFixIds,
            discardedSimilarFixIds: attempt.discardedSimilarFixIds,
            approach: attempt.approachDescription,
            reasoning: attempt.aiReasoning,
            rejectionReason: attempt.rejectionReason,
          },
          inputTokens: attempt.inputTokens,
          outputTokens: attempt.outputTokens,
          totalTokens: attempt.inputTokens + attempt.outputTokens,
        });

        // Persist patch for each attempt
        if (attempt.fixedCode) {
          await this.jobsRepo.createPatch({
            attemptId: attemptRecord.id,
            diffContent: attempt.fixedCode,
            filesModified: [
              {
                path: input.filePath ?? 'unknown',
                additions: attempt.fixedCode.split('\n').length,
                deletions: input.codeSnippet.split('\n').length,
              },
            ],
            patchSize: attempt.fixedCode.length,
          });
        }

        await this.auditLog(fixRequest.id, 'agent.attempt_persisted', {
          attemptNumber: attempt.attemptNumber,
          isCorrect: attempt.isCorrect,
          confidence: attempt.fixConfidence,
          approach: attempt.approachDescription,
          reasoning: attempt.aiReasoning,
          rejectionReason: attempt.rejectionReason,
          usedSimilarFixIds: attempt.usedSimilarFixIds,
          discardedSimilarFixIds: attempt.discardedSimilarFixIds,
          searchResultCount: attempt.searchResults.length,
        });
      }

      // ── 7. Store successful fix in vector memory ────────────────────
      if (status === 'completed' && finalState.fixedCode) {
        await this.storeInVectorMemory(
          input,
          finalState,
          jobId,
        );
        await this.auditLog(fixRequest.id, 'agent.vector_memory_stored', {
          jobId,
          classifiedErrorType: finalState.classifiedErrorType,
          fixConfidence: finalState.fixConfidence,
          totalAttempts: finalState.currentAttempt,
        });
      }

      this.logger.log(
        `Job ${job.id} ${status}: ${String(finalState.currentAttempt)} attempt(s), ` +
          `${String(finalState.totalTokensUsed)} tokens, ` +
          `${String(Date.now() - startTime)}ms`,
      );
    }

    // ── 8. Audit log ────────────────────────────────────────────────────
    await this.auditLog(fixRequest.id, 'completed', {
      status,
      jobId,
      attempts: finalState.currentAttempt,
      totalTokens: finalState.totalTokensUsed,
      durationMs: Date.now() - startTime,
    });

    return {
      fixRequestId: fixRequest.id,
      jobId,
      status,
      classifiedErrorType: finalState.classifiedErrorType ?? 'unknown',
      isInScope: finalState.isInScope ?? false,
      scopeReason: finalState.scopeReason ?? '',
      totalAttempts: finalState.currentAttempt ?? 0,
      fixSummary: finalState.fixSummary ?? '',
      fixedCode: finalState.fixedCode ?? '',
      fixConfidence: finalState.fixConfidence ?? 0,
      totalTokensUsed: finalState.totalTokensUsed ?? 0,
      logs: finalState.logs ?? [],
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  /**
   * Check if an identical error (same error_hash) was already successfully fixed.
   * If so, reuse the cached fix — 0 tokens, no LLM calls.
   *
   * GUARD: if the error keeps recurring (newer fix_requests exist AFTER the
   * completed one), the previous fix clearly didn't work — skip reuse.
   */
  private async checkForCachedFix(
    errorHash: string,
    fixRequestId: string,
  ): Promise<FixAgentOutput | null> {
    const existingRequests = await this.fixRequestsRepo.findByErrorHash(errorHash);
    const completedRequest = existingRequests.find(
      (fr) => fr.status === 'completed' && fr.jobId != null && fr.id !== fixRequestId,
    );

    if (!completedRequest?.jobId) {
      return null;
    }

    // If there are fix_requests for this error hash created AFTER the completed one,
    // the fix didn't actually resolve the issue — don't reuse it.
    const newerRequests = existingRequests.filter(
      (fr) =>
        fr.id !== fixRequestId &&
        fr.id !== completedRequest.id &&
        new Date(String(fr.createdAt)) > new Date(String(completedRequest.createdAt)),
    );
    if (newerRequests.length > 0) {
      this.logger.warn(
        `[DEDUP] Skipping cached fix for hash ${errorHash.slice(0, 12)}... — ` +
          `${String(newerRequests.length)} newer request(s) exist after the "completed" fix, ` +
          `indicating the fix didn't work`,
      );
      return null;
    }

    const existingJob = await this.jobsRepo.findJobById(completedRequest.jobId);
    if (!existingJob || existingJob.status !== 'success') {
      return null;
    }

    // Find the accepted attempt and its patch
    const existingAttempts = await this.jobsRepo.findAttemptsByJob(existingJob.id);
    const successfulAttempt = existingAttempts.find((a) => {
      const output = a.analysisOutput as Record<string, unknown> | null;
      return output != null && output['isCorrect'] === true;
    });

    if (!successfulAttempt) {
      return null;
    }

    const patch = await this.jobsRepo.findPatchByAttempt(successfulAttempt.id);
    if (!patch?.diffContent) {
      return null;
    }

    // Mark this fix_request as completed — reusing the existing job
    await this.fixRequestsRepo.updateStatus(fixRequestId, 'completed', {
      classifiedErrorType: completedRequest.classifiedErrorType ?? 'unknown',
      isInScope: true,
      scopeReason: `Reused fix from identical error (original: ${completedRequest.id})`,
      jobId: existingJob.id,
    });

    await this.auditLog(fixRequestId, 'duplicate_reused', {
      originalFixRequestId: completedRequest.id,
      originalJobId: existingJob.id,
      errorHash,
      tokensUsed: 0,
    });

    const analysisOutput = successfulAttempt.analysisOutput as Record<string, unknown> | null;
    const summary = typeof analysisOutput?.['summary'] === 'string'
      ? analysisOutput['summary']
      : 'Reused fix from identical error';

    return {
      fixRequestId,
      jobId: existingJob.id,
      status: 'completed',
      classifiedErrorType: completedRequest.classifiedErrorType ?? 'unknown',
      isInScope: true,
      scopeReason: `Reused fix from identical error (original: ${completedRequest.id})`,
      totalAttempts: 0,
      fixSummary: summary,
      fixedCode: patch.diffContent,
      fixConfidence: Number(analysisOutput?.['confidence'] ?? existingJob.confidence ?? 0),
      totalTokensUsed: 0,
      logs: [
        {
          timestamp: new Date().toISOString(),
          step: 'duplicate_reused',
          message: `Identical error (hash: ${errorHash.slice(0, 12)}...) already fixed — reused cached fix, 0 tokens`,
          metadata: {
            originalFixRequestId: completedRequest.id,
            originalJobId: existingJob.id,
          },
        },
      ],
    };
  }

  private async storeInVectorMemory(
    input: FixAgentInput,
    state: FixGraphState,
    jobId: string,
  ): Promise<void> {
    try {
      const language = input.language ?? 'typescript';
      const contextHash = generateContextHash(
        input.errorMessage,
        input.codeSnippet,
        language,
      );

      // Check if already stored
      const existing = await this.vectorMemoryRepo.findByContextHash(contextHash);
      if (existing) {
        this.logger.debug(`Vector memory entry already exists for context hash ${contextHash.slice(0, 12)}...`);
        return;
      }

      // Generate embedding
      const embeddingResponse = await this.aiService.embed({
        input: `${state.classifiedErrorType}: ${input.errorMessage}`,
      });

      const embedding = embeddingResponse.data.embeddings[0];
      if (!embedding) {
        this.logger.warn('No embedding returned, skipping vector memory storage');
        return;
      }

      await this.vectorMemoryRepo.createEntry({
        jobId,
        errorEmbedding: embedding,
        contextHash,
        failureType: state.classifiedErrorType,
        language,
        successfulPatch: state.fixedCode,
        confidence: state.fixConfidence,
      });

      this.logger.log(`Stored successful fix in vector memory (hash: ${contextHash.slice(0, 12)}...)`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to store in vector memory: ${msg}`);
    }
  }

  private async auditLog(
    fixRequestId: string,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.auditLogRepo.createAuditLog({
        entityType: 'fix_request',
        entityId: fixRequestId,
        action,
        actorType: 'system',
        metadata,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to create audit log: ${msg}`);
    }
  }
}
