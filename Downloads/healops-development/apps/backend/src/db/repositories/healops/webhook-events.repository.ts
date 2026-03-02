// ─── Webhook Events Repository ──────────────────────────────────────────────
// Data access for: webhook_events, pipeline_runs

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { webhookEvents, pipelineRuns } from '../../schema/ingestion';
import { eq, desc } from 'drizzle-orm';

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
}
