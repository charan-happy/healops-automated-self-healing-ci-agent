// ─── Billing Module ─────────────────────────────────────────────────────────
// Stripe billing: subscriptions, checkout, portal, usage enforcement, webhooks.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { StripeProvider } from './providers/stripe.provider';

@Module({
  imports: [ConfigModule],
  controllers: [BillingController],
  providers: [BillingService, StripeProvider],
  exports: [BillingService],
})
export class BillingModule {}
