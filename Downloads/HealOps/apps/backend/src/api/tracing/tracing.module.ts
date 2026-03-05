import { Module } from '@nestjs/common';
import { TracingController } from './tracing.controller';
import { OtelModule } from '@otel/otel.module';

@Module({
  imports: [OtelModule],
  controllers: [TracingController],
  providers: [],
})
export class TracingModule {}
