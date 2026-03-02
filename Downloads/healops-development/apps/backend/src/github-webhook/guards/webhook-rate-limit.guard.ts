// ─── Webhook Rate Limit Guard (EC-42) ───────────────────────────────────────
// Per-installation rate limiting: 1000 requests/minute using Redis INCR+EXPIRE.

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';
import { Request } from 'express';

@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(WebhookRateLimitGuard.name);
  private static readonly MAX_REQUESTS = 1000;
  private static readonly WINDOW_SECONDS = 60;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as Record<string, unknown> | undefined;
    const installation = body?.['installation'] as
      | Record<string, unknown>
      | undefined;
    const installationId = String(installation?.['id'] ?? 'unknown');

    const key = `healops:ratelimit:webhook:${installationId}`;
    const count = await this.redis.incr(key);

    // Set TTL on first request in window
    if (count === 1) {
      await this.redis.expire(key, WebhookRateLimitGuard.WINDOW_SECONDS);
    }

    if (count > WebhookRateLimitGuard.MAX_REQUESTS) {
      this.logger.warn(
        `Rate limit exceeded for installation ${installationId}: ${String(count)} req/min`,
      );
      throw new HttpException(
        'Webhook rate limit exceeded — try again later',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
