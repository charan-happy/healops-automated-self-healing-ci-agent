// ─── Jobs Repository ────────────────────────────────────────────────────────
// Data access for: jobs, attempts, patches, validations

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { jobs, attempts, patches, validations } from '../../schema/agent';
import { failures } from '../../schema/analysis';
import { pipelineRuns } from '../../schema/ingestion';
import { commits, branches } from '../../schema/platform';
import { eq, and, sql, desc, lt } from 'drizzle-orm';

@Injectable()
export class HealopsJobsRepository {
  constructor(private readonly dbService: DBService) {}

  // ─── Jobs ──────────────────────────────────────────────────────────────

  async createJob(data: typeof jobs.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(jobs)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create job');
    return row;
  }

  async findJobById(id: string) {
    const [row] = await this.dbService.db
      .select()
      .from(jobs)
      .where(eq(jobs.id, id));
    return row ?? null;
  }

  async updateJobStatus(id: string, status: string) {
    const setValues: Record<string, unknown> = { status };
    if (status === 'running') {
      setValues['startedAt'] = sql`now()`;
    }
    if (['success', 'failed', 'escalated', 'superseded', 'budget_exceeded'].includes(status)) {
      setValues['completedAt'] = sql`now()`;
    }
    const [row] = await this.dbService.db
      .update(jobs)
      .set(setValues as Partial<typeof jobs.$inferInsert>)
      .where(eq(jobs.id, id))
      .returning();
    return row ?? null;
  }

  async updateJobTokens(id: string, tokensUsed: number) {
    const [row] = await this.dbService.db
      .update(jobs)
      .set({
        totalTokensUsed: sql`${jobs.totalTokensUsed} + ${tokensUsed}`,
      })
      .where(eq(jobs.id, id))
      .returning();
    return row ?? null;
  }

  /**
   * Loophole 4 fix: Check if a job has exceeded its per-job token budget.
   * Must be called BEFORE each LLM call in the LangGraph pipeline to
   * prevent runaway token consumption mid-graph.
   *
   * Returns { exceeded: true, used, budget } if over budget.
   */
  async isTokenBudgetExceeded(id: string): Promise<{
    exceeded: boolean;
    used: number;
    budget: number;
    remaining: number;
  }> {
    const [row] = await this.dbService.db
      .select({
        totalTokensUsed: jobs.totalTokensUsed,
        tokenBudget: jobs.tokenBudget,
      })
      .from(jobs)
      .where(eq(jobs.id, id));

    if (!row) {
      return { exceeded: true, used: 0, budget: 0, remaining: 0 };
    }

    const used = row.totalTokensUsed;
    const budget = row.tokenBudget;
    const remaining = Math.max(0, budget - used);

    return {
      exceeded: used >= budget,
      used,
      budget,
      remaining,
    };
  }

  async findActiveJobByFailure(failureId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.failureId, failureId),
          sql`${jobs.status} IN ('queued', 'running')`,
        ),
      );
    return row ?? null;
  }

  /**
   * EC-40: Find active jobs for a given repository and branch.
   * Used to supersede running jobs when a new push arrives.
   */
  async findActiveJobsByRepoBranch(repositoryId: string, branchName: string) {
    // Join through failures → pipeline_runs → commits → branches to find
    // active jobs on a specific repo/branch combination
    return this.dbService.db
      .select({ id: jobs.id, status: jobs.status })
      .from(jobs)
      .innerJoin(failures, eq(jobs.failureId, failures.id))
      .innerJoin(pipelineRuns, eq(failures.pipelineRunId, pipelineRuns.id))
      .innerJoin(commits, eq(pipelineRuns.commitId, commits.id))
      .innerJoin(branches, eq(commits.branchId, branches.id))
      .where(
        and(
          eq(branches.repositoryId, repositoryId),
          eq(branches.name, branchName),
          sql`${jobs.status} IN ('queued', 'running')`,
        ),
      );
  }

  async findJobsByFailure(failureId: string) {
    return this.dbService.db
      .select()
      .from(jobs)
      .where(eq(jobs.failureId, failureId))
      .orderBy(desc(jobs.createdAt));
  }

  async findOrphanedRunningJobs(olderThanMinutes: number) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    return this.dbService.db
      .select({ id: jobs.id, failureId: jobs.failureId, status: jobs.status, startedAt: jobs.startedAt })
      .from(jobs)
      .where(and(eq(jobs.status, 'running'), lt(jobs.startedAt, cutoff)));
  }

  async findRecentJobs(limit: number) {
    return this.dbService.db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
  }

  // ─── Attempts ──────────────────────────────────────────────────────────

  async createAttempt(data: typeof attempts.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(attempts)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create attempt');
    return row;
  }

  async findAttemptsByJob(jobId: string) {
    return this.dbService.db
      .select()
      .from(attempts)
      .where(eq(attempts.jobId, jobId))
      .orderBy(attempts.attemptNumber);
  }

  async hasCircularFix(jobId: string, fixFingerprint: string): Promise<boolean> {
    const [row] = await this.dbService.db
      .select({ count: sql<number>`count(*)::int` })
      .from(attempts)
      .where(
        and(
          eq(attempts.jobId, jobId),
          eq(attempts.fixFingerprint, fixFingerprint),
        ),
      );
    return (row?.count ?? 0) > 0;
  }

  // ─── Patches ───────────────────────────────────────────────────────────

  async createPatch(data: typeof patches.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(patches)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create patch');
    return row;
  }

  async findPatchByAttempt(attemptId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(patches)
      .where(eq(patches.attemptId, attemptId));
    return row ?? null;
  }

  // ─── Validations ──────────────────────────────────────────────────────

  async createValidation(data: typeof validations.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(validations)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async findValidationsByAttempt(attemptId: string) {
    return this.dbService.db
      .select()
      .from(validations)
      .where(eq(validations.attemptId, attemptId));
  }
}
