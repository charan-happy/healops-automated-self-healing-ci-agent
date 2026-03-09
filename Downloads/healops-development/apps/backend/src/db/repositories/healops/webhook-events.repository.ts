// ─── Webhook Events Repository ──────────────────────────────────────────────
// Data access for: webhook_events, pipeline_runs

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { webhookEvents, pipelineRuns } from '../../schema/ingestion';
import { failures } from '../../schema/analysis';
import { jobs } from '../../schema/agent';
import { pullRequests } from '../../schema/outputs';
import { eq, desc, inArray } from 'drizzle-orm';

@Injectable()
export class WebhookEventsRepository {
  constructor(private readonly dbService: DBService) {}

  // ─── Webhook Events ────────────────────────────────────────────────────

  async createWebhookEvent(data: typeof webhookEvents.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(webhookEvents)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async findWebhookEventByExternalId(externalEventId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalEventId, externalEventId));
    return row ?? null;
  }

  async markProcessed(id: string, errorMessage?: string) {
    const setValues: Record<string, unknown> = { processed: true };
    if (errorMessage !== undefined) {
      setValues['processingError'] = errorMessage;
    }
    const [row] = await this.dbService.db
      .update(webhookEvents)
      .set(setValues as Partial<typeof webhookEvents.$inferInsert>)
      .where(eq(webhookEvents.id, id))
      .returning();
    return row ?? null;
  }

  // ─── Pipeline Runs ─────────────────────────────────────────────────────

  async createPipelineRun(data: typeof pipelineRuns.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(pipelineRuns)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async findPipelineRunByExternalId(externalRunId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.externalRunId, externalRunId));
    return row ?? null;
  }

  async findRecentPipelineRuns(commitId: string, limit: number) {
    return this.dbService.db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.commitId, commitId))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(limit);
  }

  async updatePipelineRunStatus(id: string, status: string) {
    const [row] = await this.dbService.db
      .update(pipelineRuns)
      .set({ status })
      .where(eq(pipelineRuns.id, id))
      .returning();
    return row ?? null;
  }

  async updatePipelineRunAgentBranch(id: string, agentBranch: string) {
    const [row] = await this.dbService.db
      .update(pipelineRuns)
      .set({ agentBranch })
      .where(eq(pipelineRuns.id, id))
      .returning();
    return row ?? null;
  }

  /**
   * Bulk lookup: for a list of externalRunIds, return enrichment data:
   * errorSummary, affectedFile, fix agent status, and PR URL.
   * Joins: pipeline_runs → failures → jobs → pull_requests
   */
  async findPipelineRunEnrichment(
    externalRunIds: string[],
  ): Promise<Map<string, {
    errorSummary: string;
    affectedFile: string | null;
    fixStatus: string | null;
    fixPrUrl: string | null;
  }>> {
    if (externalRunIds.length === 0) return new Map();

    const rows = await this.dbService.db
      .select({
        externalRunId: pipelineRuns.externalRunId,
        errorSummary: failures.errorSummary,
        affectedFile: failures.affectedFile,
        jobStatus: jobs.status,
        prUrl: pullRequests.prUrl,
      })
      .from(pipelineRuns)
      .innerJoin(failures, eq(failures.pipelineRunId, pipelineRuns.id))
      .leftJoin(jobs, eq(jobs.failureId, failures.id))
      .leftJoin(pullRequests, eq(pullRequests.jobId, jobs.id))
      .where(inArray(pipelineRuns.externalRunId, externalRunIds))
      .orderBy(failures.detectedAt);

    const result = new Map<string, {
      errorSummary: string;
      affectedFile: string | null;
      fixStatus: string | null;
      fixPrUrl: string | null;
    }>();

    for (const row of rows) {
      // Keep the first (earliest) failure per pipeline run, but prefer rows with job data
      const existing = result.get(row.externalRunId);
      if (!existing) {
        result.set(row.externalRunId, {
          errorSummary: row.errorSummary,
          affectedFile: row.affectedFile,
          fixStatus: row.jobStatus,
          fixPrUrl: row.prUrl,
        });
      } else if (!existing.fixStatus && row.jobStatus) {
        // Update with fix status if we didn't have one yet
        existing.fixStatus = row.jobStatus;
        existing.fixPrUrl = row.prUrl;
      }
    }
    return result;
  }
}
