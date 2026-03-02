import { Module } from '@nestjs/common';
import { QueueName } from '@bg/constants/job.constant';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Module({
  imports: [
    BullBoardModule.forFeature({
      name: QueueName.DEAD_LETTER,
      adapter: BullMQAdapter,
      options: {
        readOnlyMode: process.env['NODE_ENV'] === 'production' || false,
        displayName: 'Dead Letter Queue',
        description: 'Queue for failed jobs from other queues',
      },
    }),
  ],
})
export class DeadLetterQueueUIModule {}
