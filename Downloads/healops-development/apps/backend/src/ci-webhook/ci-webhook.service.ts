// ─── CI Webhook Service ─────────────────────────────────────────────────────
// Provider-agnostic webhook processing service.
// Takes a normalised WebhookPayloadResult and runs the guard chain
// (duplicate check, healops branch check, cooldown check, budget check)
// then extracts errors from CI logs and dispatches to the AI fix pipeline.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookPayloadResult } from '../ci-provider/interfaces/ci-provider.interface';
import { CiProviderFactory } from '../ci-provider/ci-provider.factory';
import { CiConnectionConfig } from '../ci-provider/interfaces/ci-provider.interface';
import { WebhookEventsRepository } from '@db/repositories/healops/webhook-events.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { CostTrackingRepository } from '@db/repositories/healops/cost-tracking.repository';
import { CostTrackingService } from '@cost-tracking/cost-tracking.service';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { ScmProviderConfigsRepository } from '@db/repositories/healops/scm-provider-configs.repository';
import { WebhookIngestQueueService } from '@bg/queue/webhook-ingest/webhook-ingest-queue.service';
import { FixRequestQueue } from '@bg/queue/fix-request/fix-request.queue';
import { ErrorExtractorService } from './error-extractor.service';

export interface ProcessWebhookInput {
  /** Provider name: 'github' | 'gitlab' | 'jenkins' */
  provider: string;
  /** Unique delivery/event ID from the provider (for idempotency) */
  deliveryId: string;
  /** Normalised webhook payload */
  payload: WebhookPayloadResult;
  /** Raw JSON payload for storage/audit */
  rawPayload: Record<string, unknown>;
}

@Injectable()
export class CiWebhookService {
  private readonly logger = new Logger(CiWebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookEventsRepository: WebhookEventsRepository,
    private readonly platformRepository: PlatformRepository,
    private readonly costTrackingRepository: CostTrackingRepository,
    private readonly costTrackingService: CostTrackingService,
    private readonly jobsRepository: HealopsJobsRepository,
    private readonly webhookIngestQueueService: WebhookIngestQueueService,
    private readonly ciProviderFactory: CiProviderFactory,
    private readonly errorExtractorService: ErrorExtractorService,
    private readonly fixRequestQueue: FixRequestQueue,
    private readonly scmProviderConfigsRepository: ScmProviderConfigsRepository,
  ) {}

  /**
   * Process a normalised webhook payload through the guard chain.
   * This is the unified entry point for all CI providers.
   * Returns 200 immediately — async processing dispatched via BullMQ.
   */
  async processWebhook(input: ProcessWebhookInput): Promise<void> {
    const { provider, deliveryId, payload, rawPayload } = input;

    try {
      // 1. Resolve repository (find or create)
      const repository = await this.resolveRepository(provider, payload);
      if (!repository) {
        this.logger.warn(
          `Cannot resolve repository from ${provider} webhook — delivery ${deliveryId}`,
        );
        return;
      }

      // 2. Idempotent insert — ON CONFLICT (external_event_id) DO NOTHING
      const event = await this.webhookEventsRepository.createWebhookEvent({
        externalEventId: deliveryId,
        repositoryId: repository.id,
        provider,
        eventType: payload.eventType,
        payload: rawPayload,
        signatureValid: true,
      });

      if (!event) {
        this.logger.debug(`Duplicate webhook event ignored: ${deliveryId}`);
        return;
      }

      // 3. Enqueue for durable async processing via BullMQ
      await this.webhookIngestQueueService.enqueueWebhookIngest({
        webhookEventId: event.id,
        eventType: payload.eventType,
        payload: rawPayload,
        repository: {
          id: repository.id,
          organizationId: repository.organizationId,
          name: repository.name,
          defaultBranch: repository.defaultBranch,
          primaryLanguage: repository.primaryLanguage,
          githubInstallationId: repository.githubInstallationId,
          provider,
        },
        headBranch: payload.headBranch,
        headSha: payload.headSha,
        ...(payload.externalRunId ? { externalRunId: payload.externalRunId } : {}),
        ...(payload.workflowName ? { workflowName: payload.workflowName } : {}),
      });

      this.logger.log(
        `[${provider.toUpperCase()}] Webhook ${deliveryId} enqueued for ${payload.eventType} on ${payload.repository.fullName}`,
      );
    } catch (error) {
      this.logger.error(
        `Webhook processing failed for ${deliveryId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * Async guard chain — called from the BullMQ processor.
   * Runs all checks and decides whether to dispatch a repair job.
   */
  async processEventAsync(
    webhookEventId: string,
    eventType: string,
    repository: ResolvedRepository,
    context: {
      headBranch: string;
      headSha: string;
      externalRunId?: string;
      workflowName?: string;
    },
  ): Promise<void> {
    try {
      // Handle push events — supersede active jobs on same branch
      if (eventType === 'push') {
        await this.handlePushSupersede(
          repository.id,
          context.headBranch,
          webhookEventId,
        );
        return;
      }

      // Only process pipeline failures
      if (eventType !== 'pipeline_failed') {
        await this.webhookEventsRepository.markProcessed(
          webhookEventId,
          `Ignored — event type "${eventType}" is not pipeline_failed`,
        );
        return;
      }

      // ── Guard 1: Is this a HealOps branch? ─────────────────────────────
      const headBranch = context.headBranch;
      const branchRecord = await this.platformRepository.findBranchByRepoAndName(
        repository.id,
        headBranch,
      );
      if (branchRecord?.isHealopsBranch) {
        this.logger.warn(
          `Guard 1: HealOps branch detected (${headBranch}), skipping to prevent loop`,
        );
        await this.webhookEventsRepository.markProcessed(
          webhookEventId,
          'HealOps branch — loop prevention (DB flag)',
        );
        return;
      }
      if (
        headBranch.startsWith('healops/fix/') ||
        headBranch.startsWith('patchpilot/fix/') ||
        headBranch.startsWith('agent-fix/')
      ) {
        this.logger.warn(
          `Guard 1: HealOps branch detected by name (${headBranch}), skipping`,
        );
        await this.webhookEventsRepository.markProcessed(
          webhookEventId,
          'HealOps branch — loop prevention (name pattern)',
        );
        return;
      }
      this.logger.log('Guard 1: Not a HealOps branch — continuing');

      // ── Guard 2: Is this a HealOps commit? ─────────────────────────────
      const headSha = context.headSha;
      if (headSha) {
        const commitRecord = await this.platformRepository.findCommitByRepoAndSha(
          repository.id,
          headSha,
        );
        if (commitRecord?.source === 'healops') {
          this.logger.warn(
            `Guard 2: HealOps commit detected (${headSha}), skipping`,
          );
          await this.webhookEventsRepository.markProcessed(
            webhookEventId,
            'HealOps commit — loop prevention',
          );
          return;
        }
      }
      this.logger.log('Guard 2: Not a HealOps commit — continuing');

      // ── Guard 3: Is there an active cooldown? ──────────────────────────
      const isOnCooldown = await this.costTrackingRepository.isOnCooldown(
        repository.id,
        headBranch,
        'unknown',
      );
      if (isOnCooldown) {
        this.logger.warn(
          `Guard 3: Active cooldown for ${repository.id}/${headBranch}`,
        );
        await this.webhookEventsRepository.markProcessed(
          webhookEventId,
          `Cooldown active for branch ${headBranch}`,
        );
        return;
      }
      this.logger.log('Guard 3: No active cooldown — continuing');

      // ── Guard 4: Is the budget exhausted? ──────────────────────────────
      const hasBudget = await this.costTrackingService.hasBudget(
        repository.organizationId,
      );
      if (!hasBudget) {
        this.logger.warn(
          `Guard 4: Budget exhausted for org ${repository.organizationId}`,
        );
        await this.webhookEventsRepository.markProcessed(
          webhookEventId,
          'Budget exhausted — skipping repair',
        );
        return;
      }
      this.logger.log('Guard 4: Budget available — continuing');

      // ── All guards passed — extract errors and dispatch fix ─────────────
      this.logger.log(
        `All guards passed for ${webhookEventId}, extracting errors and dispatching fix`,
      );

      const provider = repository.provider ?? 'unknown';
      const externalRunId = context.externalRunId ?? '';

      // 1. Fetch logs from CI provider
      let rawLogs: string | null = null;
      try {
        const ciProvider = this.ciProviderFactory.getProvider(provider);
        const ciConfig = this.ciProviderFactory.buildConnectionConfig({
          name: repository.name,
          provider,
        });
        rawLogs = await ciProvider.fetchLogs(ciConfig, externalRunId);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch logs from ${provider} for run ${externalRunId}: ${(error as Error).message}`,
        );
      }

      if (!rawLogs) {
        await this.webhookEventsRepository.markProcessed(
          webhookEventId,
          'Could not fetch CI logs — no errors to extract',
        );
        return;
      }

      // 2. Extract build errors from logs
      const language = repository.primaryLanguage ?? 'typescript';
      const buildErrors = this.errorExtractorService.extractBuildErrors(rawLogs, language);

      if (buildErrors.length === 0) {
        await this.webhookEventsRepository.markProcessed(
          webhookEventId,
          'No parseable build errors found in logs',
        );
        return;
      }

      this.logger.log(
        `Extracted ${String(buildErrors.length)} build error(s) from ${provider} logs`,
      );

      // 3. Resolve SCM provider for branch/push/PR operations
      const { scmProviderName, scmConfig } = await this.resolveScmProvider(repository);

      // 4. Resolve pipeline context (create branch/commit/pipeline_run records)
      const pipelineRunId = await this.resolvePipelineRunId(
        webhookEventId, repository, context,
      );

      // 5. Dispatch batch fix job
      const errors = buildErrors.map((e) => ({
        errorMessage: e.extractedErrorMessage || e.errorMessage,
        codeSnippet: e.codeSnippet,
        lineNumber: e.errorLine,
        branch: headBranch,
        commitSha: headSha,
        filePath: e.errorFile,
        language: e.language,
      }));

      try {
        const { jobId } = await this.fixRequestQueue.addBatchFixRequest({
          buildErrors: errors,
          branch: headBranch,
          commitSha: headSha,
          pipelineRunId,
          repositoryId: repository.id,
          organizationId: repository.organizationId,
          scmProvider: scmProviderName,
          scmConnectionConfig: {
            owner: scmConfig.owner,
            repo: scmConfig.repo,
            authToken: scmConfig.authToken,
            ...(scmConfig.serverUrl ? { serverUrl: scmConfig.serverUrl } : {}),
          },
          // backward compat
          ...(repository.githubInstallationId ? { githubInstallationId: repository.githubInstallationId } : {}),
        });

        this.logger.log(
          `[AI_FIX] Batch job ${jobId} dispatched with ${String(buildErrors.length)} error(s) ` +
            `for ${headBranch}@${headSha.slice(0, 8)} via ${scmProviderName}`,
        );
      } catch (error) {
        this.logger.warn(
          `[AI_FIX] Failed to dispatch batch job: ${(error as Error).message}`,
        );
      }

      await this.webhookEventsRepository.markProcessed(webhookEventId);
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

  // ─── SCM Provider Resolution ──────────────────────────────────────────────

  /**
   * Determine which SCM provider to use for branch/push/PR operations.
   * GitHub and GitLab repos use themselves as SCM.
   * Jenkins repos delegate to the org's SCM provider (GitLab or GitHub).
   */
  private async resolveScmProvider(
    repository: ResolvedRepository,
  ): Promise<{ scmProviderName: string; scmConfig: CiConnectionConfig }> {
    const provider = repository.provider ?? 'github';

    if (provider === 'github') {
      const parts = repository.name.split('/');
      return {
        scmProviderName: 'github',
        scmConfig: {
          owner: parts[0] ?? '',
          repo: parts[1] ?? repository.name,
          authToken: repository.githubInstallationId ?? '',
        },
      };
    }

    if (provider === 'gitlab') {
      const scmConfigs = await this.scmProviderConfigsRepository.findConfigsByOrganization(
        repository.organizationId,
      );
      const gitlabConfig = scmConfigs.find(
        (c: { isActive?: boolean; providerType: string }) =>
          c.isActive !== false && c.providerType === 'gitlab',
      );
      const configData = (gitlabConfig?.config as Record<string, string>) ?? {};
      return {
        scmProviderName: 'gitlab',
        scmConfig: {
          owner: '',
          repo: repository.name,
          authToken: configData['accessToken']
            ?? this.configService.get<string>('GITLAB_TOKEN')
            ?? '',
          serverUrl: configData['serverUrl']
            ?? this.configService.get<string>('GITLAB_URL'),
        },
      };
    }

    // Jenkins is CI-only — use the org's SCM provider for source operations
    if (provider === 'jenkins') {
      const scmConfigs = await this.scmProviderConfigsRepository.findConfigsByOrganization(
        repository.organizationId,
      );
      const scmConfig = scmConfigs.find(
        (c: { isActive?: boolean }) => c.isActive !== false,
      );
      if (!scmConfig) {
        this.logger.warn(
          `No SCM provider configured for Jenkins repo ${repository.name}, falling back to env`,
        );
        return {
          scmProviderName: 'gitlab',
          scmConfig: {
            owner: '',
            repo: repository.name,
            authToken: this.configService.get<string>('GITLAB_TOKEN') ?? '',
            serverUrl: this.configService.get<string>('GITLAB_URL'),
          },
        };
      }
      const configData = (scmConfig.config as Record<string, string>) ?? {};
      return {
        scmProviderName: scmConfig.providerType,
        scmConfig: this.ciProviderFactory.buildConnectionConfig({
          name: repository.name,
          provider: scmConfig.providerType,
          authToken: configData['accessToken'],
        }),
      };
    }

    // Unknown provider — try to use env vars
    return {
      scmProviderName: provider,
      scmConfig: this.ciProviderFactory.buildConnectionConfig({
        name: repository.name,
        provider,
      }),
    };
  }

  // ─── Pipeline Run Resolution ──────────────────────────────────────────────

  /**
   * Find or create a pipeline_run record for this webhook event.
   * Returns the pipeline run ID.
   */
  private async resolvePipelineRunId(
    webhookEventId: string,
    repository: ResolvedRepository,
    context: {
      headBranch: string;
      headSha: string;
      externalRunId?: string;
      workflowName?: string;
    },
  ): Promise<string> {
    // Try to find existing pipeline run by external run ID
    const externalRunId = context.externalRunId ?? webhookEventId;
    const existing = await this.webhookEventsRepository.findPipelineRunByExternalId(externalRunId);
    if (existing) return existing.id;

    // Find or create branch + commit + pipeline_run records
    const branchName = context.headBranch || repository.defaultBranch;
    let branch = await this.platformRepository.findBranchByRepoAndName(
      repository.id, branchName,
    );
    if (!branch) {
      branch = await this.platformRepository.createBranch({
        repositoryId: repository.id,
        name: branchName,
      });
    }
    if (!branch) {
      // Race: another worker created it between find and create
      branch = await this.platformRepository.findBranchByRepoAndName(
        repository.id, branchName,
      );
    }
    if (!branch) throw new Error(`Failed to resolve branch "${branchName}"`);

    const commitSha = context.headSha || 'unknown';
    let commit = await this.platformRepository.findCommitByRepoAndSha(
      repository.id, commitSha,
    );
    if (!commit) {
      commit = await this.platformRepository.createCommit({
        repositoryId: repository.id,
        branchId: branch.id,
        commitSha,
        author: 'unknown',
        message: '',
        source: 'webhook',
        committedAt: new Date(),
      });
    }
    if (!commit) {
      commit = await this.platformRepository.findCommitByRepoAndSha(
        repository.id, commitSha,
      );
    }
    if (!commit) throw new Error(`Failed to resolve commit "${commitSha}"`);

    const pipelineRun = await this.webhookEventsRepository.createPipelineRun({
      commitId: commit.id,
      webhookEventId,
      externalRunId,
      workflowName: context.workflowName ?? null,
      provider: repository.provider ?? 'unknown',
      status: 'failed',
    });
    if (!pipelineRun) throw new Error(`Failed to create pipeline run for ${externalRunId}`);

    return pipelineRun.id;
  }

  // ─── Push Supersede ───────────────────────────────────────────────────────

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
      this.logger.log(
        `Superseded job ${job.id} due to new push on ${branchName}`,
      );
    }

    await this.webhookEventsRepository.markProcessed(
      webhookEventId,
      `Push on ${branchName} — superseded ${String(activeJobs.length)} active job(s)`,
    );
  }

  // ─── Repository Resolution ────────────────────────────────────────────────

  private async resolveRepository(
    provider: string,
    payload: WebhookPayloadResult,
  ): Promise<ResolvedRepository | null> {
    const repo = payload.repository;
    if (!repo.externalId && !repo.fullName) return null;

    // Try to find existing repository
    const existing = await this.platformRepository.findRepositoryByProviderAndExternalId(
      provider,
      repo.externalId,
    );

    if (existing) {
      // Backfill GitHub installation ID if missing
      if (
        provider === 'github' &&
        !existing.githubInstallationId &&
        payload.installation?.id
      ) {
        const updated =
          await this.platformRepository.updateRepositoryInstallationId(
            existing.id,
            payload.installation.id,
          );
        if (updated) {
          return { ...existing, githubInstallationId: payload.installation.id };
        }
      }
      return existing;
    }

    // Auto-create organization and repository for first-time webhook
    const orgLogin = payload.organization?.login ?? repo.owner ?? provider;
    const org = await this.platformRepository.createOrganization({
      name: orgLogin,
      slug: orgLogin.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    });

    const installationId = payload.installation?.id
      ?? (provider === 'github'
        ? (this.configService.get<string>('GITHUB_INSTALLATION_ID') ?? null)
        : null);

    const newRepo = await this.platformRepository.createRepository({
      organizationId: org.id,
      provider,
      externalRepoId: repo.externalId,
      name: repo.fullName,
      defaultBranch: repo.defaultBranch,
      primaryLanguage: repo.language,
      githubInstallationId: installationId,
    });

    // Create default settings
    await this.platformRepository.upsertSettings({
      repositoryId: newRepo.id,
    });

    return newRepo;
  }
}

export type ResolvedRepository = {
  id: string;
  organizationId: string;
  name: string;
  defaultBranch: string;
  primaryLanguage: string | null;
  githubInstallationId: string | null;
  provider?: string;
};
