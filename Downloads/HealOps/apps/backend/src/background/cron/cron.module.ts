import { CronProcessor } from '@cron/cron.processor';
import { CronService } from '@cron/cron.service';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { StalePrCleanupService } from './stale-pr-cleanup.service';
import { VectorMemoryModule } from '../../vector-memory/vector-memory.module';
import { GithubModule } from '../../github/github.module';

@Module({
  imports: [ScheduleModule.forRoot(), DeadLetterQueueModule, VectorMemoryModule, GithubModule],
  providers: [CronProcessor, CronService, StalePrCleanupService],
})
export class CronModule {}
