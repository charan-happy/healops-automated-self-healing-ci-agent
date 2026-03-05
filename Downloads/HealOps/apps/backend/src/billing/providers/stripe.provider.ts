// ─── Stripe Provider ────────────────────────────────────────────────────────
// Wraps the Stripe SDK for checkout, portal, usage, and webhook operations.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeProvider {
  private readonly stripe: Stripe | null;
  private readonly logger = new Logger(StripeProvider.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get('STRIPE_SECRET_KEY');
    if (apiKey) {
      this.stripe = new Stripe(apiKey);
    } else {
      this.stripe = null;
      this.logger.warn('STRIPE_SECRET_KEY is not configured. Billing features will be unavailable.');
    }
  }

  private getStripe(): Stripe {
    if (!this.stripe) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.');
    }
    return this.stripe;
  }

  /**
   * Create a Stripe customer for an organization.
   */
  async createCustomer(
    email: string,
    name: string,
    metadata: Record<string, string>,
  ): Promise<Stripe.Customer> {
    this.logger.debug(`Creating Stripe customer for ${email}`);
    return this.getStripe().customers.create({ email, name, metadata });
  }

  /**
   * Create a Stripe Checkout session for plan upgrades.
   */
  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    paymentMethodTypes?: Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
  ): Promise<Stripe.Checkout.Session> {
    const params: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    };
    // When payment method types are specified (e.g. ['card', 'upi'] for INR prices),
    // pass them explicitly. Otherwise Stripe uses Dashboard-configured methods.
    if (paymentMethodTypes && paymentMethodTypes.length > 0) {
      params.payment_method_types = paymentMethodTypes;
    }
    return this.getStripe().checkout.sessions.create(params);
  }

  /**
   * Retrieve a Stripe Price to inspect its currency and metadata.
   */
  async retrievePrice(priceId: string): Promise<Stripe.Price> {
    return this.getStripe().prices.retrieve(priceId);
  }

  /**
   * Create a Stripe Billing Portal session for subscription management.
   */
  async createPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<Stripe.BillingPortal.Session> {
    return this.getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  /**
   * Report metered usage to Stripe via Billing Meter Events (Stripe v20+).
   * Requires a Billing Meter to be configured with the given event name.
   */
  async reportUsage(
    eventName: string,
    stripeCustomerId: string,
    value: number,
  ): Promise<void> {
    await this.getStripe().billing.meterEvents.create({
      event_name: eventName,
      payload: {
        stripe_customer_id: stripeCustomerId,
        value: String(value),
      },
      timestamp: Math.floor(Date.now() / 1000),
    });
    this.logger.debug(
      `Reported ${String(value)} usage units for meter event ${eventName} (customer ${stripeCustomerId})`,
    );
  }

  /**
   * Construct and verify a Stripe webhook event from a raw body and signature.
   */
  constructWebhookEvent(body: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get('STRIPE_WEBHOOK_SECRET') ?? '';
    return this.getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  }
}
