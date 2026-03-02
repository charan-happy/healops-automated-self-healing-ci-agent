// ─── Cost Tracking Service ──────────────────────────────────────────────────
// Budget enforcement, token usage tracking, and cooldown management.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CostTrackingRepository } from '@db/repositories/healops/cost-tracking.repository';
import type { HealOpsConfig } from '@config/healops.config';

export interface RecordUsageInput {
  organizationId: string;
  repositoryId: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CostSummary {
  organizationId: string;
  periodMonth: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalJobs: number;
  totalJobsSucceeded: number;
  totalJobsEscalated: number;
  estimatedCostUsd: string;
  budgetLimitUsd: string;
  budgetExhausted: boolean;
}

@Injectable()
export class CostTrackingService {
  private readonly logger = new Logger(CostTrackingService.name);
  private readonly inputPricePerToken: number;
  private readonly outputPricePerToken: number;

  constructor(
    private readonly costTrackingRepository: CostTrackingRepository,
    private readonly configService: ConfigService,
  ) {
    const healops = this.configService.get<HealOpsConfig>('healops');
    this.inputPricePerToken = healops?.cost.inputPricePerToken ?? 0.000003;
    this.outputPricePerToken = healops?.cost.outputPricePerToken ?? 0.000015;
  }

  /**
   * Check if the organization has remaining budget for a new job.
   */
  async hasBudget(organizationId: string): Promise<boolean> {
    const exhausted = await this.costTrackingRepository.isBudgetExhausted(organizationId);
    return !exhausted;
  }

  /**
   * Record token usage for a job, calculating estimated cost.
   */
  async recordUsage(input: RecordUsageInput): Promise<void> {
    try {
      const periodMonth = new Date().toISOString().slice(0, 7) + '-01';
      const estimatedCost =
        input.inputTokens * this.inputPricePerToken +
        input.outputTokens * this.outputPricePerToken;

      // Update repo-level cost
      await this.costTrackingRepository.upsertMonthlyCost({
        organizationId: input.organizationId,
        repositoryId: input.repositoryId,
        periodMonth,
        totalInputTokens: input.inputTokens,
        totalOutputTokens: input.outputTokens,
        totalJobs: 1,
        estimatedCostUsd: String(estimatedCost),
      });

      // Update org-level aggregate (no repositoryId filter)
      await this.costTrackingRepository.upsertMonthlyCost({
        organizationId: input.organizationId,
        periodMonth,
        totalInputTokens: input.inputTokens,
        totalOutputTokens: input.outputTokens,
        totalJobs: 1,
        estimatedCostUsd: String(estimatedCost),
      });

      this.logger.debug(
        `Recorded usage: ${String(input.inputTokens)} in / ${String(input.outputTokens)} out tokens ($${estimatedCost.toFixed(6)})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to record cost usage (non-fatal): ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Get the current month's cost summary for an organization.
   */
  async getMonthlyUsage(organizationId: string): Promise<CostSummary | null> {
    const row = await this.costTrackingRepository.findCurrentMonthCost(organizationId);
    if (!row) return null;

    return {
      organizationId: row.organizationId,
      periodMonth: row.periodMonth,
      totalInputTokens: row.totalInputTokens ?? 0,
      totalOutputTokens: row.totalOutputTokens ?? 0,
      totalJobs: row.totalJobs ?? 0,
      totalJobsSucceeded: row.totalJobsSucceeded ?? 0,
      totalJobsEscalated: row.totalJobsEscalated ?? 0,
      estimatedCostUsd: row.estimatedCostUsd ?? '0',
      budgetLimitUsd: row.budgetLimitUsd ?? '0',
      budgetExhausted: row.budgetExhausted ?? false,
    };
  }

  /**
   * Check if a branch/failure-type combination is on cooldown.
   */
  async isOnCooldown(
    repositoryId: string,
    branchName: string,
    failureType: string,
  ): Promise<boolean> {
    return this.costTrackingRepository.isOnCooldown(
      repositoryId,
      branchName,
      failureType,
    );
  }
}
