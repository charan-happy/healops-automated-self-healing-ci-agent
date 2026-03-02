import { Module } from '@nestjs/common';
import { PipelineStatusController } from './pipeline-status.controller';
import { PipelineStatusService } from './pipeline-status.service';

@Module({
  controllers: [PipelineStatusController],
  providers: [PipelineStatusService],
})
export class PipelineStatusModule {}
