// Note: All the common services/modules used by workers
// should be imported here
import { Module } from '@nestjs/common';
import { BackgroundModule } from '@bg/background.module';
import { BullModule } from '@nestjs/bullmq';
import { LoggerModule } from '@logger/logger.module';
import { EnvConfigModule } from '@config/env-config.module';
import { DEFAULT_JOB_OPTIONS, QueuePrefix } from '@bg/constants/job.constant';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { RedisModule } from '@redis/redis.module';
import { DBModule } from '@db/db.module';
import Redis from 'ioredis';

// Queue module
const queueModule = BullModule.forRootAsync({
  imports: [RedisModule],
  useFactory: (redisClient: Redis) => {
    return {
      prefix: QueuePrefix.SYSTEM, // For grouping queues
      connection: redisClient.options,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    };
  },
  inject: [REDIS_CLIENT],
});

@Module({
  imports: [EnvConfigModule, LoggerModule, RedisModule, DBModule, queueModule, BackgroundModule],
})
export class WorkerModule {}
