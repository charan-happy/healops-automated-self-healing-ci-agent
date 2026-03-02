import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { RouteNames } from '@common/route-names';
import { QUEUE_LIST } from '@bg/constants/job.constant';
import { DeadLetterQueueUIModule } from '@dead-letter-queue/deadletter-queue-ui.module';
import { CronUIModule } from '@cron/cron-ui.module';
import { NotificationQueueUIModule } from '@notification-queue/notification-queue-ui.module';
import { EmailQueueUIModule } from '@email-queue/email-queue-ui.module';
import { WebhookQueueUIModule } from './queue/webhook/webhook-queue-ui.module';
import { RepairQueueUIModule } from './queue/repair/repair-queue-ui.module';
import { SlackQueueUIModule } from './queue/slack/slack-queue-ui.module';
import { WebhookIngestQueueUIModule } from './queue/webhook-ingest/webhook-ingest-queue-ui.module';
import { FixRequestQueueUIModule } from './queue/fix-request/fix-request-queue-ui.module';

@Module({
  imports: [
    BullModule.registerQueue(...QUEUE_LIST.map(name => ({ name }))),
    BullBoardModule.forRoot({
      route: RouteNames.QUEUES_UI,
      adapter: ExpressAdapter,
      boardOptions: {
        uiConfig: {
          boardTitle: 'Queues Monitoring',
        },
      },
    }),
    DeadLetterQueueUIModule,
    CronUIModule,
    NotificationQueueUIModule,
    EmailQueueUIModule,
    WebhookQueueUIModule,
    RepairQueueUIModule,
    SlackQueueUIModule,
    WebhookIngestQueueUIModule,
    FixRequestQueueUIModule,
  ],
  providers: [AddingJobsToQueueManager],
  exports: [AddingJobsToQueueManager],
})
export class QueueUIModule {}
