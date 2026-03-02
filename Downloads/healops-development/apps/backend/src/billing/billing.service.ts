// ─── Billing Service ────────────────────────────────────────────────────────
// Business logic for subscriptions, usage enforcement, and Stripe integration.

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BillingRepository } from '@db/repositories/healops/billing.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { StripeProvider } from './providers/stripe.provider';
import { PLAN_LIMITS, type PlanSlug, type UsageStats } from './interfaces/billing.interface';
import type Stripe from 'stripe';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly billingRepository: BillingRepository,
    private readonly platformRepository: PlatformRepository,
    private readonly stripeProvider: StripeProvider,
  ) {}

  // ─── Subscriptions ──────────────────────────────────────────────────────

  /**
   * Look up the active subscription for an organization.
   * If none exists, create a free plan subscription.
   */
  async getOrCreateSubscription(organizationId: string) {
    const existing = await this.billingRepository.findActiveSubscription(organizationId);
    if (existing) return existing;

    // Ensure the free plan exists in the database
    const freePlan = await this.billingRepository.findPlanBySlug('free');
    if (!freePlan) {
      throw new HttpException(
        'Free plan not configured. Please seed the plans table.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(`Creating free subscription for organization ${organizationId}`);

    return this.billingRepository.createSubscription({
      organizationId,
      planId: freePlan.id,
      status: 'active',
    });
  }

  // ─── Checkout ───────────────────────────────────────────────────────────

  /**
   * Create a Stripe Checkout session for upgrading to a paid plan.
   */
  async createCheckoutSession(
    organizationId: string,
    planSlug: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    const plan = await this.billingRepository.findPlanBySlug(planSlug);
    if (!plan) {
      throw new HttpException(`Plan "${planSlug}" not found`, HttpStatus.NOT_FOUND);
    }
    if (!plan.stripePriceId) {
      throw new HttpException(
        `Plan "${planSlug}" does not have a Stripe price configured`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Get or create a Stripe customer for this organization
    const subscription = await this.getOrCreateSubscription(organizationId);
    let stripeCustomerId = subscription.stripeCustomerId;

    if (!stripeCustomerId) {
      const org = await this.platformRepository.findOrganizationById(organizationId);
      if (!org) {
        throw new HttpException('Organization not found', HttpStatus.NOT_FOUND);
      }

      const customer = await this.stripeProvider.createCustomer(
        `billing@${org.slug}.healops.dev`,
        org.name,
        { organizationId, subscriptionId: subscription.id },
      );
      stripeCustomerId = customer.id;

      await this.billingRepository.updateSubscription(subscription.id, {
        stripeCustomerId: customer.id,
      });
    }

    const session = await this.stripeProvider.createCheckoutSession(
      stripeCustomerId ?? '',
      plan.stripePriceId,
      successUrl,
      cancelUrl,
    );

    return { url: session.url ?? '' };
  }

  // ─── Portal ─────────────────────────────────────────────────────────────

  /**
   * Create a Stripe Customer Portal session for managing subscriptions.
   */
  async createPortalSession(organizationId: string, returnUrl: string) {
    const subscription = await this.billingRepository.findActiveSubscription(organizationId);
    if (!subscription?.stripeCustomerId) {
      throw new HttpException(
        'No active Stripe subscription found. Please subscribe to a paid plan first.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const session = await this.stripeProvider.createPortalSession(
      subscription.stripeCustomerId,
      returnUrl,
    );

    return { url: session.url };
  }

  // ─── Webhook Handling ───────────────────────────────────────────────────

  /**
   * Construct a Stripe event from the raw body and signature, then handle it.
   */
  async handleWebhookRaw(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.stripeProvider.constructWebhookEvent(rawBody, signature);
    await this.handleWebhookEvent(event);
  }

  /**
   * Handle inbound Stripe webhook events.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    this.logger.log(`Handling Stripe webhook event: ${event.type} (${event.id})`);

    switch (event.type) {
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        this.logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    // Stripe v20+: subscription lives under invoice.parent.subscription_details
    const subDetail = invoice.parent?.subscription_details?.subscription ?? null;
    const stripeSubscriptionId =
      typeof subDetail === 'string'
        ? subDetail
        : subDetail?.id ?? null;

    if (!stripeSubscriptionId) return;

    const subscription =
      await this.billingRepository.findSubscriptionByStripeId(stripeSubscriptionId);
    if (!subscription) {
      this.logger.warn(`No local subscription found for Stripe subscription ${stripeSubscriptionId}`);
      return;
    }

    // Build invoice data, omitting optional fields when absent
    // (exactOptionalPropertyTypes forbids assigning undefined to optional nullable props)
    const invoiceData: Parameters<typeof this.billingRepository.createInvoice>[0] = {
      organizationId: subscription.organizationId,
      amountCents: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? 'usd',
      status: 'paid',
      paidAt: new Date(),
    };
    if (invoice.id) invoiceData.stripeInvoiceId = invoice.id;
    if (invoice.period_start) invoiceData.periodStart = new Date(invoice.period_start * 1000);
    if (invoice.period_end) invoiceData.periodEnd = new Date(invoice.period_end * 1000);
    if (invoice.hosted_invoice_url) invoiceData.hostedInvoiceUrl = invoice.hosted_invoice_url;
    if (invoice.invoice_pdf) invoiceData.pdfUrl = invoice.invoice_pdf;

    await this.billingRepository.createInvoice(invoiceData);

    this.logger.log(`Recorded paid invoice for organization ${subscription.organizationId}`);
  }

  private async handleSubscriptionUpdated(
    stripeSubscription: Stripe.Subscription,
  ): Promise<void> {
    const subscription = await this.billingRepository.findSubscriptionByStripeId(
      stripeSubscription.id,
    );
    if (!subscription) {
      this.logger.warn(
        `No local subscription found for Stripe subscription ${stripeSubscription.id}`,
      );
      return;
    }

    // Stripe v20+: current_period_start/end removed; use billing_cycle_anchor as period start
    await this.billingRepository.updateSubscription(subscription.id, {
      status: stripeSubscription.status,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
    });

    this.logger.log(
      `Updated subscription ${subscription.id} to status ${stripeSubscription.status}`,
    );
  }

  private async handleSubscriptionDeleted(
    stripeSubscription: Stripe.Subscription,
  ): Promise<void> {
    const subscription = await this.billingRepository.findSubscriptionByStripeId(
      stripeSubscription.id,
    );
    if (!subscription) {
      this.logger.warn(
        `No local subscription found for Stripe subscription ${stripeSubscription.id}`,
      );
      return;
    }

    await this.billingRepository.updateSubscription(subscription.id, {
      status: 'canceled',
    });

    this.logger.log(`Canceled subscription ${subscription.id}`);
  }

  // ─── Usage Enforcement ──────────────────────────────────────────────────

  /**
   * Check if the organization has exceeded its monthly job limit.
   * Throws 403 if the limit is reached.
   */
  async enforceJobLimit(organizationId: string): Promise<void> {
    const stats = await this.getUsageStats(organizationId);
    // -1 means unlimited
    if (stats.jobsLimit !== -1 && stats.jobsUsed >= stats.jobsLimit) {
      throw new HttpException(
        `Monthly job limit reached (${String(stats.jobsUsed)}/${String(stats.jobsLimit)}). Upgrade your plan for more capacity.`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * Check if the organization has exceeded its monthly token budget.
   * Throws 403 if the budget is exhausted.
   */
  async enforceTokenBudget(organizationId: string): Promise<void> {
    const stats = await this.getUsageStats(organizationId);
    // -1 means unlimited
    if (stats.tokensLimit !== -1 && stats.tokensUsed >= stats.tokensLimit) {
      throw new HttpException(
        `Monthly token budget exhausted (${String(stats.tokensUsed)}/${String(stats.tokensLimit)}). Upgrade your plan for more capacity.`,
        HttpStatus.FORBIDDEN,
      );
    }
  }

  // ─── Usage Recording ───────────────────────────────────────────────────

  /**
   * Record job usage after a repair job completes.
   */
  async recordJobUsage(organizationId: string, tokensDelta: number): Promise<void> {
    const subscription = await this.getOrCreateSubscription(organizationId);
    const periodMonth = this.getCurrentPeriodMonth();

    await this.billingRepository.upsertUsageRecord({
      organizationId,
      subscriptionId: subscription.id,
      periodMonth,
      jobsDelta: 1,
      tokensDelta,
    });

    this.logger.debug(
      `Recorded job usage for org ${organizationId}: +1 job, +${String(tokensDelta)} tokens`,
    );
  }

  // ─── Usage Stats ────────────────────────────────────────────────────────

  /**
   * Return the current usage vs limits for an organization.
   */
  async getUsageStats(organizationId: string): Promise<UsageStats> {
    const subscription = await this.getOrCreateSubscription(organizationId);
    const periodMonth = this.getCurrentPeriodMonth();
    const usage = await this.billingRepository.findCurrentUsage(organizationId, periodMonth);

    // Resolve the plan associated with this subscription
    let planSlug = 'free';
    let jobsLimit: number = PLAN_LIMITS.free.monthlyJobs;
    let tokensLimit: number = PLAN_LIMITS.free.monthlyTokenBudget;

    if (subscription.planId) {
      const activePlans = await this.billingRepository.findActivePlans();
      const matchedPlan = activePlans.find((p) => p.id === subscription.planId);
      if (matchedPlan) {
        planSlug = matchedPlan.slug;
        // Use DB-stored limits, fallback to PLAN_LIMITS constants
        const constantLimits = PLAN_LIMITS[planSlug as PlanSlug] ?? PLAN_LIMITS.free;
        jobsLimit = matchedPlan.monthlyJobLimit ?? constantLimits.monthlyJobs;
        tokensLimit = matchedPlan.monthlyTokenBudget ?? constantLimits.monthlyTokenBudget;
      }
    }

    return {
      organizationId,
      periodMonth,
      jobsUsed: usage?.jobsUsed ?? 0,
      jobsLimit,
      tokensUsed: usage?.tokensUsed ?? 0,
      tokensLimit,
      planSlug,
    };
  }

  // ─── Plans ──────────────────────────────────────────────────────────────

  /**
   * Return all active plans.
   */
  async getAvailablePlans() {
    return this.billingRepository.findActivePlans();
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Get the current billing period month as YYYY-MM-01.
   */
  private getCurrentPeriodMonth(): string {
    return new Date().toISOString().slice(0, 7) + '-01';
  }
}
