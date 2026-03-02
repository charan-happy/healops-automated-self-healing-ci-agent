import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '@bg/constants/job.constant';
import { GithubWebhookModule } from '../../../github-webhook/github-webhook.module';
import { WebhookIngestQueueProcessor } from './webhook-ingest-queue.processor';
import { WebhookIngestQueueService } from './webhook-ingest-queue.service';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.HEALOPS_WEBHOOK_INGEST }),
    forwardRef(() => GithubWebhookModule),
    DeadLetterQueueModule,
  ],
  providers: [WebhookIngestQueueProcessor, WebhookIngestQueueService],
  exports: [WebhookIngestQueueService],
})
export class WebhookIngestQueueModule {}
