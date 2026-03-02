// ─── Repair Jobs Module ─────────────────────────────────────────────────────
// Pre-flight checks: cooldown, budget, flaky skip, active job dedup.
// Dispatches repair tasks to the BullMQ queue (processor lives in BackgroundModule).

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueName } from '@bg/constants/job.constant';
import { RedisModule } from '@redis/redis.module';
import { RepairJobsService } from './repair-jobs.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.HEALOPS_REPAIR }),
    RedisModule,
  ],
  providers: [RepairJobsService],
  exports: [RepairJobsService],
})
export class RepairJobsModule {}
