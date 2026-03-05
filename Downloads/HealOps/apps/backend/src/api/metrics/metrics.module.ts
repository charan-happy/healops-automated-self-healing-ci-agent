import { RouteNames } from '@common/route-names';
import { MetricsController } from '@metrics/metrics.controller';
import { MetricsService } from '@metrics/metrics.service';
import { HealopsMetricsService } from '@metrics/healops-metrics.service';
import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
      path: `${RouteNames.METRICS}`,
    }),
  ],
  providers: [MetricsService, HealopsMetricsService],
  controllers: [MetricsController],
  exports: [MetricsService, HealopsMetricsService],
})
export class MetricsModule {}
