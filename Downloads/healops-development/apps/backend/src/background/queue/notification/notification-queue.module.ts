import { Module } from '@nestjs/common';
import { NotificationProcessor } from '@notification-queue/notification.processor';
import { NotificationQueueService } from '@notification-queue/notification-queue.service';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { NotificationsModule } from '@notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
    DeadLetterQueueModule,
  ],
  providers: [NotificationProcessor, NotificationQueueService],
})
export class NotificationQueueModule {}
