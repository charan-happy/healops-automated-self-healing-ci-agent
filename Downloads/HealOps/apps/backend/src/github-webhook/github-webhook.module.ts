// ─── GitHub Webhook Module ──────────────────────────────────────────────────
// Inbound GitHub webhook ingestion + HMAC-SHA256 signature verification.
// Handles: POST /healops/webhooks/github, POST /healops/webhooks/validation-complete
//
// Key responsibilities:
// - Verify webhook signatures
// - Insert webhook_events with ON CONFLICT (external_event_id) DO NOTHING
// - Return 200 immediately, process async via 6-check guard chain
// - Route validation workflow results to ValidationCallbackHandler
// - CRITICAL: Check is_healops_branch FIRST to prevent infinite loops

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubWebhookController } from './github-webhook.controller';
import { GithubWebhookService } from './github-webhook.service';
import { ValidationCallbackHandler } from './validation-callback.handler';
import { WebhookRateLimitGuard } from './guards/webhook-rate-limit.guard';
import { GithubModule } from '@github/github.module';
import { RepairJobsModule } from '@repair-jobs/repair-jobs.module';
import { RepairAgentModule } from '@repair-agent/repair-agent.module';
import { CostTrackingModule } from '@cost-tracking/cost-tracking.module';
import { RedisModule } from '@redis/redis.module';
import { WebhookIngestQueueModule } from '@bg/queue/webhook-ingest/webhook-ingest-queue.module';
import { FixRequestApiModule } from '@bg/queue/fix-request/fix-request-api.module';

@Module({
  imports: [
    ConfigModule,
    GithubModule,
    RepairJobsModule,
    RepairAgentModule,
    CostTrackingModule,
    RedisModule,
    forwardRef(() => WebhookIngestQueueModule),
    FixRequestApiModule,
  ],
  controllers: [GithubWebhookController],
  providers: [GithubWebhookService, ValidationCallbackHandler, WebhookRateLimitGuard],
  exports: [GithubWebhookService],
})
export class GithubWebhookModule {}
