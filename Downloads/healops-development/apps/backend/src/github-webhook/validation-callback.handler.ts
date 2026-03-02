// ─── Validation Callback Handler ────────────────────────────────────────────
// Called by healops-validation.yml GitHub Action when a fix branch CI run completes.
// Resumes the waiting LangGraph agent via Redis pub/sub.

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { WebhookEventsRepository } from '@db/repositories/healops/webhook-events.repository';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { GithubService } from '../github/github.service';
import { REDIS_CLIENT, REDIS_PUBLISHER } from '@redis/redis.provider';
import { Redis } from 'ioredis';

export interface ValidationCallbackInput {
  authorization: string;
  branch: string;
  status: string;
  runId: number;
  conclusion: string;
  sha: string;
}

// UUID v4 regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ValidationCallbackHandler {
  private readonly logger = new Logger(ValidationCallbackHandler.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookEventsRepository: WebhookEventsRepository,
    private readonly jobsRepository: HealopsJobsRepository,
    private readonly platformRepository: PlatformRepository,
    private readonly githubService: GithubService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(REDIS_PUBLISHER) private readonly redisPublisher: Redis,
  ) {}

  async handle(input: ValidationCallbackInput): Promise<void> {
    // ──── Step 1: Auth check (timing-safe to prevent timing attacks) ────────
    const expectedToken = this.configService.get<string>('HEALOPS_WEBHOOK_API_KEY') ?? '';
    const receivedToken = input.authorization.replace('Bearer ', '');
    if (!expectedToken || !this.timingSafeCompare(expectedToken, receivedToken)) {
      throw new UnauthorizedException('Invalid validation callback token');
    }

    // ──── Step 1b: EC-37 — Idempotency dedup via Redis NX ──────────────────
    const dedupKey = `healops:callback:${String(input.runId)}`;
    const isNew = await this.redis.set(dedupKey, '1', 'EX', 3600, 'NX');
    if (!isNew) {
      this.logger.warn(`Duplicate validation callback for runId=${String(input.runId)} — ignoring`);
      return;
    }

    // ──── Step 2: Extract job_id from branch name ────────────────────────────
    // Branch format: patchpilot/fix/{job_id} or healops/fix/{job_id}
    const jobId = this.extractJobId(input.branch);
    if (!jobId) {
      throw new BadRequestException(
        `Invalid branch format: "${input.branch}". Expected: patchpilot/fix/{uuid} or healops/fix/{uuid}`,
      );
    }

    // Verify job exists AND is in a state that expects validation
    const job = await this.jobsRepository.findJobById(jobId);
    if (!job) {
      throw new BadRequestException(`Job not found: ${jobId}`);
    }

    // Reject callbacks for jobs that are already completed/escalated/superseded
    const terminalStatuses = ['success', 'failed', 'escalated', 'superseded', 'budget_exceeded'];
    if (terminalStatuses.includes(job.status)) {
      this.logger.warn(
        `Validation callback for job ${jobId} in terminal status '${job.status}' — ignoring`,
      );
      return;
    }

    this.logger.log(
      `Validation callback: job=${jobId} branch=${input.branch} status=${input.status} conclusion=${input.conclusion}`,
    );

    // ──── Step 3: Create pipeline_run for the validation run ─────────────────
    // Look up the commit by SHA to get the real commit ID for the pipeline_runs FK
    try {
      const repositoryId = (job as Record<string, unknown>)['repositoryId'] as string | undefined;
      let commitId: string | null = null;

      if (repositoryId && input.sha) {
        const commit = await this.platformRepository.findCommitByRepoAndSha(repositoryId, input.sha);
        if (commit) {
          commitId = commit.id;
        }
      }

      if (commitId) {
        await this.webhookEventsRepository.createPipelineRun({
          commitId,
          externalRunId: String(input.runId),
          workflowName: 'healops-validation.yml',
          provider: 'github',
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
        });
      } else {
        this.logger.warn(
          `Could not resolve commit for sha=${input.sha} repo=${repositoryId ?? 'unknown'} — skipping pipeline_run creation`,
        );
      }
    } catch (error) {
      // Non-fatal — the important thing is resuming the agent
      this.logger.warn(
        `Failed to create validation pipeline_run: ${(error as Error).message}`,
      );
    }

    // ──── Step 4: Cross-verify status via GitHub API (anti-replay) ──────────
    // Don't blindly trust the callback payload. Verify the actual run conclusion
    // from GitHub to prevent spoofed "success" callbacks.
    let verifiedConclusion = input.conclusion;
    try {
      const failure = await this.jobsRepository.findJobById(jobId);
      if (failure) {
        const repo = await this.platformRepository.findRepositoryById(
          (failure as Record<string, unknown>)['repositoryId'] as string ?? '',
        );
        if (repo && repo.githubInstallationId) {
          const [owner, repoName] = repo.name.split('/');
          if (owner && repoName) {
            const actualStatus = await this.githubService.getLatestWorkflowStatus(
              repo.githubInstallationId,
              owner,
              repoName,
              input.branch,
            );
            if (actualStatus && actualStatus !== input.conclusion) {
              this.logger.warn(
                `Validation callback mismatch: reported=${input.conclusion} actual=${actualStatus} — using actual`,
              );
              verifiedConclusion = actualStatus;
            }
          }
        }
      }
    } catch (verifyError) {
      // Non-fatal: if we can't verify, trust the callback but log a warning
      this.logger.warn(
        `Could not cross-verify validation status via GitHub API: ${(verifyError as Error).message}`,
      );
    }

    // ──── Step 5: Resume waiting agent via Redis pub/sub ─────────────────────
    const channel = `validation:${jobId}`;
    const message = JSON.stringify({
      status: verifiedConclusion === 'success' ? 'success' : 'failure',
      run_id: input.runId,
      conclusion: verifiedConclusion,
      sha: input.sha,
    });

    // Store result in Redis key as fallback for agents that missed the pub/sub
    // message (e.g., if the subscriber connected after the publish).
    // TTL: 1 hour — agent should pick it up well before that.
    const resultKey = `healops:validation-result:${jobId}`;
    await this.redis.set(resultKey, message, 'EX', 3600);

    await this.redisPublisher.publish(channel, message);
    this.logger.log(`Published validation result to channel ${channel} (conclusion=${verifiedConclusion})`);
  }

  /**
   * Constant-time string comparison to prevent timing attacks on the API key.
   */
  private timingSafeCompare(expected: string, received: string): boolean {
    if (!expected || !received) return false;
    const expectedBuf = Buffer.from(expected, 'utf8');
    const receivedBuf = Buffer.from(received, 'utf8');
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  }

  /**
   * Extract UUID job_id from branch name.
   * Supports: patchpilot/fix/{uuid}, healops/fix/{uuid}
   */
  private extractJobId(branch: string): string | null {
    if (!branch) return null;

    const segments = branch.split('/');
    // Expect at least 3 segments: prefix/fix/uuid
    if (segments.length < 3) return null;

    const lastSegment = segments[segments.length - 1];
    if (!lastSegment || !UUID_REGEX.test(lastSegment)) return null;

    return lastSegment;
  }
}
