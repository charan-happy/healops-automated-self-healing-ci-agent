// ─── Pull Requests Repository ───────────────────────────────────────────────
// Data access for: pull_requests

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { pullRequests } from '../../schema/outputs';
import { jobs } from '../../schema/agent';
import { failures } from '../../schema/analysis';
import { pipelineRuns } from '../../schema/ingestion';
import { commits } from '../../schema/platform';
import { repositories } from '../../schema/platform';
import { eq, and, sql, like } from 'drizzle-orm';

@Injectable()
export class HealopsPullRequestsRepository {
  constructor(private readonly dbService: DBService) {}

  async createPullRequest(data: typeof pullRequests.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(pullRequests)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create pull request');
    return row;
  }

  async findPullRequestByJob(jobId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(pullRequests)
      .where(eq(pullRequests.jobId, jobId));
    return row ?? null;
  }

  async findOpenPrByTargetBranch(targetBranch: string) {
    const [row] = await this.dbService.db
      .select()
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.targetBranch, targetBranch),
          eq(pullRequests.status, 'open'),
        ),
      );
    return row ?? null;
  }

  async findOpenPrBySourceBranch(sourceBranch: string) {
    const [row] = await this.dbService.db
      .select()
      .from(pullRequests)
      .where(
        and(
          eq(pullRequests.sourceBranch, sourceBranch),
          eq(pullRequests.status, 'open'),
        ),
      );
    return row ?? null;
  }

  async updatePullRequestStatus(id: string, status: string) {
    const setValues: Record<string, unknown> = { status };
    if (status === 'merged') {
      setValues['mergedAt'] = sql`now()`;
    }
    if (status === 'superseded') {
      setValues['supersededAt'] = sql`now()`;
    }
    const [row] = await this.dbService.db
      .update(pullRequests)
      .set(setValues as Partial<typeof pullRequests.$inferInsert>)
      .where(eq(pullRequests.id, id))
      .returning();
    return row ?? null;
  }

  /**
   * EC-02/03: Find all open agent PRs for stale cleanup.
   */
  async findAllOpenAgentPrs() {
    return this.dbService.db
      .select()
      .from(pullRequests)
      .where(
        and(
          like(pullRequests.sourceBranch, 'healops/fix/%'),
          eq(pullRequests.status, 'open'),
        ),
      );
  }

  async supersedePullRequest(id: string, supersededBy: string) {
    const [row] = await this.dbService.db
      .update(pullRequests)
      .set({
        status: 'superseded',
        supersededAt: sql`now()`,
        supersededByCommit: supersededBy,
      })
      .where(eq(pullRequests.id, id))
      .returning();
    return row ?? null;
  }

  /**
   * Resolve the repository for a given job ID by joining through the chain:
   * job → failure → pipeline_run → commit → repository
   */
  async findRepositoryByJobId(jobId: string) {
    const [row] = await this.dbService.db
      .select({
        id: repositories.id,
        name: repositories.name,
        githubInstallationId: repositories.githubInstallationId,
      })
      .from(jobs)
      .innerJoin(failures, eq(jobs.failureId, failures.id))
      .innerJoin(pipelineRuns, eq(failures.pipelineRunId, pipelineRuns.id))
      .innerJoin(commits, eq(pipelineRuns.commitId, commits.id))
      .innerJoin(repositories, eq(commits.repositoryId, repositories.id))
      .where(eq(jobs.id, jobId));
    return row ?? null;
  }
}
