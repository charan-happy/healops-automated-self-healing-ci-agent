// ─── Repair Jobs Service ────────────────────────────────────────────────────
// Pre-flight checks before enqueuing a repair job.
// EC-06: Error hash dedup, EC-32: Redis lock, Budget check.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueName, JobName } from '@bg/constants/job.constant';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { FailuresRepository } from '@db/repositories/healops/failures.repository';
import { CostTrackingRepository } from '@db/repositories/healops/cost-tracking.repository';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';

export interface EnqueueRepairInput {
  failureId: string;
  repositoryId: string;
  branchName: string;
  failureType: string;
  errorHash: string;
  organizationId?: string;
}

@Injectable()
export class RepairJobsService {
  private readonly logger = new Logger(RepairJobsService.name);

  constructor(
    @InjectQueue(QueueName.HEALOPS_REPAIR) private readonly repairQueue: Queue,
    private readonly jobsRepository: HealopsJobsRepository,
    private readonly failuresRepository: FailuresRepository,
    private readonly costTrackingRepository: CostTrackingRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async enqueueRepair(input: EnqueueRepairInput): Promise<string | null> {
    // EC-32: Acquire Redis lock to prevent race conditions
    // TTL 30s — must be long enough for all dedup checks + DB writes + queue add
    const lockKey = `healops:lock:enqueue:${input.repositoryId}:${input.branchName}:${input.errorHash}`;
    let lockAcquired: string | null = null;
    try {
      lockAcquired = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');
    } catch (redisError) {
      this.logger.error(`Redis lock acquisition failed: ${(redisError as Error).message}`);
      return null;
    }

    if (!lockAcquired) {
      this.logger.warn(`Enqueue lock contention for ${lockKey} — skipping`);
      return null;
    }

    try {
      return await this.doEnqueue(input);
    } finally {
      await this.redis.del(lockKey).catch((err) => {
        this.logger.warn(`Failed to release lock ${lockKey}: ${(err as Error).message}`);
      });
    }
  }

  private async doEnqueue(input: EnqueueRepairInput): Promise<string | null> {
    // 1. Check cooldown
    const onCooldown = await this.costTrackingRepository.isOnCooldown(
      input.repositoryId,
      input.branchName,
      input.failureType,
    );
    if (onCooldown) {
      this.logger.warn(`Cooldown active for ${input.repositoryId}/${input.branchName}`);
      return null;
    }

    // 2. Check flaky — skip if confirmed flaky
    const isFlaky = await this.failuresRepository.isFlakyConfirmed(
      input.repositoryId,
      input.errorHash,
    );
    if (isFlaky) {
      this.logger.warn(`Skipping flaky failure: ${input.errorHash}`);
      return null;
    }

    // 3. Check active job dedup
    const activeJob = await this.jobsRepository.findActiveJobByFailure(input.failureId);
    if (activeJob) {
      this.logger.warn(`Active job already exists for failure: ${input.failureId}`);
      return activeJob.id;
    }

    // 3a. EC-06: Error hash dedup — check if another failure with same hash has an active job
    const existingFailure = await this.failuresRepository.findFailureByErrorHash(input.errorHash);
    if (existingFailure && existingFailure.id !== input.failureId) {
      const existingActiveJob = await this.jobsRepository.findActiveJobByFailure(existingFailure.id);
      if (existingActiveJob) {
        this.logger.warn(`Active job exists for same error hash ${input.errorHash}: ${existingActiveJob.id}`);
        return existingActiveJob.id;
      }
    }

    // 3b. Budget check — if budget exhausted, create job with budget_exceeded status
    if (input.organizationId) {
      const budgetExhausted = await this.costTrackingRepository.isBudgetExhausted(input.organizationId);
      if (budgetExhausted) {
        this.logger.warn(`Budget exhausted for org ${input.organizationId}`);
        await this.jobsRepository.createJob({
          failureId: input.failureId,
          status: 'budget_exceeded',
        });
        return null;
      }
    }

    // 4. Create job record
    const job = await this.jobsRepository.createJob({
      failureId: input.failureId,
      status: 'queued',
    });

    // 5. Enqueue to BullMQ with retry config
    await this.repairQueue.add(
      JobName.REPAIR_JOB,
      {
        jobId: job.id,
        failureId: input.failureId,
        repositoryId: input.repositoryId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );

    this.logger.log(`Repair job ${job.id} enqueued for failure ${input.failureId}`);
    return job.id;
  }
}
