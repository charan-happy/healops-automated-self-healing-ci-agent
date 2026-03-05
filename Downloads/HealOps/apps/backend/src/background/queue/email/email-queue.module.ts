import { EmailModule } from '@email/email.module';
import { EmailQueueService } from '@email-queue/email-queue.service';
import { EmailProcessor } from '@email-queue/email.processor';
import { Module } from '@nestjs/common';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';

@Module({
  imports: [
    EmailModule,
    DeadLetterQueueModule,
  ],
  providers: [EmailQueueService, EmailProcessor],
})
export class EmailQueueModule {}
