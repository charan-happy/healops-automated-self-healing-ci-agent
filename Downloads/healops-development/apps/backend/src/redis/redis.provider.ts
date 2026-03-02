import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, RedisOptions } from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_PUBLISHER = 'REDIS_PUBLISHER';

const logger = new Logger('RedisProvider');

function buildRedisConfig(configService: ConfigService): RedisOptions {
  const redisHost = configService.get<string>('REDIS_HOST');
  const redisPort = configService.get<number>('REDIS_PORT');
  const redisPassword = configService.get<string>('REDIS_PASSWORD');
  const redisTlsEnabled = configService.get<boolean>('REDIS_TLS_ENABLED');

  const config: RedisOptions = {
    host: redisHost ?? 'localhost',
    port: redisPort ?? 6379,
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
    retryStrategy: (times: number) => {
      if (times > 10) return null; // stop retrying after 10 attempts
      return Math.min(times * 200, 5000);
    },
  };

  if (redisPassword) {
    config.password = redisPassword;
  }

  if (redisTlsEnabled) {
    config.tls = {};
  }

  return config;
}

function createRedisClient(configService: ConfigService, name: string): Redis {
  const client = new Redis(buildRedisConfig(configService));

  client.on('error', (err: Error) => {
    logger.error(`Redis ${name} error: ${err.message}`);
  });

  client.on('connect', () => {
    logger.log(`Redis ${name} connected`);
  });

  return client;
}

export const RedisProvider = {
  provide: REDIS_CLIENT,
  useFactory: (configService: ConfigService) =>
    createRedisClient(configService, 'client'),
  inject: [ConfigService],
};

/**
 * Dedicated Redis connection for pub/sub publishing.
 * Redis requires separate connections for subscribe mode,
 * so we provide a dedicated publisher client.
 */
export const RedisPublisherProvider = {
  provide: REDIS_PUBLISHER,
  useFactory: (configService: ConfigService) =>
    createRedisClient(configService, 'publisher'),
  inject: [ConfigService],
};
