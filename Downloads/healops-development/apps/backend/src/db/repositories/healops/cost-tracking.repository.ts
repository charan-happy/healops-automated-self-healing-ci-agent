// ─── Cost Tracking Repository ───────────────────────────────────────────────
// Data access for: cost_tracking, job_cooldowns

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { costTracking, jobCooldowns } from '../../schema/operations';
import { eq, and, sql } from 'drizzle-orm';

@Injectable()
export class CostTrackingRepository {
  constructor(private readonly dbService: DBService) {}

  // ─── Cost Tracking ────────────────────────────────────────────────────

  async upsertMonthlyCost(data: typeof costTracking.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(costTracking)
      .values(data)
      .onConflictDoUpdate({
        target: [
          costTracking.organizationId,
          costTracking.repositoryId,
          costTracking.periodMonth,
        ],
        set: {
          totalInputTokens: sql`${costTracking.totalInputTokens} + ${data.totalInputTokens ?? 0}`,
          totalOutputTokens: sql`${costTracking.totalOutputTokens} + ${data.totalOutputTokens ?? 0}`,
          totalJobs: sql`${costTracking.totalJobs} + 1`,
          estimatedCostUsd: sql`${costTracking.estimatedCostUsd}::numeric + ${data.estimatedCostUsd ?? '0'}::numeric`,
          budgetExhausted: sql`CASE WHEN ${costTracking.budgetLimitUsd} IS NOT NULL AND (${costTracking.estimatedCostUsd}::numeric + ${data.estimatedCostUsd ?? '0'}::numeric) >= ${costTracking.budgetLimitUsd}::numeric THEN true ELSE ${costTracking.budgetExhausted} END`,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return row ?? null;
  }

  async incrementSuccessCount(organizationId: string, repositoryId: string | null, periodMonth: string) {
    const conditions = [
      eq(costTracking.organizationId, organizationId),
      eq(costTracking.periodMonth, periodMonth),
    ];
    if (repositoryId) {
      conditions.push(eq(costTracking.repositoryId, repositoryId));
    }
    const [row] = await this.dbService.db
      .update(costTracking)
      .set({
        totalJobsSucceeded: sql`${costTracking.totalJobsSucceeded} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(...conditions))
      .returning();
    return row ?? null;
  }

  async incrementEscalatedCount(organizationId: string, repositoryId: string | null, periodMonth: string) {
    const conditions = [
      eq(costTracking.organizationId, organizationId),
      eq(costTracking.periodMonth, periodMonth),
    ];
    if (repositoryId) {
      conditions.push(eq(costTracking.repositoryId, repositoryId));
    }
    const [row] = await this.dbService.db
      .update(costTracking)
      .set({
        totalJobsEscalated: sql`${costTracking.totalJobsEscalated} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(...conditions))
      .returning();
    return row ?? null;
  }

  async findCurrentMonthCost(organizationId: string, repositoryId?: string) {
    const periodMonth = new Date().toISOString().slice(0, 7) + '-01';
    const conditions = [
      eq(costTracking.organizationId, organizationId),
      eq(costTracking.periodMonth, periodMonth),
    ];
    if (repositoryId) {
      conditions.push(eq(costTracking.repositoryId, repositoryId));
    }
    const [row] = await this.dbService.db
      .select()
      .from(costTracking)
      .where(and(...conditions));
    return row ?? null;
  }

  async isBudgetExhausted(organizationId: string): Promise<boolean> {
    const periodMonth = new Date().toISOString().slice(0, 7) + '-01';
    const [row] = await this.dbService.db
      .select()
      .from(costTracking)
      .where(
        and(
          eq(costTracking.organizationId, organizationId),
          eq(costTracking.periodMonth, periodMonth),
          eq(costTracking.budgetExhausted, true),
        ),
      )
      .limit(1);
    return !!row;
  }

  // ─── Job Cooldowns ────────────────────────────────────────────────────

  async createCooldown(data: typeof jobCooldowns.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(jobCooldowns)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create cooldown');
    return row;
  }

  async isOnCooldown(
    repositoryId: string,
    branchName: string,
    failureType: string,
  ): Promise<boolean> {
    const [row] = await this.dbService.db
      .select()
      .from(jobCooldowns)
      .where(
        and(
          eq(jobCooldowns.repositoryId, repositoryId),
          eq(jobCooldowns.branchName, branchName),
          eq(jobCooldowns.failureType, failureType),
          sql`${jobCooldowns.cooldownUntil} > now()`,
        ),
      )
      .limit(1);
    return !!row;
  }

  async deleteExpiredCooldowns() {
    return this.dbService.db
      .delete(jobCooldowns)
      .where(sql`${jobCooldowns.cooldownUntil} < now()`);
  }
}
