/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('@octokit/rest', () => ({ Octokit: jest.fn() }));
jest.mock('@octokit/auth-app', () => ({ createAppAuth: jest.fn() }));

import { UnauthorizedException } from '@nestjs/common';
import { GithubWebhookService } from './github-webhook.service';
import { ConfigService } from '@nestjs/config';
import { WebhookEventsRepository } from '@db/repositories/healops/webhook-events.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { FailuresRepository } from '@db/repositories/healops/failures.repository';
import { CostTrackingRepository } from '@db/repositories/healops/cost-tracking.repository';
import { GithubService } from '@github/github.service';
import { LogParserService } from '@repair-agent/services/log-parser.service';
import { CostTrackingService } from '@cost-tracking/cost-tracking.service';
import { RepairJobsService } from '@repair-jobs/repair-jobs.service';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { WebhookIngestQueueService } from '@bg/queue/webhook-ingest/webhook-ingest-queue.service';
import { FixRequestQueue } from '@bg/queue/fix-request/fix-request.queue';
import { computeHmacSha256 } from '@common/utils/hash';

describe('GithubWebhookService', () => {
  let service: GithubWebhookService;
  let mockConfig: jest.Mocked<ConfigService>;
  let mockWebhookEvents: jest.Mocked<WebhookEventsRepository>;
  let mockPlatform: jest.Mocked<PlatformRepository>;
  let mockFailures: jest.Mocked<FailuresRepository>;
  let mockCostTrackingRepo: jest.Mocked<CostTrackingRepository>;
  let mockCostTrackingService: jest.Mocked<CostTrackingService>;
  let mockGithub: jest.Mocked<GithubService>;
  let mockLogParser: jest.Mocked<LogParserService>;
  let mockRepairJobs: jest.Mocked<RepairJobsService>;
  let mockJobsRepo: jest.Mocked<HealopsJobsRepository>;
  let mockWebhookIngestQueue: jest.Mocked<WebhookIngestQueueService>;
  let mockFixRequestQueue: jest.Mocked<FixRequestQueue>;

  const WEBHOOK_SECRET = 'test-webhook-secret';

  const makePayload = (overrides: Record<string, unknown> = {}) => ({
    action: 'completed',
    workflow_run: {
      id: 12345,
      name: 'CI',
      path: '.github/workflows/ci.yml',
      head_branch: 'main',
      head_sha: 'abc123def456abc123def456abc123def456abc1',
      conclusion: 'failure',
      html_url: 'https://github.com/org/repo/actions/runs/12345',
      run_started_at: '2026-02-27T10:00:00Z',
      updated_at: '2026-02-27T10:05:00Z',
      head_commit: {
        author: { name: 'dev' },
        message: 'fix: something',
      },
    },
    repository: {
      id: 999,
      full_name: 'org/repo',
      name: 'repo',
      default_branch: 'main',
      language: 'TypeScript',
      owner: { login: 'org' },
    },
    installation: { id: 42 },
    organization: { login: 'org', id: 1 },
    ...overrides,
  });

  beforeEach(() => {
    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'GITHUB_WEBHOOK_SECRET') return WEBHOOK_SECRET;
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    mockWebhookEvents = {
      createWebhookEvent: jest.fn(),
      markProcessed: jest.fn(),
      createPipelineRun: jest.fn(),
      findPipelineRunByExternalId: jest.fn(),
      findRecentPipelineRuns: jest.fn(),
      updatePipelineRunStatus: jest.fn(),
    } as unknown as jest.Mocked<WebhookEventsRepository>;

    mockPlatform = {
      findRepositoryByProviderAndExternalId: jest.fn(),
      createOrganization: jest.fn(),
      createRepository: jest.fn(),
      upsertSettings: jest.fn(),
      findSettingsByRepositoryId: jest.fn(),
      findBranchByRepoAndName: jest.fn(),
      createBranch: jest.fn(),
      findCommitByRepoAndSha: jest.fn(),
      createCommit: jest.fn(),
    } as unknown as jest.Mocked<PlatformRepository>;

    mockFailures = {
      createFailure: jest.fn(),
      findErrorTypeByCode: jest.fn(),
    } as unknown as jest.Mocked<FailuresRepository>;

    mockCostTrackingRepo = {
      isOnCooldown: jest.fn(),
    } as unknown as jest.Mocked<CostTrackingRepository>;

    mockCostTrackingService = {
      hasBudget: jest.fn(),
    } as unknown as jest.Mocked<CostTrackingService>;

    mockGithub = {
      getWorkflowRunLogs: jest.fn(),
    } as unknown as jest.Mocked<GithubService>;

    mockLogParser = {
      parseLog: jest.fn().mockReturnValue({
        errorSnippet: 'error TS2345: Argument not assignable',
        affectedFile: 'src/app.ts',
        language: 'typescript',
        rawErrorLines: ['error TS2345: Argument not assignable'],
      }),
      classifyErrorType: jest.fn().mockReturnValue('TYPE_ERROR'),
      truncateToTokenBudget: jest.fn().mockImplementation((text: string) => text),
      extractErrorSnippet: jest.fn().mockReturnValue('error TS2345'),
      parseErrorLocation: jest.fn().mockReturnValue({ file: 'src/app.ts', line: 10, message: 'error' }),
    } as unknown as jest.Mocked<LogParserService>;

    mockRepairJobs = {
      enqueueRepair: jest.fn(),
    } as unknown as jest.Mocked<RepairJobsService>;

    mockJobsRepo = {
      findActiveJobsByRepoBranch: jest.fn().mockResolvedValue([]),
      updateJobStatus: jest.fn(),
    } as unknown as jest.Mocked<HealopsJobsRepository>;

    mockWebhookIngestQueue = {
      enqueueWebhookIngest: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WebhookIngestQueueService>;

    mockFixRequestQueue = {
      addFixRequest: jest.fn().mockResolvedValue({ jobId: 'ai-fix-job-1' }),
    } as unknown as jest.Mocked<FixRequestQueue>;

    service = new GithubWebhookService(
      mockConfig,
      mockWebhookEvents,
      mockPlatform,
      mockFailures,
      mockCostTrackingRepo,
      mockCostTrackingService,
      mockGithub,
      mockLogParser,
      mockRepairJobs,
      mockJobsRepo,
      mockWebhookIngestQueue,
      mockFixRequestQueue,
    );
  });

  function makeValidInput(payload: Record<string, unknown> = makePayload()) {
    const rawBody = JSON.stringify(payload);
    const signature = computeHmacSha256(rawBody, WEBHOOK_SECRET);
    return {
      signature,
      event: 'workflow_run',
      deliveryId: 'delivery-123',
      rawBody,
      payload,
    };
  }

  describe('processGithubWebhook()', () => {
    it('should reject invalid HMAC signature with 401', async () => {
      const input = makeValidInput();
      input.signature = 'sha256=invalid';

      await expect(service.processGithubWebhook(input)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return silently for duplicate delivery (idempotent)', async () => {
      // resolveRepository returns a repo
      mockPlatform.findRepositoryByProviderAndExternalId.mockResolvedValue({
        id: 'repo-uuid',
        organizationId: 'org-uuid',
        name: 'org/repo',
        defaultBranch: 'main',
        primaryLanguage: 'TypeScript',
        githubInstallationId: '42',
        provider: 'github',
        externalRepoId: '999',
        isActive: true,
        webhookSecret: null,
        ciProviderConfigId: null,
        createdAt: new Date(),
        deletedAt: null,
      });

      // createWebhookEvent returns null (conflict)
      mockWebhookEvents.createWebhookEvent.mockResolvedValue(null);

      const input = makeValidInput();
      await service.processGithubWebhook(input);

      // Should not throw, and no further processing
      expect(mockPlatform.findSettingsByRepositoryId).not.toHaveBeenCalled();
    });

    it('should accept valid signature and create webhook event', async () => {
      mockPlatform.findRepositoryByProviderAndExternalId.mockResolvedValue({
        id: 'repo-uuid',
        organizationId: 'org-uuid',
        name: 'org/repo',
        defaultBranch: 'main',
        primaryLanguage: 'TypeScript',
        githubInstallationId: '42',
        provider: 'github',
        externalRepoId: '999',
        isActive: true,
        webhookSecret: null,
        ciProviderConfigId: null,
        createdAt: new Date(),
        deletedAt: null,
      });

      mockWebhookEvents.createWebhookEvent.mockResolvedValue({
        id: 'event-uuid',
        externalEventId: 'delivery-123',
        repositoryId: 'repo-uuid',
        provider: 'github',
        eventType: 'workflow_run',
        payload: {},
        signatureValid: true,
        processed: false,
        processingError: null,
        receivedAt: new Date(),
      });

      const input = makeValidInput();
      await service.processGithubWebhook(input);

      expect(mockWebhookEvents.createWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          externalEventId: 'delivery-123',
          provider: 'github',
          signatureValid: true,
        }),
      );
    });

    it('should handle push events via EC-40 supersede handler', async () => {
      mockPlatform.findRepositoryByProviderAndExternalId.mockResolvedValue({
        id: 'repo-uuid',
        organizationId: 'org-uuid',
        name: 'org/repo',
        defaultBranch: 'main',
        primaryLanguage: 'TypeScript',
        githubInstallationId: '42',
        provider: 'github',
        externalRepoId: '999',
        isActive: true,
        webhookSecret: null,
        ciProviderConfigId: null,
        createdAt: new Date(),
        deletedAt: null,
      });

      mockWebhookEvents.createWebhookEvent.mockResolvedValue({
        id: 'event-uuid',
        externalEventId: 'delivery-456',
        repositoryId: 'repo-uuid',
        provider: 'github',
        eventType: 'push',
        payload: {},
        signatureValid: true,
        processed: false,
        processingError: null,
        receivedAt: new Date(),
      });

      const payload = { ...makePayload(), ref: 'refs/heads/main' };
      const rawBody = JSON.stringify(payload);
      const signature = computeHmacSha256(rawBody, WEBHOOK_SECRET);

      await service.processGithubWebhook({
        signature,
        event: 'push',
        deliveryId: 'delivery-456',
        rawBody,
        payload,
      });

      // EC-29: Event is now enqueued to BullMQ instead of fire-and-forget
      expect(mockWebhookIngestQueue.enqueueWebhookIngest).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookEventId: 'event-uuid',
          eventType: 'push',
        }),
      );
    });

    it('should skip healops/fix/ branches (loop prevention)', async () => {
      const payload = makePayload({
        workflow_run: {
          ...makePayload().workflow_run,
          head_branch: 'healops/fix/some-uuid',
        },
      });

      mockPlatform.findRepositoryByProviderAndExternalId.mockResolvedValue({
        id: 'repo-uuid',
        organizationId: 'org-uuid',
        name: 'org/repo',
        defaultBranch: 'main',
        primaryLanguage: 'TypeScript',
        githubInstallationId: '42',
        provider: 'github',
        externalRepoId: '999',
        isActive: true,
        webhookSecret: null,
        ciProviderConfigId: null,
        createdAt: new Date(),
        deletedAt: null,
      });

      mockWebhookEvents.createWebhookEvent.mockResolvedValue({
        id: 'event-uuid',
        externalEventId: 'delivery-789',
        repositoryId: 'repo-uuid',
        provider: 'github',
        eventType: 'workflow_run',
        payload: {},
        signatureValid: true,
        processed: false,
        processingError: null,
        receivedAt: new Date(),
      });

      mockPlatform.findSettingsByRepositoryId.mockResolvedValue(null);
      mockPlatform.findBranchByRepoAndName.mockResolvedValue(null);

      const rawBody = JSON.stringify(payload);
      const signature = computeHmacSha256(rawBody, WEBHOOK_SECRET);

      await service.processGithubWebhook({
        signature,
        event: 'workflow_run',
        deliveryId: 'delivery-789',
        rawBody,
        payload,
      });

      // EC-29: Event is now enqueued to BullMQ — loop prevention happens in processor
      expect(mockWebhookIngestQueue.enqueueWebhookIngest).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookEventId: 'event-uuid',
          eventType: 'workflow_run',
        }),
      );
    });
  });
});
