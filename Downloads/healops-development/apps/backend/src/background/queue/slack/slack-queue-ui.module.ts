import { Injectable, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '@bg/constants/job.constant';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Injectable()
export class SlackQueueConfig {
  static getQueueConfig() {
    return BullModule.registerQueue({
      name: QueueName.HEALOPS_SLACK,
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
      name: QueueName.HEALOPS_SLACK,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: process.env['NODE_ENV'] === 'production' || false,
        displayName: 'HealOps Slack Queue',
        description: 'Queue for Slack notifications with retry',
      },
    });
  }
}

@Module({
  imports: [SlackQueueConfig.getQueueConfig(), SlackQueueConfig.getQueueUIConfig()],
})
export class SlackQueueUIModule {}
