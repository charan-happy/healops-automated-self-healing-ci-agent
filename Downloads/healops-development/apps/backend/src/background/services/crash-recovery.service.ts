import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';

@Injectable()
export class CrashRecoveryService implements OnApplicationBootstrap {
  private static readonly DEFAULT_ORPHAN_THRESHOLD_MINUTES = 30;
  private readonly orphanThresholdMinutes: number;
  private readonly logger = new Logger(CrashRecoveryService.name);

  constructor(
    private readonly jobsRepository: HealopsJobsRepository,
    private readonly platformRepository: PlatformRepository,
    private readonly configService: ConfigService,
  ) {
    this.orphanThresholdMinutes =
      this.configService.get<number>('HEALOPS_ORPHAN_THRESHOLD_MINUTES') ??
      CrashRecoveryService.DEFAULT_ORPHAN_THRESHOLD_MINUTES;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.recoverOrphanedJobs();
    await this.flagExpiredBranches();
  }

  /**
   * Find jobs stuck in 'running' status (likely from a previous crash)
   * and mark them as 'failed' so they can be retried or escalated.
   */
  private async recoverOrphanedJobs(): Promise<void> {
    try {
      const orphanedJobs = await this.jobsRepository.findOrphanedRunningJobs(
        this.orphanThresholdMinutes,
      );

      if (orphanedJobs.length === 0) {
        this.logger.log('Crash recovery: no orphaned running jobs found');
        return;
      }

      this.logger.warn(
        `Crash recovery: found ${String(orphanedJobs.length)} orphaned running job(s)`,
      );

      let recoveredCount = 0;
      for (const job of orphanedJobs) {
        try {
          await this.jobsRepository.updateJobStatus(job.id, 'failed');
          this.logger.warn(
            `Crash recovery: marked job ${job.id} (failure ${job.failureId}) as failed — was running since ${job.startedAt?.toISOString() ?? 'unknown'}`,
          );
          recoveredCount++;
        } catch (error) {
          this.logger.error(
            `Crash recovery: failed to update job ${job.id}: ${(error as Error).message}`,
            (error as Error).stack,
          );
        }
      }

      this.logger.warn(
        `Crash recovery complete: ${String(recoveredCount)}/${String(orphanedJobs.length)} orphaned jobs marked as failed`,
      );
    } catch (error) {
      this.logger.error(
        `Crash recovery (orphaned jobs) failed (non-fatal): ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Loophole 8 fix: On startup, check for expired healops branches whose
   * autoDeleteAfter has passed. Log them so the periodic cron job
   * (stale-pr-cleanup.service.ts) can clean them up on the next run.
   *
   * We don't delete branches here because startup should be fast and
   * GitHub API calls are slow. The cron job handles actual deletion.
   */
  private async flagExpiredBranches(): Promise<void> {
    try {
      const expiredBranches = await this.platformRepository.findExpiredHealopsBranches();

      if (expiredBranches.length === 0) {
        this.logger.log('Crash recovery: no expired healops branches found');
        return;
      }

      this.logger.warn(
        `Crash recovery: found ${String(expiredBranches.length)} expired healops branch(es) pending cleanup — ` +
        `will be deleted by next cron run (every 30 min)`,
      );

      for (const branch of expiredBranches) {
        this.logger.warn(
          `  Expired branch: ${branch.name} (repo=${branch.repositoryId}, expired=${branch.autoDeleteAfter?.toISOString() ?? 'unknown'})`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Crash recovery (expired branches) failed (non-fatal): ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
