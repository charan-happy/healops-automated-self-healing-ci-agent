// ─── Billing Controller ─────────────────────────────────────────────────────
// HTTP layer for Stripe billing: webhook, checkout, portal, subscription, usage, plans.

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RouteNames } from '@common/route-names';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreatePortalDto } from './dto/create-portal.dto';
import { MembershipRepository } from '@db/repositories/healops/membership.repository';
import type { AuthUser } from '../auth/interfaces/auth-user.interface';

@Controller({ path: RouteNames.HEALOPS_BILLING, version: '1' })
@ApiTags('Billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  // ─── Webhook ────────────────────────────────────────────────────────────

  /**
   * Stripe webhook endpoint. Must be public (no JWT) and receive raw body.
   * Signature verification is handled by StripeProvider.constructWebhookEvent.
   */
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!signature) {
      throw new HttpException('Missing stripe-signature header', HttpStatus.BAD_REQUEST);
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new HttpException(
        'Raw body not available — rawBody must be enabled',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.billingService.handleWebhookRaw(rawBody, signature);

    return { received: true };
  }

  // ─── Checkout ───────────────────────────────────────────────────────────

  /**
   * Create a Stripe Checkout session for upgrading plans.
   */
  @Post('checkout')
  async createCheckout(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCheckoutDto,
  ) {
    const organizationId = await this.resolveOrganizationId(user);
    return this.billingService.createCheckoutSession(
      organizationId,
      dto.planSlug,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  // ─── Portal ─────────────────────────────────────────────────────────────

  /**
   * Create a Stripe Customer Portal session.
   */
  @Post('portal')
  async createPortal(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePortalDto,
  ) {
    const organizationId = await this.resolveOrganizationId(user);
    return this.billingService.createPortalSession(organizationId, dto.returnUrl);
  }

  // ─── Subscription ──────────────────────────────────────────────────────

  /**
   * Get the current subscription for the user's organization.
   */
  @Get('subscription')
  async getSubscription(@CurrentUser() user: AuthUser) {
    const organizationId = await this.resolveOrganizationId(user);
    return this.billingService.getOrCreateSubscription(organizationId);
  }

  // ─── Usage ──────────────────────────────────────────────────────────────

  /**
   * Get current usage statistics for the user's organization.
   */
  @Get('usage')
  async getUsage(@CurrentUser() user: AuthUser) {
    const organizationId = await this.resolveOrganizationId(user);
    return this.billingService.getUsageStats(organizationId);
  }

  // ─── Plans ──────────────────────────────────────────────────────────────

  /**
   * Get all available plans. Public endpoint.
   */
  @Get('plans')
  @Public()
  async getPlans() {
    return this.billingService.getAvailablePlans();
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Resolve the user's organization ID from their membership.
   * Uses the first organization the user belongs to.
   */
  private async resolveOrganizationId(user: AuthUser): Promise<string> {
    const memberships = await this.membershipRepository.findOrganizationsByUser(user.id);
    const firstMembership = memberships[0];
    if (!firstMembership) {
      throw new HttpException(
        'User does not belong to any organization',
        HttpStatus.FORBIDDEN,
      );
    }
    return firstMembership.organizationId;
  }
}
