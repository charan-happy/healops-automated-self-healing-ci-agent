import { Injectable, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '@bg/constants/job.constant';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FixRequestQueue } from './fix-request.queue';

@Injectable()
export class FixRequestQueueConfig {
  static getQueueConfig() {
    return BullModule.registerQueue({ name: QueueName.HEALOPS_FIX_REQUEST });
  }

  static getQueueUIConfig() {
    return BullBoardModule.forFeature({
      name: QueueName.HEALOPS_FIX_REQUEST,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: process.env['NODE_ENV'] === 'production' || false,
        displayName: 'HealOps Fix Request Queue',
        description: 'Queue for AI-powered code fix requests (OpenRouter/Claude)',
      },
    });
  }
}

@Module({
  imports: [FixRequestQueueConfig.getQueueConfig(), FixRequestQueueConfig.getQueueUIConfig()],
  providers: [FixRequestQueue],
  exports: [FixRequestQueue],
})
export class FixRequestQueueUIModule {}
