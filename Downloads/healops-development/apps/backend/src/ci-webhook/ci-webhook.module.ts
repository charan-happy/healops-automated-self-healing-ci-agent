// ─── CI Webhook Module ──────────────────────────────────────────────────────
// Unified webhook ingestion for all CI providers (GitHub, GitLab, Jenkins).
// Imports CiProviderModule for provider abstraction.

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CiWebhookController } from './ci-webhook.controller';
import { CiWebhookService } from './ci-webhook.service';
import { ErrorExtractorService } from './error-extractor.service';
import { CiProviderModule } from '../ci-provider/ci-provider.module';
import { CostTrackingModule } from '@cost-tracking/cost-tracking.module';
import { RedisModule } from '@redis/redis.module';
import { WebhookIngestQueueModule } from '@bg/queue/webhook-ingest/webhook-ingest-queue.module';
import { FixRequestApiModule } from '@bg/queue/fix-request/fix-request-api.module';
import { RepairAgentModule } from '../repair-agent/repair-agent.module';

@Module({
  imports: [
    ConfigModule,
    CiProviderModule,
    CostTrackingModule,
    RedisModule,
    RepairAgentModule,
    FixRequestApiModule,
    forwardRef(() => WebhookIngestQueueModule),
  ],
  controllers: [CiWebhookController],
  providers: [CiWebhookService, ErrorExtractorService],
  exports: [CiWebhookService],
})
export class CiWebhookModule {}
