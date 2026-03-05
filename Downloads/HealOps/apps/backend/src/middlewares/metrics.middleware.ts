import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import { MetricsService } from '@metrics/metrics.service';
import { performance } from 'perf_hooks';
import { isMobileRequest } from '@common/helpers/helpers';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: () => void) {
    const { method, route, originalUrl } = req;
    const urlPath = route?.path || originalUrl; // Use cleaned route if available

    const userAgentRaw =
      req.headers['x-forwarded-user-agent'] ||
      req.headers['user-agent'] ||
      'unknown';
    const refererRaw =
      req.headers['referer'] || req.headers['referrer'] || 'unknown';
    const userAgent = Array.isArray(userAgentRaw)
      ? userAgentRaw[0]
      : userAgentRaw;
    const referer = Array.isArray(refererRaw) ? refererRaw[0] : refererRaw;
    const isMobile = isMobileRequest(req);

    const start = performance.now();
    this.metricsService.incrementHttpRequests();
    this.metricsService.incrementConcurrentRequests();

    res.on('finish', () => {
      const durationSeconds = (performance.now() - start) / 1000; // In seconds
      const status = res.statusCode.toString();

      this.metricsService.decrementConcurrentRequests();

      // ✅ Save all metrics
      this.metricsService.observeRequestDuration(
        method,
        urlPath,
        status,
        durationSeconds,
      );
      this.metricsService.incrementApiRequestCounter(method, urlPath, status);

      if (parseInt(status) >= 400) {
        this.metricsService.incrementApiErrorCounter(method, urlPath, status);
      }

      this.metricsService.incrementUserAgentCounter(userAgent || '');
      this.metricsService.incrementRefererCounter(referer || '');
      this.metricsService.incrementMobileWebReqCounter(isMobile);
    });

    next();
  }
}
