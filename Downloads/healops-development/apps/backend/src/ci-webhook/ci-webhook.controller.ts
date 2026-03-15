// ─── CI Webhook Controller ──────────────────────────────────────────────────
// Unified webhook controller for all CI providers (GitHub, GitLab, Jenkins).
// Returns 200 immediately — async processing via BullMQ.
// Each endpoint: verify signature -> parse payload -> dispatch.

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { RouteNames } from '@common/route-names';
import { CiProviderFactory } from '../ci-provider/ci-provider.factory';
import { CiWebhookService } from './ci-webhook.service';
import { WebhookRateLimitGuard } from '../github-webhook/guards/webhook-rate-limit.guard';

@Controller({ path: RouteNames.HEALOPS_WEBHOOKS, version: '1' })
@ApiExcludeController()
export class CiWebhookController {
  private readonly logger = new Logger(CiWebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ciProviderFactory: CiProviderFactory,
    private readonly ciWebhookService: CiWebhookService,
  ) {}

  // ─── GitHub ──────────────────────────────────────────────────────────────

  /**
   * POST /v1/healops/webhooks/ci/github
   * Receives GitHub webhook events (workflow_run, check_run, push).
   * Uses the new multi-CI provider abstraction layer.
   */
  @Post('ci/github')
  @Public()
  @UseGuards(WebhookRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async handleGitHub(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: Record<string, unknown>,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing X-Hub-Signature-256 header');
    }
    if (!deliveryId) {
      throw new BadRequestException('Missing X-GitHub-Delivery header');
    }
    if (!event) {
      throw new BadRequestException('Missing X-GitHub-Event header');
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available — rawBody must be enabled');
    }

    // 1. Verify signature
    const provider = this.ciProviderFactory.getProvider('github');
    const secret = this.configService.get<string>('GITHUB_WEBHOOK_SECRET') ?? '';
    if (!secret) {
      this.logger.error('GITHUB_WEBHOOK_SECRET is not configured — webhook signature cannot be verified');
      throw new UnauthorizedException('Webhook secret not configured');
    }
    if (!provider.verifyWebhookSignature(rawBody.toString('utf8'), signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 2. Parse payload
    const parsed = provider.parseWebhookPayload(event, body);
    if (!parsed) {
      this.logger.debug(`Ignoring GitHub event type: ${event}`);
      return { received: true, ignored: true };
    }

    // 3. Dispatch
    await this.ciWebhookService.processWebhook({
      provider: 'github',
      deliveryId,
      payload: parsed,
      rawPayload: body,
    });

    return { received: true };
  }

  // ─── GitLab ──────────────────────────────────────────────────────────────

  /**
   * POST /v1/healops/webhooks/ci/gitlab
   * Receives GitLab webhook events (Pipeline Hook, Push Hook).
   */
  @Post('ci/gitlab')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleGitLab(
    @Headers('x-gitlab-token') token: string | undefined,
    @Headers('x-gitlab-event') event: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    if (!token) {
      throw new BadRequestException('Missing X-Gitlab-Token header');
    }

    const eventType = event ?? String(body['object_kind'] ?? 'unknown');

    // Generate a delivery ID from the payload (GitLab doesn't provide one)
    const objectAttributes = body['object_attributes'] as Record<string, unknown> | undefined;
    const deliveryId = `gitlab-${String(objectAttributes?.['id'] ?? body['after'] ?? Date.now())}`;

    // 1. Verify token
    const provider = this.ciProviderFactory.getProvider('gitlab');
    const secret = this.configService.get<string>('GITLAB_WEBHOOK_SECRET') ?? '';
    if (!provider.verifyWebhookSignature('', token, secret)) {
      throw new UnauthorizedException('Invalid webhook token');
    }

    // 2. Parse payload
    const parsed = provider.parseWebhookPayload(eventType, body);
    if (!parsed) {
      this.logger.debug(`Ignoring GitLab event type: ${eventType}`);
      return { received: true, ignored: true };
    }

    // 3. Dispatch
    await this.ciWebhookService.processWebhook({
      provider: 'gitlab',
      deliveryId,
      payload: parsed,
      rawPayload: body,
    });

    return { received: true };
  }

  // ─── Jenkins ─────────────────────────────────────────────────────────────

  /**
   * POST /v1/healops/webhooks/ci/jenkins
   * Receives Jenkins webhook notifications (Notification Plugin / Generic Webhook Trigger).
   */
  @Post('ci/jenkins')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleJenkins(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    // Jenkins can send token in Authorization header or as a query/body param
    const token = authorization?.replace(/^Bearer\s+/i, '')
      ?? String(body['token'] ?? '');

    if (!token) {
      throw new BadRequestException(
        'Missing webhook token (Authorization header or body.token)',
      );
    }

    // Generate a delivery ID from the payload
    const build = body['build'] as Record<string, unknown> | undefined;
    const jobName = String(body['name'] ?? body['job_name'] ?? 'unknown');
    const buildNumber = String(build?.['number'] ?? body['build_number'] ?? Date.now());
    const deliveryId = `jenkins-${jobName}-${buildNumber}`;

    // 1. Verify token
    const provider = this.ciProviderFactory.getProvider('jenkins');
    const secret = this.configService.get<string>('JENKINS_WEBHOOK_SECRET') ?? '';
    if (!provider.verifyWebhookSignature('', token, secret)) {
      throw new UnauthorizedException('Invalid webhook token');
    }

    // 2. Parse payload
    const parsed = provider.parseWebhookPayload('notification', body);
    if (!parsed) {
      this.logger.debug('Ignoring Jenkins event — could not parse payload');
      return { received: true, ignored: true };
    }

    // 3. Dispatch
    await this.ciWebhookService.processWebhook({
      provider: 'jenkins',
      deliveryId,
      payload: parsed,
      rawPayload: body,
    });

    return { received: true };
  }
}
