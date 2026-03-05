import { Injectable } from '@nestjs/common';
import { MemoryHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from '@redis/redis.health';
import { CustomHttpHealthIndicator } from './custom-http-health.indicator';
import { CustomDatabaseHealthIndicator } from './custom-database-health.indicator';

@Injectable()
export class HealthService {
  constructor(
    private readonly http: CustomHttpHealthIndicator,
    private readonly database: CustomDatabaseHealthIndicator,
    // private readonly disk: DiskHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator
  ) {}

  async checkHealth(): Promise<any> {
    const results: any = {};
    let overallStatus = 'up';

    // HTTP check
    try {
      const httpResult = await this.http.pingCheck('google', 'https://google.com');
      results.google = httpResult['google'];
    } catch (error) {
      results.google = {
        status: 'down',
        message: 'HTTP check failed',
        error: (error as Error).message,
      };
      overallStatus = 'down';
    }

    // Database check
    try {
      const dbResult = await this.database.isHealthy('database');
      results.database = dbResult['database'];
    } catch (error) {
      results.database = {
        status: 'down',
        message: 'Database check failed',
        error: (error as Error).message,
      };
      overallStatus = 'down';
    }

    // Redis check
    try {
      const redisResult = await this.redisHealth.isHealthy('redis');
      results.redis = redisResult['redis'];
    } catch (error) {
      results.redis = {
        status: 'down',
        message: 'Redis check failed',
        error: (error as Error).message,
      };
      overallStatus = 'down';
    }

    // Memory check
    try {
      const memoryResult = await this.memory.checkHeap('memory_heap', 250 * 1024 * 1024);
      results.memory_heap = memoryResult['memory_heap'];
    } catch (error) {
      results.memory_heap = {
        status: 'down',
        message: 'Memory check failed',
        error: (error as Error).message,
      };
      overallStatus = 'down';
    }

    return {
      status: overallStatus,
      info: results,
      error: overallStatus === 'down' ? 'Some services are down' : undefined,
      details: results,
    };
  }
}
