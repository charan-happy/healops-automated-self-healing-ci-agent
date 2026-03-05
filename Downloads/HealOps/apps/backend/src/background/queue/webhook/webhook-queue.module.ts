import { Module } from '@nestjs/common';
import { WebhookProcessor } from './webhook.processor';
import { WebhookQueueService } from './webhook-queue.service';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';

@Module({
  imports: [
    DeadLetterQueueModule,
  ],
  providers: [WebhookQueueService, WebhookProcessor],
})
export class WebhookQueueModule {}
