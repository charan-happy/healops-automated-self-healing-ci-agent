import { QueueName } from '@bg/constants/job.constant';
import { EmailQueueEvents } from '@email-queue/email-queue.events';
import { EmailQueue } from '@email-queue/email.queue';
import { BullModule } from '@nestjs/bullmq';
import { Injectable, Module } from '@nestjs/common';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Injectable()
export class EmailQueueConfig {
  static getQueueConfig() {
    return BullModule.registerQueue({
      name: QueueName.EMAIL,
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
      name: QueueName.EMAIL,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: process.env['NODE_ENV'] === 'production' || false,
        displayName: 'Email Queue',
        description: 'Queue for sending emails',
      },
    });
  }
}

@Module({
  imports: [EmailQueueConfig.getQueueConfig(), EmailQueueConfig.getQueueUIConfig()],
  providers: [EmailQueueEvents, EmailQueue],
  exports: [EmailQueue],
})
export class EmailQueueUIModule {}
