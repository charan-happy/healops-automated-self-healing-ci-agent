import { Module } from '@nestjs/common';
import { RepairQueueProcessor } from './repair-queue.processor';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { RepairAgentModule } from '../../../repair-agent/repair-agent.module';

@Module({
  imports: [DeadLetterQueueModule, RepairAgentModule],
  providers: [RepairQueueProcessor],
})
export class RepairQueueModule {}
