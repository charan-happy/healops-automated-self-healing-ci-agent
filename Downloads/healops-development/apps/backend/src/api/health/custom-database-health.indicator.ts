import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { DBService } from '@db/db.service';

@Injectable()
export class CustomDatabaseHealthIndicator extends HealthIndicator {
  constructor(private readonly dbService: DBService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const isHealthy = await this.dbService.isHealthy();

      if (isHealthy) {
        return this.getStatus(key, true, {
          message: 'Database connection is healthy',
          status: 'connected',
        });
      }

      return this.getStatus(key, false, {
        message: 'Database health check failed',
        status: 'disconnected',
      });
    } catch (error) {
      return this.getStatus(key, false, {
        message: 'Database connection failed',
        error: (error as Error).message,
        status: 'disconnected',
      });
    }
  }
}
