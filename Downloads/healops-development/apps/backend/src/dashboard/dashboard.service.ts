// ─── Dashboard Service ──────────────────────────────────────────────────────
// Aggregates repair metrics, trends, recent jobs, and cost breakdowns
// for the HealOps dashboard.

import { Injectable, Logger } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { DashboardRepository } from '@db/repositories/healops/dashboard.repository';
import { jobs } from '@db/schema/agent';
import { failures } from '@db/schema/analysis';
import { pipelineRuns } from '@db/schema/ingestion';
import { repositories } from '@db/schema/platform';
import { costTracking } from '@db/schema/operations';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';

// Estimated developer time saved per successful fix (in minutes)
const DEVELOPER_TIME_SAVED_MINUTES = 30;
// Average developer hourly rate for cost savings calculation
const DEVELOPER_HOURLY_RATE_USD = 75;

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
  repository: string;
  branch: string;
  commitSha: string;
  status: string;
  failureType: string | null;
  confidence: number | null;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  attempts: number;
  prUrl: string | null;
}

export interface RepoHealthEntry {
  id: string;
  name: string;
  fullName: string;
  status: 'healthy' | 'degraded' | 'failing';
  lastFixAt: string | null;
  totalFixes: number;
  successRate: number;
  openIssues: number;
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

    // Calculate the previous period of equal length for trend comparison
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
        .innerJoin(failures, eq(jobs.failureId, failures.id))
        .innerJoin(pipelineRuns, eq(failures.pipelineRunId, pipelineRuns.id))
        .innerJoin(
          repositories,
          sql`${pipelineRuns.commitId} IN (
            SELECT c.id FROM commits c
            INNER JOIN branches b ON c.branch_id = b.id
            WHERE b.repository_id = ${repositories.id}
          )`,
        )
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
        `Failed to compute metrics for period ${startDate}-${endDate}: ${(error as Error).message}`,
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

      const repoJoin = sql`${pipelineRuns.commitId} IN (
        SELECT c.id FROM commits c
        INNER JOIN branches b ON c.branch_id = b.id
        WHERE b.repository_id = ${repositories.id}
      )`;

      const [dataRows, countResult] = await Promise.all([
        this.dbService.db
          .select({
            id: jobs.id,
            status: jobs.status,
            repository: repositories.name,
            branch: sql<string>`(
              SELECT b.name FROM commits c
              INNER JOIN branches b ON c.branch_id = b.id
              WHERE c.id = ${pipelineRuns.commitId}
              LIMIT 1
            )`,
            commitSha: sql<string>`(
              SELECT c.sha FROM commits c
              WHERE c.id = ${pipelineRuns.commitId}
              LIMIT 1
            )`,
            failureType: jobs.classifiedFailureType,
            confidence: jobs.confidence,
            startedAt: jobs.startedAt,
            completedAt: jobs.completedAt,
            durationMs: sql<number>`EXTRACT(EPOCH FROM (${jobs.completedAt} - ${jobs.startedAt})) * 1000`,
            attempts: jobs.currentRetry,
          })
          .from(jobs)
          .innerJoin(failures, eq(jobs.failureId, failures.id))
          .innerJoin(pipelineRuns, eq(failures.pipelineRunId, pipelineRuns.id))
          .innerJoin(repositories, repoJoin)
          .where(whereClause)
          .orderBy(desc(jobs.createdAt))
          .limit(limit)
          .offset(offset),
        this.dbService.db
          .select({ total: sql<number>`count(*)::int` })
          .from(jobs)
          .innerJoin(failures, eq(jobs.failureId, failures.id))
          .innerJoin(pipelineRuns, eq(failures.pipelineRunId, pipelineRuns.id))
          .innerJoin(repositories, repoJoin)
          .where(whereClause),
      ]);

      const totalRow = countResult[0];
      const total = totalRow?.total ?? 0;

      return {
        data: dataRows.map((row) => ({
          id: row.id,
          repository: row.repository ?? '',
          branch: row.branch ?? '',
          commitSha: row.commitSha ?? '',
          status: row.status,
          failureType: row.failureType,
          confidence: row.confidence,
          startedAt: row.startedAt?.toISOString() ?? null,
          completedAt: row.completedAt?.toISOString() ?? null,
          duration: row.durationMs ? Math.round(row.durationMs) : null,
          attempts: row.attempts ?? 0,
          prUrl: null,
        })),
        total,
      };
    } catch (error) {
      this.logger.error(`Failed to get recent jobs: ${(error as Error).message}`);
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
        .innerJoin(failures, eq(jobs.failureId, failures.id))
        .innerJoin(pipelineRuns, eq(failures.pipelineRunId, pipelineRuns.id))
        .innerJoin(
          repositories,
          sql`${pipelineRuns.commitId} IN (
            SELECT c.id FROM commits c
            INNER JOIN branches b ON c.branch_id = b.id
            WHERE b.repository_id = ${repositories.id}
          )`,
        )
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
      this.logger.error(`Failed to get trends: ${(error as Error).message}`);
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
      this.logger.error(`Failed to get cost breakdown: ${(error as Error).message}`);
      return [];
    }
  }

  async getRepoHealth(organizationId: string): Promise<RepoHealthEntry[]> {
    try {
      const rows = await this.dbService.db
        .select({
          id: repositories.id,
          name: repositories.name,
          totalJobs: sql<number>`count(${jobs.id})::int`,
          successCount: sql<number>`count(${jobs.id}) FILTER (WHERE ${jobs.status} = 'success')::int`,
          openIssues: sql<number>`count(${jobs.id}) FILTER (WHERE ${jobs.status} IN ('queued', 'running', 'failed'))::int`,
          lastFixAt: sql<string>`max(${jobs.completedAt}) FILTER (WHERE ${jobs.status} = 'success')`,
        })
        .from(repositories)
        .leftJoin(
          pipelineRuns,
          sql`${pipelineRuns.commitId} IN (
            SELECT c.id FROM commits c
            INNER JOIN branches b ON c.branch_id = b.id
            WHERE b.repository_id = ${repositories.id}
          )`,
        )
        .leftJoin(failures, eq(failures.pipelineRunId, pipelineRuns.id))
        .leftJoin(jobs, eq(jobs.failureId, failures.id))
        .where(eq(repositories.organizationId, organizationId))
        .groupBy(repositories.id, repositories.name);

      return rows.map((row) => {
        const total = row.totalJobs ?? 0;
        const success = row.successCount ?? 0;
        const rate = total > 0 ? (success / total) * 100 : 100;
        const shortName = row.name.includes('/') ? row.name.split('/').pop()! : row.name;
        return {
          id: row.id,
          name: shortName,
          fullName: row.name,
          status: (rate >= 80 ? 'healthy' : rate >= 50 ? 'degraded' : 'failing') as RepoHealthEntry['status'],
          lastFixAt: row.lastFixAt ?? null,
          totalFixes: success,
          successRate: Math.round(rate * 100) / 100,
          openIssues: row.openIssues ?? 0,
        };
      });
    } catch (error) {
      this.logger.error(`Failed to get repo health: ${(error as Error).message}`);
      return [];
    }
  }
}
