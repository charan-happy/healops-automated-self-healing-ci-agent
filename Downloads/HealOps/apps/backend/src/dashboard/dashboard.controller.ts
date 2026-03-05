// ─── Dashboard Controller ───────────────────────────────────────────────────
// Exposes aggregate repair metrics, recent jobs, trends, and cost breakdowns
// for the HealOps dashboard UI.

import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { DashboardService } from './dashboard.service';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import { RecentJobsQueryDto } from './dto/recent-jobs-query.dto';
import { TrendsQueryDto } from './dto/trends-query.dto';
import { CostBreakdownQueryDto } from './dto/cost-breakdown-query.dto';

@Controller({ path: RouteNames.HEALOPS_DASHBOARD, version: '1' })
@ApiTags('Dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Aggregate repair metrics' })
  @ApiResponse({
    status: 200,
    description:
      'Returns MTTR, success rate, total fixes, cost savings, and trend percentages',
  })
  async getMetrics(
    @Query() query: MetricsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const organizationId = query.organizationId ?? user.id;
    const dateRange =
      query.startDate || query.endDate
        ? {
            ...(query.startDate !== undefined ? { startDate: query.startDate } : {}),
            ...(query.endDate !== undefined ? { endDate: query.endDate } : {}),
          }
        : undefined;
    return this.dashboardService.getMetrics(organizationId, dateRange);
  }

  @Get('recent-jobs')
  @ApiOperation({ summary: 'Recent repair jobs' })
  @ApiResponse({
    status: 200,
    description:
      'Returns a paginated list of jobs with status, repo name, error type, and PR link',
  })
  async getRecentJobs(
    @Query() query: RecentJobsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const organizationId = query.organizationId ?? user.id;
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    return this.dashboardService.getRecentJobs(
      organizationId,
      limit,
      offset,
      query.status,
    );
  }

  @Get('trends')
  @ApiOperation({ summary: 'Time-series trend data' })
  @ApiResponse({
    status: 200,
    description:
      'Returns an array of daily data points with fixes, success rate, and failures',
  })
  async getTrends(
    @Query() query: TrendsQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const organizationId = query.organizationId ?? user.id;
    const period = query.period ?? '30d';
    return this.dashboardService.getTrends(organizationId, period);
  }

  @Get('cost-breakdown')
  @ApiOperation({ summary: 'Per-repo cost breakdown' })
  @ApiResponse({
    status: 200,
    description:
      'Returns an array of per-repo cost data with total jobs, success rate, tokens, and estimated cost',
  })
  async getCostBreakdown(
    @Query() query: CostBreakdownQueryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const organizationId = query.organizationId ?? user.id;
    return this.dashboardService.getCostBreakdown(organizationId);
  }
}
