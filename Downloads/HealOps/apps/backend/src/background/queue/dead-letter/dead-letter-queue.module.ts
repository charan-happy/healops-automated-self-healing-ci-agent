import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '@bg/constants/job.constant';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { DeadLetterProcessor } from '@dead-letter-queue/dead-letter.processor';
import { DeadLetterQueueEvents } from '@dead-letter-queue/dead-letter-queue.events';
import { SlackQueueModule } from '../slack/slack-queue.module';
import { MetricsModule } from '@metrics/metrics.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QueueName.DEAD_LETTER,
      streams: {
        events: {
          maxLen: 1000,
        },
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: {
          age: 7 * 24 * 3600, // Keep completed DLQ jobs for 7 days
        },
        removeOnFail: {
          age: 60 * 24 * 3600, // Keep failed DLQ jobs for 60 days
        },
      },
    }),
    forwardRef(() => SlackQueueModule),
    MetricsModule,
  ],
  providers: [DeadLetterQueueService, DeadLetterProcessor, DeadLetterQueueEvents],
  exports: [DeadLetterQueueService],
})
export class DeadLetterQueueModule {}
