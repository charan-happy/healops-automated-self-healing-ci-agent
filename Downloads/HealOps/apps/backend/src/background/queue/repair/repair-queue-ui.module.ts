import { Injectable, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '@bg/constants/job.constant';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Injectable()
export class RepairQueueConfig {
  static getQueueConfig() {
    return BullModule.registerQueue({
      name: QueueName.HEALOPS_REPAIR,
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
      name: QueueName.HEALOPS_REPAIR,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: process.env['NODE_ENV'] === 'production' || false,
        displayName: 'HealOps Repair Queue',
        description: 'Queue for self-healing CI repair jobs',
      },
    });
  }
}

@Module({
  imports: [RepairQueueConfig.getQueueConfig(), RepairQueueConfig.getQueueUIConfig()],
})
export class RepairQueueUIModule {}
