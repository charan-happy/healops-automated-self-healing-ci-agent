// ─── Cost Tracking Module ───────────────────────────────────────────────────
// Token budget enforcement and cost tracking per organization/repository/month.
// Prevents budget overruns and enforces cooldowns after escalation.

import { Module } from '@nestjs/common';
import { CostTrackingService } from './cost-tracking.service';

@Module({
  providers: [CostTrackingService],
  exports: [CostTrackingService],
})
export class CostTrackingModule {}
