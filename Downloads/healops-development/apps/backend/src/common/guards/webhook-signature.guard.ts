// ─── Webhook Signature Guard ────────────────────────────────────────────────
// Verifies HMAC-SHA256 signature on incoming GitHub webhooks.
//
// Flow:
// 1. Extract X-Hub-Signature-256 header
// 2. Compute HMAC-SHA256 of raw body using webhook_secret
// 3. Timing-safe comparison of computed vs received signature
// 4. Reject with 401 if invalid
//
// The secret is sourced from HEALOPS_WEBHOOK_SECRET env var.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { computeHmacSha256, verifySignature } from '@common/utils/hash';
import { Request } from 'express';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    if (!signature) {
      this.logger.warn('Missing X-Hub-Signature-256 header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const secret = this.configService.get<string>('HEALOPS_WEBHOOK_SECRET') ?? '';
    if (!secret) {
      this.logger.error('HEALOPS_WEBHOOK_SECRET not configured — rejecting webhook');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    // The raw body should be available from a raw body parser middleware
    const rawBody = (request as Request & { rawBody?: string | Buffer }).rawBody;
    if (!rawBody) {
      this.logger.warn('Raw body not available for signature verification');
      throw new UnauthorizedException('Cannot verify webhook signature');
    }

    const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const computed = computeHmacSha256(body, secret);

    if (!verifySignature(computed, signature)) {
      this.logger.warn('Webhook signature verification failed');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
