// API-side module: controller + queue service for adding jobs.
// Imported by AppModule which runs in the API process.

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueName } from '@bg/constants/job.constant';
import { FixRequestController } from './fix-request.controller';
import { FixRequestQueue } from './fix-request.queue';

@Module({
  imports: [BullModule.registerQueue({ name: QueueName.HEALOPS_FIX_REQUEST })],
  controllers: [FixRequestController],
  providers: [FixRequestQueue],
  exports: [FixRequestQueue],
})
export class FixRequestApiModule {}
