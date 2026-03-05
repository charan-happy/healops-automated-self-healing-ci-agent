// ─── CI Webhook Service ─────────────────────────────────────────────────────
// Provider-agnostic webhook processing service.
// Takes a normalised WebhookPayloadResult and runs the guard chain
// (duplicate check, healops branch check, cooldown check, budget check)
// then dispatches to the repair pipeline via BullMQ.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookPayloadResult } from '../ci-provider/interfaces/ci-provider.interface';
import { WebhookEventsRepository } from '@db/repositories/healops/webhook-events.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { CostTrackingRepository } from '@db/repositories/healops/cost-tracking.repository';
import { CostTrackingService } from '@cost-tracking/cost-tracking.service';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { WebhookIngestQueueService } from '@bg/queue/webhook-ingest/webhook-ingest-queue.service';

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
        },
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
    payload: WebhookPayloadResult,
    repository: ResolvedRepository,
  ): Promise<void> {
    try {
      // Handle push events — supersede active jobs on same branch
      if (eventType === 'push') {
        await this.handlePushSupersede(
          repository.id,
          payload.headBranch,
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
      const headBranch = payload.headBranch;
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
      const headSha = payload.headSha;
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

      // ── All guards passed — mark for repair dispatch ───────────────────
      this.logger.log(
        `All guards passed for ${webhookEventId}, ready for repair dispatch`,
      );
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
};
