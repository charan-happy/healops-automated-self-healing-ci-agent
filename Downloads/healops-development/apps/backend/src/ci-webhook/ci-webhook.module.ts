// ─── CI Webhook Module ──────────────────────────────────────────────────────
// Unified webhook ingestion for all CI providers (GitHub, GitLab, Jenkins).
// Imports CiProviderModule for provider abstraction.

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CiWebhookController } from './ci-webhook.controller';
import { CiWebhookService } from './ci-webhook.service';
import { CiProviderModule } from '../ci-provider/ci-provider.module';
import { CostTrackingModule } from '@cost-tracking/cost-tracking.module';
import { RedisModule } from '@redis/redis.module';
import { WebhookIngestQueueModule } from '@bg/queue/webhook-ingest/webhook-ingest-queue.module';

@Module({
  imports: [
    ConfigModule,
    CiProviderModule,
    CostTrackingModule,
    RedisModule,
    forwardRef(() => WebhookIngestQueueModule),
  ],
  controllers: [CiWebhookController],
  providers: [CiWebhookService],
  exports: [CiWebhookService],
})
export class CiWebhookModule {}
