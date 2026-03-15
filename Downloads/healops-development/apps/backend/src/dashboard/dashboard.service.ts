// ─── Dashboard Service ──────────────────────────────────────────────────────
// Aggregates repair metrics, trends, recent jobs, and cost breakdowns
// for the HealOps dashboard.
//
// Join strategy: jobs → fix_requests (via fixRequestId) → repositories
// (via commitSha match to commits table). The pipeline stores errors in
// fix_requests, NOT in the failures table.

import { Injectable, Logger } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { DashboardRepository } from '@db/repositories/healops/dashboard.repository';
import { jobs } from '@db/schema/agent';
import { fixRequests } from '@db/schema/fix-requests';
import { repositories } from '@db/schema/platform';
import { costTracking } from '@db/schema/operations';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';

// Estimated developer time saved per successful fix (in minutes)
const DEVELOPER_TIME_SAVED_MINUTES = 30;
// Average developer hourly rate for cost savings calculation
const DEVELOPER_HOURLY_RATE_USD = 75;

/**
 * SQL fragment to join fix_requests → commits → branches → repositories
 * by matching fix_requests.commit_sha to commits.commit_sha.
 */
const FIX_REQUEST_TO_REPO_JOIN = sql`${fixRequests.commitSha} IN (
  SELECT c.commit_sha FROM commits c
  INNER JOIN branches b ON c.branch_id = b.id
  WHERE b.repository_id = ${repositories.id}
)`;

export interface MetricsResult {
  mttr: number;
  successRate: number;
  totalFixes: number;
  costSavings: number;
  mttrTrend: number;
  successRateTrend: number;
  totalFixesTrend: number;
  costSavingsTrend: number;
}

export interface RecentJob {
  id: string;
  status: string;
  repoName: string | null;
  errorType: string | null;
  prLink: string | null;
  createdAt: Date | null;
  completedAt: Date | null;
}

export interface TrendDataPoint {
  date: string;
  fixes: number;
  successRate: number;
  failures: number;
}

export interface CostBreakdownEntry {
  repoName: string;
  totalJobs: number;
  successRate: number;
  totalTokens: number;
  estimatedCost: string;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    _dashboardRepository: DashboardRepository,
    private readonly dbService: DBService,
  ) {}

  async getMetrics(
    organizationId: string,
    dateRange?: { startDate?: string; endDate?: string },
  ): Promise<MetricsResult> {
    const now = new Date();
    const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = dateRange?.startDate ?? defaultStartDate.toISOString().slice(0, 10);
    const endDate = dateRange?.endDate ?? now.toISOString().slice(0, 10);

    const start = new Date(startDate);
    const end = new Date(endDate);
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs).toISOString().slice(0, 10);
    const prevEnd = new Date(start.getTime() - 1).toISOString().slice(0, 10);

    const [current, previous] = await Promise.all([
      this.computeMetricsForPeriod(organizationId, startDate, endDate),
      this.computeMetricsForPeriod(organizationId, prevStart, prevEnd),
    ]);

    return {
      mttr: current.mttr,
      successRate: current.successRate,
      totalFixes: current.totalFixes,
      costSavings: current.costSavings,
      mttrTrend: previous.mttr > 0 ? ((current.mttr - previous.mttr) / previous.mttr) * 100 : 0,
      successRateTrend:
        previous.successRate > 0
          ? ((current.successRate - previous.successRate) / previous.successRate) * 100
          : 0,
      totalFixesTrend:
        previous.totalFixes > 0
          ? ((current.totalFixes - previous.totalFixes) / previous.totalFixes) * 100
          : 0,
      costSavingsTrend:
        previous.costSavings > 0
          ? ((current.costSavings - previous.costSavings) / previous.costSavings) * 100
          : 0,
    };
  }

  private async computeMetricsForPeriod(
    organizationId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ mttr: number; successRate: number; totalFixes: number; costSavings: number }> {
    try {
      const [row] = await this.dbService.db
        .select({
          totalJobs: sql<number>`count(*)::int`,
          succeededJobs: sql<number>`count(*) FILTER (WHERE ${jobs.status} = 'success')::int`,
          failedJobs: sql<number>`count(*) FILTER (WHERE ${jobs.status} = 'failed')::int`,
          avgFixTimeMs: sql<number>`avg(EXTRACT(EPOCH FROM (${jobs.completedAt} - ${jobs.startedAt})) * 1000) FILTER (WHERE ${jobs.status} = 'success' AND ${jobs.completedAt} IS NOT NULL AND ${jobs.startedAt} IS NOT NULL)`,
        })
        .from(jobs)
        .innerJoin(fixRequests, eq(jobs.fixRequestId, fixRequests.id))
        .innerJoin(repositories, FIX_REQUEST_TO_REPO_JOIN)
        .where(
          and(
            eq(repositories.organizationId, organizationId),
            gte(jobs.createdAt, new Date(startDate)),
            lte(jobs.createdAt, new Date(endDate)),
          ),
        );

      const totalJobs = row?.totalJobs ?? 0;
      const succeededJobs = row?.succeededJobs ?? 0;
      const avgFixTimeMs = row?.avgFixTimeMs ?? 0;

      const successRate = totalJobs > 0 ? (succeededJobs / totalJobs) * 100 : 0;
      const costSavings =
        succeededJobs * (DEVELOPER_TIME_SAVED_MINUTES / 60) * DEVELOPER_HOURLY_RATE_USD;

      return {
        mttr: Math.round(avgFixTimeMs),
        successRate: Math.round(successRate * 100) / 100,
        totalFixes: succeededJobs,
        costSavings: Math.round(costSavings * 100) / 100,
      };
    } catch (error) {
      this.logger.error(
        `Failed to compute metrics for period ${startDate}-${endDate}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { mttr: 0, successRate: 0, totalFixes: 0, costSavings: 0 };
    }
  }

  async getRecentJobs(
    organizationId: string,
    limit: number,
    offset: number,
    status?: string,
  ): Promise<{ data: RecentJob[]; total: number }> {
    try {
      const conditions = [eq(repositories.organizationId, organizationId)];

      if (status) {
        conditions.push(eq(jobs.status, status));
      }

      const whereClause = and(...conditions);

      const [dataRows, countResult] = await Promise.all([
        this.dbService.db
          .select({
            id: jobs.id,
            status: jobs.status,
            repoName: repositories.name,
            errorType: jobs.classifiedFailureType,
            createdAt: jobs.createdAt,
            completedAt: jobs.completedAt,
          })
          .from(jobs)
          .innerJoin(fixRequests, eq(jobs.fixRequestId, fixRequests.id))
          .innerJoin(repositories, FIX_REQUEST_TO_REPO_JOIN)
          .where(whereClause)
          .orderBy(desc(jobs.createdAt))
          .limit(limit)
          .offset(offset),
        this.dbService.db
          .select({ total: sql<number>`count(*)::int` })
          .from(jobs)
          .innerJoin(fixRequests, eq(jobs.fixRequestId, fixRequests.id))
          .innerJoin(repositories, FIX_REQUEST_TO_REPO_JOIN)
          .where(whereClause),
      ]);

      const totalRow = countResult[0];
      const total = totalRow?.total ?? 0;

      return {
        data: dataRows.map((row) => ({
          id: row.id,
          status: row.status,
          repoName: row.repoName,
          errorType: row.errorType,
          prLink: null,
          createdAt: row.createdAt,
          completedAt: row.completedAt,
        })),
        total,
      };
    } catch (error) {
      this.logger.error(`Failed to get recent jobs: ${error instanceof Error ? error.message : String(error)}`);
      return { data: [], total: 0 };
    }
  }

  async getTrends(
    organizationId: string,
    period: '7d' | '30d' | '90d',
  ): Promise<TrendDataPoint[]> {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
      const rows = await this.dbService.db
        .select({
          date: sql<string>`date_trunc('day', ${jobs.createdAt})::date::text`,
          totalJobs: sql<number>`count(*)::int`,
          succeededJobs: sql<number>`count(*) FILTER (WHERE ${jobs.status} = 'success')::int`,
          failedJobs: sql<number>`count(*) FILTER (WHERE ${jobs.status} = 'failed')::int`,
        })
        .from(jobs)
        .innerJoin(fixRequests, eq(jobs.fixRequestId, fixRequests.id))
        .innerJoin(repositories, FIX_REQUEST_TO_REPO_JOIN)
        .where(
          and(
            eq(repositories.organizationId, organizationId),
            gte(jobs.createdAt, startDate),
          ),
        )
        .groupBy(sql`date_trunc('day', ${jobs.createdAt})::date`)
        .orderBy(sql`date_trunc('day', ${jobs.createdAt})::date`);

      return rows.map((row) => {
        const total = row.totalJobs;
        const succeeded = row.succeededJobs;
        return {
          date: row.date,
          fixes: succeeded,
          successRate: total > 0 ? Math.round((succeeded / total) * 10000) / 100 : 0,
          failures: row.failedJobs,
        };
      });
    } catch (error) {
      this.logger.error(`Failed to get trends: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  async getCostBreakdown(organizationId: string): Promise<CostBreakdownEntry[]> {
    try {
      const periodMonth = new Date().toISOString().slice(0, 7) + '-01';

      const rows = await this.dbService.db
        .select({
          repoName: repositories.name,
          totalJobs: costTracking.totalJobs,
          totalJobsSucceeded: costTracking.totalJobsSucceeded,
          totalInputTokens: costTracking.totalInputTokens,
          totalOutputTokens: costTracking.totalOutputTokens,
          estimatedCostUsd: costTracking.estimatedCostUsd,
        })
        .from(costTracking)
        .innerJoin(repositories, eq(costTracking.repositoryId, repositories.id))
        .where(
          and(
            eq(costTracking.organizationId, organizationId),
            eq(costTracking.periodMonth, periodMonth),
            sql`${costTracking.repositoryId} IS NOT NULL`,
          ),
        );

      return rows.map((row) => {
        const totalJobs = row.totalJobs ?? 0;
        const succeeded = row.totalJobsSucceeded ?? 0;
        return {
          repoName: row.repoName,
          totalJobs,
          successRate: totalJobs > 0 ? Math.round((succeeded / totalJobs) * 10000) / 100 : 0,
          totalTokens: (row.totalInputTokens ?? 0) + (row.totalOutputTokens ?? 0),
          estimatedCost: row.estimatedCostUsd ?? '0',
        };
      });
    } catch (error) {
      this.logger.error(`Failed to get cost breakdown: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  async getRepoHealth(organizationId: string): Promise<Array<{
    repoName: string;
    status: string;
    totalJobs: number;
    successRate: number;
    lastFixAt: string | null;
  }>> {
    try {
      const rows = await this.dbService.db
        .select({
          repoName: repositories.name,
          totalJobs: sql<number>`count(*)::int`,
          succeededJobs: sql<number>`count(*) FILTER (WHERE ${jobs.status} = 'success')::int`,
          lastFixAt: sql<string>`max(${jobs.completedAt})::text`,
        })
        .from(jobs)
        .innerJoin(fixRequests, eq(jobs.fixRequestId, fixRequests.id))
        .innerJoin(repositories, FIX_REQUEST_TO_REPO_JOIN)
        .where(eq(repositories.organizationId, organizationId))
        .groupBy(repositories.name);

      return rows.map((row) => {
        const total = row.totalJobs;
        const succeeded = row.succeededJobs;
        const rate = total > 0 ? Math.round((succeeded / total) * 10000) / 100 : 0;
        return {
          repoName: row.repoName,
          status: rate >= 80 ? 'healthy' : rate >= 50 ? 'degraded' : 'critical',
          totalJobs: total,
          successRate: rate,
          lastFixAt: row.lastFixAt,
        };
      });
    } catch (error) {
      this.logger.error(`Failed to get repo health: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}
