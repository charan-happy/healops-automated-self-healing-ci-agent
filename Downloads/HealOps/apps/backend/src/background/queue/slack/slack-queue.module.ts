import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '@bg/constants/job.constant';
import { SlackModule } from '../../../slack/slack.module';
import { SlackQueueProcessor } from './slack-queue.processor';
import { SlackQueueService } from './slack-queue.service';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.HEALOPS_SLACK }),
    SlackModule,
    forwardRef(() => DeadLetterQueueModule),
  ],
  providers: [SlackQueueProcessor, SlackQueueService],
  exports: [SlackQueueService],
})
export class SlackQueueModule {}
