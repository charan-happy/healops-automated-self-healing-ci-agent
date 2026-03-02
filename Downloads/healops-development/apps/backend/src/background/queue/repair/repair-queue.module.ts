import { Module } from '@nestjs/common';
import { RepairQueueProcessor } from './repair-queue.processor';
import { DeadLetterQueueModule } from '@dead-letter-queue/dead-letter-queue.module';
import { RepairAgentModule } from '../../../repair-agent/repair-agent.module';
import { GatewayModule } from '../../../gateway/gateway.module';

@Module({
  imports: [DeadLetterQueueModule, RepairAgentModule, GatewayModule],
  providers: [RepairQueueProcessor],
})
export class RepairQueueModule {}
