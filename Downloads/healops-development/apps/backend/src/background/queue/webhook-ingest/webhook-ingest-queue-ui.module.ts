import { Injectable, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '@bg/constants/job.constant';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Injectable()
export class WebhookIngestQueueConfig {
  static getQueueConfig() {
    return BullModule.registerQueue({
      name: QueueName.HEALOPS_WEBHOOK_INGEST,
      streams: {
        events: {
          maxLen: 1000,
        },
      },
      defaultJobOptions: {
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days for DLQ routing + debugging
        },
        removeOnComplete: {
          age: 1 * 24 * 3600, // Keep for 1 day
        },
      },
    });
  }

  static getQueueUIConfig() {
    return BullBoardModule.forFeature({
      name: QueueName.HEALOPS_WEBHOOK_INGEST,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: process.env['NODE_ENV'] === 'production' || false,
        displayName: 'HealOps Webhook Ingest Queue',
        description: 'Queue for durable webhook event processing with retry',
      },
    });
  }
}

@Module({
  imports: [WebhookIngestQueueConfig.getQueueConfig(), WebhookIngestQueueConfig.getQueueUIConfig()],
})
export class WebhookIngestQueueUIModule {}
