import { CronModule } from '@cron/cron.module';
import { EmailQueueModule } from '@email-queue/email-queue.module';
import { NotificationQueueModule } from '@notification-queue/notification-queue.module';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { WebhookQueueModule } from './queue/webhook/webhook-queue.module';
import { RepairQueueModule } from './queue/repair/repair-queue.module';
import { SlackQueueModule } from './queue/slack/slack-queue.module';
import { WebhookIngestQueueModule } from './queue/webhook-ingest/webhook-ingest-queue.module';
import { FixRequestQueueModule } from './queue/fix-request/fix-request-queue.module';
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_LIST } from '@bg/constants/job.constant';
import { CrashRecoveryService } from './services/crash-recovery.service';

@Module({
  imports: [
    BullModule.registerQueue(...QUEUE_LIST.map(name => ({ name }))),
    EmailQueueModule,
    NotificationQueueModule,
    WebhookQueueModule,
    RepairQueueModule,
    SlackQueueModule,
    WebhookIngestQueueModule,
    FixRequestQueueModule,
    DeadLetterQueueModule,
    CronModule,
  ],
  providers: [CrashRecoveryService],
})
export class BackgroundModule {}
