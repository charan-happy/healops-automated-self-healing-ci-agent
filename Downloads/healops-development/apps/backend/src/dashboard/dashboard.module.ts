// ─── Dashboard Module ───────────────────────────────────────────────────────
// Aggregate repair metrics, recent jobs, trends, and cost breakdowns
// for the HealOps dashboard UI.

import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
