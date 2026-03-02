// ─── Stale PR Cleanup & Soft-Delete Cron ────────────────────────────────────
// EC-02/03/07/22: Close stale HealOps PRs every 15 minutes.
// EC-41: Weekly cleanup of old vector memories and expired cooldowns.
// Loophole 3/4/6: Delete expired healops branches + close stale PRs on GitHub.

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HealopsPullRequestsRepository } from '@db/repositories/healops/pull-requests.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { VectorMemoryService } from '../../vector-memory/vector-memory.service';
import { CostTrackingRepository } from '@db/repositories/healops/cost-tracking.repository';
import { GithubService } from '../../github/github.service';

@Injectable()
export class StalePrCleanupService {
  private readonly logger = new Logger(StalePrCleanupService.name);

  /** PRs older than 7 days are considered stale */
  private static readonly STALE_DAYS = 7;

  constructor(
    private readonly pullRequestsRepository: HealopsPullRequestsRepository,
    private readonly platformRepository: PlatformRepository,
    private readonly vectorMemoryService: VectorMemoryService,
    private readonly costTrackingRepository: CostTrackingRepository,
    private readonly githubService: GithubService,
  ) {}

  /**
   * EC-02/03/07/22: Every 15 minutes, check open agent PRs and close stale ones.
   * Loophole 6 fix: Also closes the PR on GitHub via Octokit, not just in DB.
   */
  @Cron('*/15 * * * *')
  async cleanupStalePrs(): Promise<void> {
    try {
      const openPrs = await this.pullRequestsRepository.findAllOpenAgentPrs();
      if (openPrs.length === 0) return;

      const cutoff = new Date(
        Date.now() - StalePrCleanupService.STALE_DAYS * 24 * 60 * 60 * 1000,
      );

      let closedCount = 0;
      for (const pr of openPrs) {
        // If createdAt is null, treat as stale (data inconsistency — should not happen)
        const createdAt = pr.createdAt ? new Date(pr.createdAt) : null;
        if (createdAt && createdAt >= cutoff) continue;

        // Close on GitHub first (best-effort — don't block DB update on GitHub failure)
        try {
          const repo = await this.resolveRepoFromPr(pr);
          if (repo) {
            const prNumber = parseInt(pr.externalPrId, 10);
            if (!isNaN(prNumber) && repo.githubInstallationId) {
              await this.githubService.closePr(
                repo.githubInstallationId,
                ...this.parseRepoName(repo.name),
                prNumber,
                'Closed by HealOps: PR stale after 7 days without merge.',
              );
            }
          }
        } catch (ghError) {
          this.logger.warn(
            `Failed to close PR ${pr.externalPrId} on GitHub: ${(ghError as Error).message}`,
          );
        }

        await this.pullRequestsRepository.updatePullRequestStatus(
          pr.id,
          'stale_closed',
        );
        closedCount++;
      }

      if (closedCount > 0) {
        this.logger.log(
          `Stale PR cleanup: closed ${String(closedCount)} PR(s) older than ${String(StalePrCleanupService.STALE_DAYS)} days`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Stale PR cleanup failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Loophole 3/4: Every 30 minutes, delete expired healops/fix/* branches from GitHub.
   * Prevents orphaned branches from accumulating after jobs complete or crash.
   * Uses branches.autoDeleteAfter timestamp set at branch creation (NOW + 48h).
   *
   * After successful deletion, clears autoDeleteAfter in DB to prevent
   * repeated deletion attempts on subsequent cron runs.
   */
  @Cron('*/30 * * * *')
  async cleanupExpiredBranches(): Promise<void> {
    try {
      const expiredBranches = await this.platformRepository.findExpiredHealopsBranches();
      if (expiredBranches.length === 0) return;

      let deletedCount = 0;
      for (const branch of expiredBranches) {
        try {
          const repo = await this.platformRepository.findRepositoryById(branch.repositoryId);
          if (repo && repo.githubInstallationId) {
            await this.githubService.deleteBranch(
              repo.githubInstallationId,
              ...this.parseRepoName(repo.name),
              branch.name,
            );
          }
          // Clear autoDeleteAfter so this branch is not re-processed
          await this.platformRepository.clearBranchAutoDelete(branch.id);
          deletedCount++;
        } catch (branchError) {
          // Non-fatal: branch may already be deleted on GitHub (404)
          // Still clear autoDeleteAfter to stop retrying
          this.logger.warn(
            `Failed to delete branch ${branch.name}: ${(branchError as Error).message}`,
          );
          await this.platformRepository.clearBranchAutoDelete(branch.id).catch(() => {
            // Silently ignore DB errors during cleanup
          });
        }
      }

      if (deletedCount > 0) {
        this.logger.log(
          `Branch cleanup: deleted ${String(deletedCount)} expired healops branch(es)`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Branch cleanup failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * EC-41: Weekly cleanup — soft-delete old vector memories + delete expired cooldowns.
   * Runs every Sunday at 3:00 AM.
   */
  @Cron('0 3 * * 0')
  async weeklySoftDeleteCleanup(): Promise<void> {
    try {
      const vectorCount = await this.vectorMemoryService.cleanupOldMemories();
      await this.costTrackingRepository.deleteExpiredCooldowns();

      this.logger.log(
        `Weekly cleanup complete: ${String(vectorCount)} vector entries cleaned, expired cooldowns removed`,
      );
    } catch (error) {
      this.logger.error(
        `Weekly cleanup failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Resolve repository from a PR record by joining through:
   * PR → job → failure → pipeline_run → commit → repository
   */
  private async resolveRepoFromPr(pr: { jobId: string }): Promise<{
    name: string;
    githubInstallationId: string | null;
  } | null> {
    try {
      return await this.pullRequestsRepository.findRepositoryByJobId(pr.jobId);
    } catch {
      return null;
    }
  }

  /**
   * Parse "owner/repo" format into [owner, repo] tuple.
   */
  private parseRepoName(fullName: string): [string, string] {
    const parts = fullName.split('/');
    const owner = parts[0] ?? '';
    const repo = parts[1] ?? '';
    if (!owner || !repo) {
      this.logger.warn(`Invalid repo name format: "${fullName}" — expected "owner/repo"`);
    }
    return [owner, repo];
  }
}
