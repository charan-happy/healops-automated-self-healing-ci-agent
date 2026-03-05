// ─── GitHub Webhook Controller ──────────────────────────────────────────────
// HTTP layer for inbound GitHub webhooks and validation callbacks.
// Returns 200 immediately — async processing via BullMQ.

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { RouteNames } from '@common/route-names';
import { GithubWebhookService } from './github-webhook.service';
import { ValidationCallbackHandler } from './validation-callback.handler';
import { WebhookRateLimitGuard } from './guards/webhook-rate-limit.guard';
import { Request } from 'express';

@Controller({ path: RouteNames.HEALOPS_WEBHOOKS, version: '1' })
@ApiExcludeController()
export class GithubWebhookController {
  constructor(
    private readonly webhookService: GithubWebhookService,
    private readonly validationHandler: ValidationCallbackHandler,
  ) {}

  /**
   * Receives GitHub webhook events (workflow_run failures).
   * Returns 200 immediately — async processing dispatched.
   * GitHub expects response within 10 seconds.
   */
  @Post('github')
  @Public()
  @UseGuards(WebhookRateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async handleGithubWebhook(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Req() req: RawBodyRequest<Request>,
    @Body() body: Record<string, unknown>,
  ) {
    // 1. Validate required headers
    if (!signature) {
      throw new BadRequestException('Missing X-Hub-Signature-256 header');
    }
    if (!deliveryId) {
      throw new BadRequestException('Missing X-GitHub-Delivery header');
    }
    if (!event) {
      throw new BadRequestException('Missing X-GitHub-Event header');
    }

    // 2. Get raw body for HMAC verification
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new BadRequestException('Raw body not available — rawBody must be enabled');
    }

    // 3. Delegate to service (signature verification + idempotent insert + async dispatch)
    await this.webhookService.processGithubWebhook({
      signature,
      event,
      deliveryId,
      rawBody: rawBody.toString('utf8'),
      payload: body,
    });

    return { received: true };
  }

  /**
   * Receives validation workflow completion callbacks from GitHub Actions.
   * Called by healops-validation.yml when a fix branch CI run completes.
   */
  @Post('validation-complete')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleValidationComplete(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    body: {
      branch: string;
      status: string;
      run_id: number;
      conclusion: string;
      sha: string;
    },
  ) {
    // 1. Auth check — Bearer token
    if (!authorization) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    await this.validationHandler.handle({
      authorization,
      branch: body.branch,
      status: body.status,
      runId: body.run_id,
      conclusion: body.conclusion,
      sha: body.sha,
    });

    return { received: true };
  }
}
