import { Injectable, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '@bg/constants/job.constant';
import { WebhookQueueEvents } from './webhook-queue.events';
import { WebhookQueue } from './webhook.queue';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Injectable()
export class WebhookQueueConfig {
  static getQueueConfig() {
    return BullModule.registerQueue({
      name: QueueName.WEBHOOK,
      streams: {
        events: {
          maxLen: 1000,
        },
      },
      defaultJobOptions: {
        removeOnFail: true,
        removeOnComplete: {
          age: 1 * 24 * 3600, // Keep for 1 day
        },
      },
    });
  }

  static getQueueUIConfig() {
    return BullBoardModule.forFeature({
      name: QueueName.WEBHOOK,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: process.env['NODE_ENV'] === 'production' || false,
        displayName: 'Webhook Delivery Queue',
        description: 'Queue for delivering outbound webhooks',
      },
    });
  }
}

@Module({
  imports: [WebhookQueueConfig.getQueueConfig(), WebhookQueueConfig.getQueueUIConfig()],
  providers: [WebhookQueueEvents, WebhookQueue],
  exports: [WebhookQueue],
})
export class WebhookQueueUIModule {}
