import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ValidationCallbackHandler } from './validation-callback.handler';
import { ConfigService } from '@nestjs/config';
import { WebhookEventsRepository } from '@db/repositories/healops/webhook-events.repository';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { GithubService } from '../github/github.service';
import { Redis } from 'ioredis';

describe('ValidationCallbackHandler', () => {
  let handler: ValidationCallbackHandler;
  let mockConfig: jest.Mocked<ConfigService>;
  let mockWebhookEvents: jest.Mocked<WebhookEventsRepository>;
  let mockJobs: jest.Mocked<HealopsJobsRepository>;
  let mockPlatform: jest.Mocked<PlatformRepository>;
  let mockGithub: jest.Mocked<GithubService>;
  let mockRedisClient: jest.Mocked<Redis>;
  let mockRedisPublisher: jest.Mocked<Redis>;

  const API_KEY = 'test-api-key-123';
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'HEALOPS_WEBHOOK_API_KEY') return API_KEY;
        return undefined;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    mockWebhookEvents = {
      createPipelineRun: jest.fn().mockResolvedValue({ id: 'run-uuid' }),
    } as unknown as jest.Mocked<WebhookEventsRepository>;

    mockJobs = {
      findJobById: jest.fn(),
    } as unknown as jest.Mocked<HealopsJobsRepository>;

    mockPlatform = {
      findRepositoryById: jest.fn().mockResolvedValue(null),
      findCommitByRepoAndSha: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<PlatformRepository>;

    mockGithub = {
      getLatestWorkflowStatus: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<GithubService>;

    mockRedisClient = {
      set: jest.fn().mockResolvedValue('OK'),
    } as unknown as jest.Mocked<Redis>;

    mockRedisPublisher = {
      publish: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<Redis>;

    handler = new ValidationCallbackHandler(
      mockConfig,
      mockWebhookEvents,
      mockJobs,
      mockPlatform,
      mockGithub,
      mockRedisClient,
      mockRedisPublisher,
    );
  });

  const validInput = {
    authorization: `Bearer ${API_KEY}`,
    branch: `patchpilot/fix/${VALID_UUID}`,
    status: 'success',
    runId: 12345678,
    conclusion: 'success',
    sha: 'abc123def456abc123def456abc123def456abc1',
  };

  describe('auth check', () => {
    it('should reject missing API key', async () => {
      await expect(
        handler.handle({ ...validInput, authorization: 'Bearer wrong-key' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject empty authorization', async () => {
      await expect(
        handler.handle({ ...validInput, authorization: '' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('branch parsing', () => {
    it('should reject invalid branch format', async () => {
      await expect(
        handler.handle({ ...validInput, branch: 'main' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-UUID job_id', async () => {
      await expect(
        handler.handle({ ...validInput, branch: 'patchpilot/fix/not-a-uuid' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject branch with too few segments', async () => {
      await expect(
        handler.handle({ ...validInput, branch: 'fix' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should extract job_id from patchpilot/fix/{uuid}', async () => {
      mockJobs.findJobById.mockResolvedValue({
        id: VALID_UUID,
        failureId: 'failure-uuid',
        status: 'running',
      } as any);

      await handler.handle(validInput);

      expect(mockJobs.findJobById).toHaveBeenCalledWith(VALID_UUID);
    });

    it('should extract job_id from healops/fix/{uuid}', async () => {
      mockJobs.findJobById.mockResolvedValue({
        id: VALID_UUID,
        failureId: 'failure-uuid',
        status: 'running',
      } as any);

      await handler.handle({
        ...validInput,
        branch: `healops/fix/${VALID_UUID}`,
      });

      expect(mockJobs.findJobById).toHaveBeenCalledWith(VALID_UUID);
    });
  });

  describe('job validation', () => {
    it('should reject if job does not exist', async () => {
      mockJobs.findJobById.mockResolvedValue(null);

      await expect(handler.handle(validInput)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should ignore callback for jobs in terminal status', async () => {
      mockJobs.findJobById.mockResolvedValue({
        id: VALID_UUID,
        failureId: 'failure-uuid',
        status: 'success', // already completed
      } as any);

      // Should NOT throw and should NOT publish
      await handler.handle(validInput);
      expect(mockRedisPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('Redis pub/sub', () => {
    it('should publish validation result to correct channel', async () => {
      mockJobs.findJobById.mockResolvedValue({
        id: VALID_UUID,
        failureId: 'failure-uuid',
        status: 'running',
      } as any);

      await handler.handle(validInput);

      expect(mockRedisPublisher.publish).toHaveBeenCalledWith(
        `validation:${VALID_UUID}`,
        JSON.stringify({
          status: 'success',
          run_id: 12345678,
          conclusion: 'success',
          sha: 'abc123def456abc123def456abc123def456abc1',
        }),
      );
    });
  });

  describe('pipeline_run creation', () => {
    it('should create pipeline_run record when commit is found', async () => {
      mockJobs.findJobById.mockResolvedValue({
        id: VALID_UUID,
        failureId: 'failure-uuid',
        repositoryId: 'repo-uuid',
        status: 'running',
      } as any);
      mockPlatform.findCommitByRepoAndSha.mockResolvedValue({
        id: 'commit-uuid',
      } as any);

      await handler.handle(validInput);

      expect(mockPlatform.findCommitByRepoAndSha).toHaveBeenCalledWith(
        'repo-uuid',
        'abc123def456abc123def456abc123def456abc1',
      );
      expect(mockWebhookEvents.createPipelineRun).toHaveBeenCalledWith(
        expect.objectContaining({
          commitId: 'commit-uuid',
          externalRunId: '12345678',
          workflowName: 'healops-validation.yml',
          provider: 'github',
          status: 'completed',
        }),
      );
    });

    it('should skip pipeline_run creation when commit is not found', async () => {
      mockJobs.findJobById.mockResolvedValue({
        id: VALID_UUID,
        failureId: 'failure-uuid',
        repositoryId: 'repo-uuid',
        status: 'running',
      } as any);
      mockPlatform.findCommitByRepoAndSha.mockResolvedValue(null);

      await handler.handle(validInput);

      expect(mockWebhookEvents.createPipelineRun).not.toHaveBeenCalled();
      // Should still publish to Redis
      expect(mockRedisPublisher.publish).toHaveBeenCalled();
    });

    it('should not fail if pipeline_run creation fails', async () => {
      mockJobs.findJobById.mockResolvedValue({
        id: VALID_UUID,
        failureId: 'failure-uuid',
        repositoryId: 'repo-uuid',
        status: 'running',
      } as any);
      mockPlatform.findCommitByRepoAndSha.mockResolvedValue({
        id: 'commit-uuid',
      } as any);
      mockWebhookEvents.createPipelineRun.mockRejectedValue(new Error('DB error'));

      // Should not throw — pipeline_run is non-fatal
      await handler.handle(validInput);

      expect(mockRedisPublisher.publish).toHaveBeenCalled();
    });
  });
});
