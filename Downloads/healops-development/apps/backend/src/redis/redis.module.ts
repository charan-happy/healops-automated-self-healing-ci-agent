import { Module, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisHealthIndicator } from '@redis/redis.health';
import {
  REDIS_CLIENT,
  REDIS_PUBLISHER,
  RedisProvider,
  RedisPublisherProvider,
} from '@redis/redis.provider';
import { Redis } from 'ioredis';

@Module({
  imports: [ConfigModule],
  providers: [
    RedisProvider,
    RedisPublisherProvider,
    {
      provide: RedisHealthIndicator,
      useFactory: (redisClient: Redis) => new RedisHealthIndicator(redisClient),
      inject: [REDIS_CLIENT],
    },
  ],
  exports: [RedisProvider, RedisPublisherProvider, RedisHealthIndicator],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: Redis,
    @Inject(REDIS_PUBLISHER) private readonly redisPublisher: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redisClient.quit();
      this.logger.log('Redis client disconnected gracefully');
    } catch (err) {
      this.logger.warn(`Redis client disconnect error: ${(err as Error).message}`);
    }

    try {
      await this.redisPublisher.quit();
      this.logger.log('Redis publisher disconnected gracefully');
    } catch (err) {
      this.logger.warn(`Redis publisher disconnect error: ${(err as Error).message}`);
    }
  }
}
