import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';

@Injectable()
export class CustomHttpHealthIndicator extends HealthIndicator {
  async pingCheck(key: string, url: string): Promise<HealthIndicatorResult> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        return this.getStatus(key, true, { status: response.status, url });
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      throw new HealthCheckError(
        `${key} check failed`,
        this.getStatus(key, false, {
          error: (error as Error).message,
          url,
        })
      );
    }
  }
}
